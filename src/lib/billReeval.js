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

// Deleting a bill demands strictly stronger evidence than creating one (MIN_BILL_OCCURRENCES = 3).
//
// The detector's cadence test compares the MEAN visible gap against a band, and a mean is not
// monotone under history truncation: a transaction fetch is capped at 90 days, so a long-running
// monthly bill can show only its last three occurrences, and the mean of those two gaps can fall
// outside the band even though the full history sat comfortably inside it. An adversarial sweep
// measured 3.8% of bills accepted on full history being rejected on the 90-day view.
//
// A bar of 5 makes that unreachable for exactly the bills at risk: within a 90-day window a monthly
// bill can only ever show ~3 occurrences, so it is never judged at all — while the frequent
// discretionary spend that produces phantom bills (groceries, fuel, warehouse trips) clears 5
// easily and is still healed. The bar separates the two populations rather than trading them off.
export const MIN_OCCURRENCES_TO_JUDGE = 5;

// Evidence per canonical merchant key, measured over the DETECTOR'S OWN grouping.
//
// This takes grouped transactions (groupByMerchant), not a flat list, and that is load-bearing.
// The detector groups on the raw lowercased name and applies its occurrence gate per raw group;
// merchantKey deliberately canonicalises further (account numbers, POS prefixes). Counting a flat
// list through merchantKey would merge variants the detector keeps apart — four rows split as
// "netflix.com" x2 and "pos netflix.com" x2 are two sub-threshold groups the detector skips, but
// would pool into one count of 4 here. The bill would clear the evidence bar with nothing having
// disqualified it, and be deleted.
//
// Taking the MAX across variants asks the right question: did any single group the detector
// actually evaluated carry enough occurrences to judge this merchant?
export function merchantEvidence(byMerchant) {
  const out = new Map();
  Object.entries(byMerchant || {}).forEach(([rawKey, list]) => {
    const k = merchantKey(rawKey);
    if (!k) return;
    const n = Array.isArray(list) ? list.length : 0;
    out.set(k, Math.max(out.get(k) || 0, n));
  });
  return out;
}

// Filter `prevBills`, dropping auto-detected bills the current rules positively disqualify.
//
//   occurrences    Map (or plain object) of canonical merchant key -> occurrence count
//   qualified      the canonical keys the current detector DID accept
//   minOccurrences evidence bar — below this the merchant is not judged at all
//
// Returns { bills, removed }. `bills` preserves input order and object identity.
export function pruneDisqualifiedBills(prevBills, opts = {}) {
  const prev = Array.isArray(prevBills) ? prevBills : [];
  const { occurrences = new Map(), qualified = [], minOccurrences = MIN_OCCURRENCES_TO_JUDGE } = opts;

  // Own properties only, and only finite numbers. A bare `occurrences[k]` reads Object.prototype,
  // so a merchant named "Constructor" resolved to the Object constructor — truthy, and
  // `function < 5` is NaN-false, so the bill cleared the evidence bar against an EMPTY map and was
  // deleted with no evidence at all. Today's only caller passes a Map, but this function's whole
  // job is deciding whether to delete a user's record; it must not have a shape that can say
  // "enough evidence" when there is none.
  const countOf = (k) => {
    const raw = occurrences instanceof Map
      ? occurrences.get(k)
      : (Object.prototype.hasOwnProperty.call(occurrences || {}, k) ? occurrences[k] : 0);
    return Number.isFinite(raw) ? raw : 0;
  };
  const qual = qualified instanceof Set ? qualified : new Set(qualified || []);

  const removed = [];
  const bills = prev.filter(b => {
    if (!isAutoDetectedBill(b)) return true;              // user-owned — never judged
    const k = merchantKey(b.name);
    if (!k) return true;                                  // unnameable — leave alone
    if (countOf(k) < minOccurrences) return true;         // not enough evidence to judge
    if (qual.has(k)) return true;                         // still a bill under current rules
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
