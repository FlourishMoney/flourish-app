// Remove auto-detected bills that the CURRENT rules positively disqualify.
//
// ── the problem ──────────────────────────────────────────────────────────────────────────────────
// Bills detected under older, looser rules were written into appData.bills and then never
// re-examined. Two independent locks made that permanent:
//
//   1. detectRecurringBills has a single call site, inside the post-onboarding sync, and that
//      effect early-returns on `transactions.length > 0`. Once transactions existed, detection
//      stopped running at all.
//   2. Even when it did run, the sync adopted the detected set only when the user had NO named
//      bill — `(!prev.bills?.some(b => b.name))`. After the first adoption, the stored list won.
//
// Either lock alone is sufficient, so tightening the detector could not remove what the loose
// detector had already stored: a one-off grocery run stayed an "Upcoming Bill" indefinitely,
// inflating Due Soon and driving Safe-to-Spend to zero.
//
// ── why this deletes on POSITIVE DISQUALIFICATION only ───────────────────────────────────────────
// The obvious implementation — re-run detection and replace the auto-detected set with the result —
// is unsafe, and an adversarial audit reproduced three separate ways it destroys real data. The
// root error is treating "not currently re-detectable" as "not a bill". appData.transactions is NOT
// a faithful mirror of history:
//
//   • buildDbBlob (src/lib/persistence.js) STRIPS every Plaid-refetchable transaction from the DB
//     blob by design, keeping only manual/statement rows. After a hydrate, bills is the full stored
//     set while transactions is a handful of residue rows — or none.
//   • removeAccount (src/App.jsx) drops one account's transactions but leaves its bills.
//   • a refetch is capped at 90 days, so history is routinely shorter than what produced a bill.
//
// So absence of evidence is not evidence of absence, and a bill is deleted here ONLY when the
// current transactions contain enough occurrences of that merchant to actually judge it AND the
// current rules reject it. Below that bar nothing happens.
//
// This module never rewrites or re-adds a bill — it is a pure filter. That is load-bearing:
// surviving bills keep their stored amount (including an amount the user typed directly, which
// Settings ▸ Bills writes to appData.bills without recording an override), their nextDueDate
// cadence anchor, any extra user-authored fields, and their position in the array.
//
// ── what is eligible to be judged ────────────────────────────────────────────────────────────────
// Only bills carrying the explicit stamp detectRecurringBills writes (`auto:true` /
// `origin:"observed"`). Bills typed during onboarding are plain {name, amount, date} objects with
// NEITHER field, so a looser test such as `origin !== "manual"` would silently delete them.

import { stripPosPrefix } from "./plaidNormalize.js";

export const isAutoDetectedBill = (b) => !!b && (b.auto === true || b.origin === "observed");

// Canonical merchant identity, applied to BOTH a stored bill's display name and a transaction's raw
// name so the two match despite formatting drift. The detector's display name has changed shape
// over time (POS-prefix stripping and a title-case fix turned "Fpos Reid'S Dairy Company" into
// "Reid's Dairy Company"); stripping the prefix on both sides makes an old stored name still
// resolve to the same merchant, so a phantom stored under the old spelling is still judged.
// The account-number strip and the POS strip must be applied in the SAME ORDER the detector uses to
// build its display name (plaidNormalize.js: `stripPosPrefix(name.replace(/\s+\d{4,}.*$/, "")…)`).
// Skipping the account-number strip here would key a raw transaction "HYDRO ONE 123456789" as
// "hydro one 123456789" while the stored bill "Hydro One" keys as "hydro one" — the merchant would
// then never reach the evidence bar and could never be healed.
export function merchantKey(name) {
  const withoutAcct = String(name == null ? "" : name).replace(/\s+\d{4,}.*$/, "").trim();
  return stripPosPrefix(withoutAcct)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Two occurrences are the minimum from which an amount spread can be computed at all.
//
// This is NOT a proxy for "enough history to judge" — that framing is what the previous, higher bar
// tried and failed to express. A count bar cannot tell the difference between the detector's four
// rejection reasons, so it had to be set high enough to suppress the least trustworthy one
// (cadence), which in a 90-day window meant almost nothing was ever judged. Healing now asks the
// spread question directly, so the count only has to be large enough for a spread to exist.
export const MIN_OCCURRENCES_TO_JUDGE = 2;

// Collapse the detector's per-raw-key spread verdicts onto canonical merchant keys.
//
// A merchant's descriptor varies across rows ("NETFLIX.COM" / "POS NETFLIX.COM" / "HYDRO ONE 1002"),
// so the detector's raw grouping can hold several variants of one merchant. A bill is treated as
// spread-rejected only when EVERY variant carrying enough rows to measure is rejected: if any
// variant looks like a bill, the merchant keeps the benefit of the doubt. Ties are broken toward
// keeping the bill, which is the direction that cannot lose a user's data.
//
// `n` and `spread` are carried through for the diagnostic, taken from the largest variant — the
// one the detector was most likely to have judged.
export function mergeSpreadVerdicts(rawVerdicts, minOccurrences = MIN_OCCURRENCES_TO_JUDGE) {
  const out = new Map();
  const src = rawVerdicts instanceof Map ? rawVerdicts : new Map(Object.entries(rawVerdicts || {}));
  src.forEach((v, rawKey) => {
    if (!v || v.n < minOccurrences) return;                 // too few rows to measure — no verdict
    const k = merchantKey(rawKey);
    if (!k) return;
    const prev = out.get(k);
    if (!prev) { out.set(k, { ...v }); return; }
    out.set(k, {
      n:        Math.max(prev.n, v.n),
      spread:   v.n >= prev.n ? v.spread : prev.spread,      // report the largest variant's figure
      limit:    v.n >= prev.n ? v.limit  : prev.limit,
      isKeyword: prev.isKeyword || v.isKeyword,
      rejected: prev.rejected && v.rejected,                 // ALL variants must reject
    });
  });
  return out;
}

// Filter `prevBills`, dropping auto-detected bills whose merchant's amounts are too erratic to be
// a bill under the current spread bound.
//
//   verdicts  Map of canonical merchant key -> { n, spread, limit, rejected }
//             (mergeSpreadVerdicts over billSpreadVerdicts — the detector's own bound)
//
// A bill is dropped ONLY on a rejected verdict. No verdict — the merchant is absent from the
// current transactions, or has too few rows to measure — means no change, which is what makes the
// slim DB blob, a disconnected account and a 90-day fetch cap all harmless here.
//
// Returns { bills, removed }. `bills` preserves input order and object identity.
export function pruneDisqualifiedBills(prevBills, opts = {}) {
  const prev = Array.isArray(prevBills) ? prevBills : [];
  const { verdicts = new Map() } = opts;

  // Own properties only. A bare `verdicts[k]` reads Object.prototype, so a merchant named
  // "Constructor" resolved to the Object constructor — truthy, and `.rejected` on it is undefined,
  // which happens to be safe, but the shape must not be able to manufacture a verdict at all.
  const verdictOf = (k) => {
    const v = verdicts instanceof Map
      ? verdicts.get(k)
      : (Object.prototype.hasOwnProperty.call(verdicts || {}, k) ? verdicts[k] : null);
    return v && typeof v === "object" ? v : null;
  };

  const removed = [];
  const bills = prev.filter(b => {
    if (!isAutoDetectedBill(b)) return true;              // user-owned — never judged
    const k = merchantKey(b.name);
    if (!k) return true;                                  // unnameable — leave alone
    const v = verdictOf(k);
    if (!v || v.rejected !== true) return true;           // no positive rejection → keep
    removed.push(b);
    return false;
  });

  return { bills, removed };
}

// Convenience identity of the auto-detected set, used by the caller to decide whether anything
// actually needs writing.
export function autoBillKeys(bills) {
  return (Array.isArray(bills) ? bills : [])
    .filter(isAutoDetectedBill)
    .map(b => merchantKey(b.name))
    .sort()
    .join("|");
}
