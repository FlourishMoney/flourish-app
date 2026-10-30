// src/lib/household.js
// -----------------------------------------------------------------------------
// COUPLE MODE (v1), the app's half: docs/product/COUPLE-MODE-SPEC.md. PURE: no React, no storage, no network.
//
// Two adults share one household. Their shared plan lives in ONE blob (public.household_data, migration 0030)
// instead of each person's own user_data row:
//   core      onboarded, checkInBonus and appData (transactions manual-only, as in user_data)
//   sideKeys  the SHARED allow-listed flourish_* keys (categories, corrections, kids, streak)
// Each person's PERSONAL keys (PERSONAL_SIDE_KEYS: the AI and Plaid consent, the plan cache, the tips) are never in
// it: they live in that person's own row of public.household_member_private, which only they can read or write
// (audit H3). The database also takes them out of every write to the shared blob, whoever makes it.
//
// SAVING: the app saves only over the version it read (household_data.version). When the other person saved in
// between, mergeHouseholdBlobs keeps both: a section only one of them changed keeps that change; a section both
// changed takes this device's (the later save). Sections are appData's top-level keys and each side key. A bank
// account the other side removed stays removed, with what was made from it (stripAccounts), whatever this
// device changed meanwhile (audit M7).
// -----------------------------------------------------------------------------

export const HOUSEHOLD_STAMP_KEY = "flourish_household"; // the household this device's local data belongs to
export const HOUSEHOLD_INVITE_KEY = "flourish_household_invite"; // a link's token while the person signs in (sessionStorage)

// Each person's own: the AI choices and their audit times, the plan cache, the Plaid consent time, the tips they
// dismissed. The same list as migration 0030's household_personal_keys() (a test holds the two together).
export const PERSONAL_SIDE_KEYS = Object.freeze([
  "flourish_plan",
  "flourish_trial_started_at",
  "flourish_ai_disclosure_seen",
  "flourish_ai_disclosed_at",
  "flourish_ai_coach_enabled",
  "flourish_ai_third_party_consent",
  "flourish_plaid_consented_at",
  "flourish_tips_dismissed",
]);
const isPersonal = (k) => PERSONAL_SIDE_KEYS.includes(k);

export function splitSideKeys(sideKeys) {
  const shared = {}, personal = {};
  for (const [k, v] of Object.entries(sideKeys || {})) (isPersonal(k) ? personal : shared)[k] = v;
  return { shared, personal };
}

// This person's own keys, as kept in their private row (anything else in it is ignored).
export function personalKeysOf(sideKeys) {
  return splitSideKeys(sideKeys).personal;
}
// The shared keys in a household blob. Never a personal key, even if one were ever written into it.
export function sharedSideKeysOf(blob) {
  return splitSideKeys(blob && blob.sideKeys).shared;
}

// The keys to write to localStorage when this person loads the household: the shared ones from the blob and
// their own from their private row (persistence.js fetchPersonalKeys), never the other person's.
export function sideKeysForMember(blob, personalRow) {
  return { ...sharedSideKeysOf(blob), ...personalKeysOf(personalRow) };
}

// The household blob this device saves. `slimAppData` is appData with transactions already manual-only
// (persistence.js manualTransactions); `sideKeys` is readSideKeys(), of which only the shared keys go in.
export function buildHouseholdBlob({ onboarded = false, slimAppData = null, checkInBonus = 0 } = {}, { householdId, nowIso = null, sideKeys = {}, schemaVersion = 1 } = {}) {
  return {
    schemaVersion,
    savedAt: nowIso,
    householdId: householdId || null,
    core: { onboarded, checkInBonus, appData: slimAppData },
    sideKeys: splitSideKeys(sideKeys).shared,
  };
}

// ── A BANK ACCOUNT LEAVES THE HOUSEHOLD (audit M7) ────────────────────────────────────────────────────────────
// The same rules as migration 0031's household_strip_member_banks, for the ids of accounts already gone: the
// accounts, the transactions, liabilities and investments on them, the debts made from them and every link to
// those debts or accounts, and the cached pay suggestion; bankConnected is worked out again. Pure; a new object.
const LOCAL_KINDS = new Set(["", "manual", "statement"]);
const isBankAccount = (a) => !!a && (!!a._item || !LOCAL_KINDS.has(String(a.institution || "").toLowerCase()));
const dropBy = (list, field, ids) => (Array.isArray(list)
  ? list.filter((e) => !(e && typeof e === "object" && !Array.isArray(e) && ids.has(String(e[field] ?? ""))))
  : list);
export function stripAccounts(appData, accountIds) {
  const gone = new Set((accountIds || []).map(String).filter(Boolean));
  if (!appData || typeof appData !== "object" || gone.size === 0) return appData;
  const ad = { ...appData };
  const debtKeys = new Set((Array.isArray(ad.debts) ? ad.debts : [])
    .filter((d) => d && gone.has(String(d.account_id ?? ""))).map((d) => String(d.id || d.account_id)));
  if ("accounts" in ad) ad.accounts = dropBy(ad.accounts, "id", gone);
  if ("transactions" in ad) ad.transactions = dropBy(ad.transactions, "account_id", gone);
  if ("investments" in ad) ad.investments = dropBy(ad.investments, "account_id", gone);
  if (Array.isArray(ad.liabilities)) ad.liabilities = dropBy(ad.liabilities, "account_id", gone);
  else if (ad.liabilities && typeof ad.liabilities === "object") {
    ad.liabilities = Object.fromEntries(Object.entries(ad.liabilities).map(([k, v]) => [k, dropBy(v, "account_id", gone)]));
  }
  if (Array.isArray(ad.debts)) {
    ad.debts = dropBy(ad.debts, "account_id", gone).map((d) => {
      if (!d || typeof d !== "object" || !gone.has(String(d.sameAsAccountId ?? ""))) return d;
      const { sameAsAccountId, ...rest } = d; return rest;
    });
  }
  if (Array.isArray(ad.debtLinkDismissed)) {
    ad.debtLinkDismissed = ad.debtLinkDismissed.filter((k) => {
      if (typeof k !== "string") return true;
      const [debt, account = ""] = k.split("|");
      return !(gone.has(account) || debtKeys.has(debt));
    });
  }
  if (Array.isArray(ad.bills)) {
    ad.bills = ad.bills.map((b) => {
      if (!b || typeof b !== "object" || !(debtKeys.has(String(b.debtId ?? "")) || gone.has(String(b.debtId ?? "")))) return b;
      const { debtId, ...rest } = b; return rest;
    });
  }
  delete ad.incomeSuggestion;
  if ("bankConnected" in ad) ad.bankConnected = (Array.isArray(ad.accounts) ? ad.accounts : []).some(isBankAccount);
  return ad;
}

// The bank accounts the other side removed: in what this device last read or wrote (base), gone from what the
// server holds now (remote).
export function removedAccountIds(base, remote) {
  const ids = (b) => (Array.isArray(b?.core?.appData?.accounts) ? b.core.appData.accounts : []).filter((a) => a && a.id != null).map((a) => String(a.id));
  const now = new Set(ids(remote));
  return ids(base).filter((id) => !now.has(id));
}

// What THIS device keeps outside the blob, after accounts left: the net-worth history (monthly totals that
// counted them: started again), the loan activity on them, and the category corrections and deposit answers
// keyed by the bank transactions of theirs this device holds (`gone` transaction ids). Pure.
export function localAfterRemoval({ catOverrides = null, depositDecisions = null, loanActivity = null } = {}, { accountIds = [], transactionIds = [] } = {}) {
  const acct = new Set(accountIds.map(String));
  const txn = new Set(transactionIds.map(String));
  const without = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !txn.has(k))) : o);
  return {
    nwHistory: acct.size ? [] : null,
    catOverrides: without(catOverrides),
    depositDecisions: without(depositDecisions),
    loanActivity: Array.isArray(loanActivity) ? loanActivity.filter((t) => !(t && acct.has(String(t.account_id ?? "")))) : loanActivity,
  };
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
function mergeSection(base, local, remote) {
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {}), ...Object.keys(base || {})]);
  const out = {};
  for (const k of keys) {
    const b = base ? base[k] : undefined, l = local ? local[k] : undefined, r = remote ? remote[k] : undefined;
    const v = same(l, b) ? r : l;   // only the other side changed it: theirs; this side changed it: ours
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Three-way merge of whole household blobs: `base` is what this device last read or wrote, `local` what it wants
// to save now, `remote` what the server holds now. Pure; returns a new blob. Never carries a personal key.
export function mergeHouseholdBlobs(base, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const B = base || {}, L = local, R = remote;
  const merged = (L.core?.appData == null || R.core?.appData == null)
    ? (L.core?.appData ?? R.core?.appData ?? null)
    : mergeSection(B.core?.appData || {}, L.core.appData, R.core.appData);
  // A bank account removed on the other side (the other member disconnected it, or left and took it) stays gone,
  // and so does everything made from it, even where this device changed that section meanwhile.
  const appData = stripAccounts(merged, removedAccountIds(B, R));
  const pick = (k) => (same(L.core?.[k], B.core?.[k]) ? R.core?.[k] : L.core?.[k]);
  const { personal: _l, ...lRest } = L;
  const { personal: _r, ...rRest } = R;
  return {
    ...rRest,
    ...lRest,
    core: { onboarded: !!(pick("onboarded")), checkInBonus: pick("checkInBonus") || 0, appData },
    sideKeys: splitSideKeys(mergeSection(B.sideKeys || {}, L.sideKeys || {}, R.sideKeys || {})).shared,
  };
}

// Which data this device should load, from what the server says about membership and what this device last
// belonged to (HOUSEHOLD_STAMP_KEY):
//   "solo"  not in a household, and this device was not either: user_data, exactly as before
//   "same"  in the household this device already holds: the household blob, the usual newer-wins decision
//   "join"  in a household this device does not hold (just joined, or another phone): drop this device's data
//           and load the household's, never push this device's data over it
//   "left"  this device held a household its person is no longer in (left, or removed): wipe it, start again
export function householdHydratePlan({ membership, stampId }) {
  const hid = membership && membership.household_id;
  if (hid) return stampId === hid ? "same" : "join";
  return stampId ? "left" : "solo";
}

// The coach sees roles, never names. Its profile is written from the owner's side ("you" is the owner, "partner"
// the other), so when the partner asks, the two are swapped: their own employment is "you", the owner's is
// "your partner". Only the owner's birth year is ever entered, so it is not the partner's age. The names stay
// only so coachPrivacy can turn them back into roles if they appear in what the person types.
export function coachProfileFor(profile, viewerRole) {
  const p = profile || {};
  if (viewerRole !== "partner") return p;
  return {
    ...p,
    name: p.partnerName || "",
    partnerName: p.name || "partner",
    lifeStages: Array.isArray(p.partnerLifeStages) ? p.partnerLifeStages : [],
    partnerLifeStages: Array.isArray(p.lifeStages) ? p.lifeStages : [],
    birthYear: "",
  };
}

// The name of the person using the app: the profile is written from the owner's side, so the partner's own
// name is its partnerName. Empty when it was never entered (the screen then says "there").
export function viewerName(profile, viewerRole) {
  const p = profile || {};
  return String((viewerRole === "partner" ? p.partnerName : p.name) || "").trim();
}

// A link's token from the address bar (?household_invite=…), or null. Only a token of the shape the server
// makes (43 base64url characters) is kept.
export function inviteTokenFromSearch(search) {
  try {
    const t = new URLSearchParams(search || "").get("household_invite");
    return t && /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
  } catch { return null; }
}

// A link's token, kept for this tab only while the person signs in (never in localStorage, never synced).
const session = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
export function rememberInviteToken(t) { try { session()?.setItem(HOUSEHOLD_INVITE_KEY, t); } catch {} }
export function recallInviteToken() { try { return inviteTokenFromSearch(`?household_invite=${session()?.getItem(HOUSEHOLD_INVITE_KEY) || ""}`); } catch { return null; } }
export function forgetInviteToken() { try { session()?.removeItem(HOUSEHOLD_INVITE_KEY); } catch {} }

// What the person typed as the code: capitals, letters and digits only ("abc-234" → "ABC234").
export function normalizeInviteCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

// A household blob carries only manual transactions (as user_data does); the bank's are fetched again from Plaid.
// When this device applies the other person's changes mid-session, it keeps the bank transactions it already
// holds, for accounts that are still in the household, so nothing blinks out until the next sync.
export function keepSyncedTransactions(next, prev) {
  if (!next || !prev || !Array.isArray(prev.transactions)) return next;
  const banked = new Set((prev.accounts || [])
    .filter((a) => a && (a._item || (a.institution && !["Manual", "Statement"].includes(a.institution)))).map((a) => a.id));
  const still = new Set((next.accounts || []).map((a) => a && a.id));
  const incoming = Array.isArray(next.transactions) ? next.transactions : [];
  const ids = new Set(incoming.map((t) => t && t.id).filter(Boolean));
  const synced = prev.transactions.filter((t) => t && banked.has(t.account_id) && still.has(t.account_id) && !ids.has(t.id));
  return { ...next, transactions: [...synced, ...incoming] };
}
