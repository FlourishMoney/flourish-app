// src/lib/household.js
// -----------------------------------------------------------------------------
// COUPLE MODE (v1), the app's half: docs/product/COUPLE-MODE-SPEC.md. PURE: no React, no storage, no network.
//
// Two adults share one household. Their shared plan lives in ONE blob (public.household_data, migration 0030)
// instead of each person's own user_data row:
//   core      onboarded, checkInBonus and appData (transactions manual-only, as in user_data)
//   sideKeys  the SHARED allow-listed flourish_* keys (categories, corrections, kids, streak, tips)
//   personal  { [user_id]: the PERSONAL keys } — consent is each person's own: one person's yes to the AI coach,
//             to Anthropic or to Plaid never stands for the other's
//
// A blob copied from the owner's user_data when the household was made has no `personal` section yet: its
// personal keys sit in sideKeys, with userId the owner's. personalSideKeysOf reads both shapes, so nothing has
// to be rewritten on the server.
//
// SAVING: the app saves only over the version it read (household_data.version). When the other person saved in
// between, mergeHouseholdBlobs keeps both: a section only one of them changed keeps that change; a section both
// changed takes this device's (the later save). Sections are appData's top-level keys and each side key.
// -----------------------------------------------------------------------------

export const HOUSEHOLD_STAMP_KEY = "flourish_household"; // the household this device's local data belongs to
export const HOUSEHOLD_INVITE_KEY = "flourish_household_invite"; // a link's token while the person signs in (sessionStorage)

// Each person's own: the AI choices and their audit times, the plan cache, the Plaid consent time.
export const PERSONAL_SIDE_KEYS = Object.freeze([
  "flourish_plan",
  "flourish_trial_started_at",
  "flourish_ai_disclosure_seen",
  "flourish_ai_disclosed_at",
  "flourish_ai_coach_enabled",
  "flourish_ai_third_party_consent",
  "flourish_plaid_consented_at",
]);
const isPersonal = (k) => PERSONAL_SIDE_KEYS.includes(k);

export function splitSideKeys(sideKeys) {
  const shared = {}, personal = {};
  for (const [k, v] of Object.entries(sideKeys || {})) (isPersonal(k) ? personal : shared)[k] = v;
  return { shared, personal };
}

// This person's own keys from a household blob (either shape, see the header).
export function personalSideKeysOf(blob, userId) {
  if (!blob || !userId) return {};
  const mine = blob.personal && blob.personal[userId];
  if (mine && typeof mine === "object") return { ...mine };
  if (blob.userId === userId) return splitSideKeys(blob.sideKeys).personal;   // copied from the owner's own row
  return {};
}
export function sharedSideKeysOf(blob) {
  return splitSideKeys(blob && blob.sideKeys).shared;
}

// The keys to write to localStorage when this person loads the household: the shared ones and their own.
export function sideKeysForMember(blob, userId) {
  return { ...sharedSideKeysOf(blob), ...personalSideKeysOf(blob, userId) };
}

// The household blob this device saves. `slimAppData` is appData with transactions already manual-only
// (persistence.js manualTransactions); `sideKeys` is readSideKeys(). The other person's personal section is
// carried over from `base` untouched.
export function buildHouseholdBlob({ onboarded = false, slimAppData = null, checkInBonus = 0 } = {}, { userId, householdId, nowIso = null, sideKeys = {}, base = null, schemaVersion = 1 } = {}) {
  const { shared, personal } = splitSideKeys(sideKeys);
  const others = {};
  const basePersonal = (base && base.personal) || {};
  for (const [id, keys] of Object.entries(basePersonal)) if (id !== userId) others[id] = keys;
  // A blob still in the copied shape: the owner's personal keys move into their own section.
  if (base && !base.personal && base.userId && base.userId !== userId) others[base.userId] = splitSideKeys(base.sideKeys).personal;
  return {
    schemaVersion,
    savedAt: nowIso,
    householdId: householdId || null,
    core: { onboarded, checkInBonus, appData: slimAppData },
    sideKeys: shared,
    personal: { ...others, [userId]: personal },
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
// to save now, `remote` what the server holds now. Pure; returns a new blob.
export function mergeHouseholdBlobs(base, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const B = base || {}, L = local, R = remote;
  const appData = (L.core?.appData == null || R.core?.appData == null)
    ? (L.core?.appData ?? R.core?.appData ?? null)
    : mergeSection(B.core?.appData || {}, L.core.appData, R.core.appData);
  const pick = (k) => (same(L.core?.[k], B.core?.[k]) ? R.core?.[k] : L.core?.[k]);
  const personal = {};
  const ids = new Set([...Object.keys(L.personal || {}), ...Object.keys(R.personal || {})]);
  for (const id of ids) personal[id] = mergeSection(B.personal?.[id] || {}, L.personal?.[id] || {}, R.personal?.[id] || {});
  return {
    ...R,
    ...L,
    core: { onboarded: !!(pick("onboarded")), checkInBonus: pick("checkInBonus") || 0, appData },
    sideKeys: mergeSection(B.sideKeys || {}, L.sideKeys || {}, R.sideKeys || {}),
    personal,
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
