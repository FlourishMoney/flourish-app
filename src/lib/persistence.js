// src/lib/persistence.js
// -----------------------------------------------------------------------------
// Flourish — authenticated-user cloud persistence helpers (Sprint 2).
//
// TWO-TIER MODEL: anonymous users stay localStorage-only. Authenticated users get
// localStorage (instant cache + offline floor) PLUS Supabase (canonical source of truth).
//
// These helpers are PURE — they hold no Supabase client. The caller injects one in the
// save/hydrate layers (commits 2-3). That keeps this file dependency-free and unit-testable.
//
// WHAT SYNCS TO THE DB BLOB
//   core:     onboarded, household, isPremium (UI cache only — NOT an entitlement),
//             checkInBonus, and appData with transactions reduced to MANUAL ONLY
//             (Plaid txns re-fetch via backgroundRefresh, so persisting them is waste).
//   sideKeys: an ALLOW-LISTed subset of flourish_* localStorage keys.
//
// WHAT NEVER SYNCS
//   - flourish_coach_history  → privacy promise ("no conversation history stored server-side")
//   - flourish_plaid_token*   → secrets (tokens live server-side in plaid_items only)
//   - device-only UX flags    → last_refresh, dash_tab, tour/visit/disclosure flags, etc.
//   The allow-list guarantees a NEW localStorage key cannot leave the device unless a
//   reviewer explicitly adds it here.
//
// NOTE: localStorage (flourish_v1) keeps the FULL appData (all transactions) as the local
// cache. The manual-only transaction trim applies ONLY to the DB blob (size/cost).
// -----------------------------------------------------------------------------

export const PERSIST_SCHEMA_VERSION = 1;
export const STAMP_KEY = "flourish_uid"; // localStorage stamp for shared-device safety (commit 4)

// Side localStorage keys that ARE user data and should sync (exact allow-list).
const SIDE_KEYS = [
  "flourish_custom_cats",      // custom budget categories
  "flourish_cat_overrides",    // per-txn category recategorizations / budget targets
  "flourish_kids",             // kids-zone roster
  "flourish_streak",           // check-in streak
  "flourish_plan",             // UI cache only (real entitlement = future profiles table)
  "flourish_trial_started_at", // trial state
  "flourish_ai_disclosure_seen", // Apple 5.1.2(i) AI disclosure acknowledged (cross-device)
  "flourish_ai_disclosed_at",    // timestamp of the AI-disclosure choice (audit trail)
  "flourish_ai_coach_enabled",   // AI on/off choice (synced so it persists across devices)
  "flourish_plaid_consented_at", // Apple 5.1.1 bank-data consent timestamp (cross-device, see-once)
];
// Per-kid dynamic keys (chores / data / theme) share this prefix.
const SIDE_KEY_PREFIX = "flourish_kid_";

function isSideKey(k) {
  return SIDE_KEYS.includes(k) || k.startsWith(SIDE_KEY_PREFIX);
}

// Transactions that CANNOT be re-fetched from Plaid (manual / statement / manual-account).
// A txn is Plaid-refetchable only if its account_id belongs to an item-backed bank account.
export function manualTransactions(transactions = [], accounts = []) {
  const plaidAcctIds = new Set(
    (accounts || [])
      .filter(a => a && (a._item || (a.institution && !["Manual", "Statement"].includes(a.institution))))
      .map(a => a.id)
  );
  return (transactions || []).filter(t => !t || !plaidAcctIds.has(t.account_id));
}

// Read the allow-listed side keys from localStorage into a plain object (raw strings).
export function readSideKeys() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isSideKey(k)) out[k] = localStorage.getItem(k);
    }
  } catch {}
  return out;
}

// Scatter side keys back to localStorage (used on hydrate, commit 3). Allow-list enforced again.
export function writeSideKeys(sideKeys) {
  if (!sideKeys || typeof sideKeys !== "object") return;
  try {
    for (const [k, v] of Object.entries(sideKeys)) {
      if (v != null && isSideKey(k)) localStorage.setItem(k, v);
    }
  } catch {}
}

// Shared-device safety (Tier 2.8 / Sprint 2 commit 4): wipe ALL flourish_* keys when a
// DIFFERENT user signs in on the same device. More aggressive than the sync allow-list on
// purpose — this also clears coach history and device flags so user B starts truly fresh.
export function clearAllUserLocal() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("flourish_")) keys.push(k);
    }
    keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
}

// Build the canonical DB blob from React state + localStorage side keys.
// `nowIso` is injected (callers pass new Date().toISOString()) to keep this function pure.
export function buildDbBlob(state, { userId = null, nowIso = null } = {}) {
  const { onboarded = false, appData = null, household = null, isPremium = false, checkInBonus = 0 } = state || {};
  const slimAppData = appData
    ? { ...appData, transactions: manualTransactions(appData.transactions, appData.accounts) }
    : appData;
  return {
    schemaVersion: PERSIST_SCHEMA_VERSION,
    savedAt: nowIso,
    userId: userId || null,
    core: { onboarded, household, isPremium, checkInBonus, appData: slimAppData },
    sideKeys: readSideKeys(),
  };
}

// True when a blob carries no meaningful user data. Used by the save-overwrite safety net.
export function isBlobEmpty(blob) {
  const a = blob && blob.core && blob.core.appData;
  if (!a || a.demo) return true;   // treat demo/sample data as empty — it must never persist
  const has = (x) => Array.isArray(x) && x.length > 0;
  const profileHasData = a.profile && (a.profile.name || a.profile.country || a.profile.province || a.profile.partnerName);
  return !(has(a.bills) || has(a.incomes) || has(a.debts) || has(a.goals) || has(a.accounts) || has(a.transactions) || profileHasData);
}

// ── Supabase I/O (caller injects the client; this file imports nothing) ──────────
// Returns { blob, updatedAt } on a found row, null on a clean "no row", and THROWS on a
// real read error — so the caller migrate-uploads ONLY on the clean-null case (never
// clobbers a row it merely couldn't reach).
export async function fetchUserData(sb, userId) {
  const { data, error } = await sb.from("user_data").select("data, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { blob: data.data, updatedAt: data.updated_at };
}

// Upsert the blob (RLS-scoped to the owner). updated_at is set server-side by the trigger.
export async function upsertUserData(sb, userId, blob) {
  try {
    // ── SAFETY NET (non-negotiable for a finance app) ───────────────────────────
    // Never overwrite a non-empty DB row with empty local state. If the incoming blob is
    // empty, confirm the existing row is also empty/absent FIRST; refuse if it has data, or
    // if we cannot verify it (read error). A hydrate bug must never silently destroy data.
    if (isBlobEmpty(blob)) {
      let existing;
      try { existing = await fetchUserData(sb, userId); } // null = no row; throws → couldn't verify
      catch { existing = undefined; }
      if (existing === undefined || (existing && !isBlobEmpty(existing.blob))) {
        console.error("[persist] REFUSED: would overwrite non-empty DB row with empty local state", { userId, verified: existing !== undefined });
        return { ok: false, refused: true };
      }
    }
    const { error } = await sb.from("user_data").upsert(
      { user_id: userId, data: blob, schema_version: (blob && blob.schemaVersion) || PERSIST_SCHEMA_VERSION },
      { onConflict: "user_id" }
    );
    if (error) { console.error("[persist] upsert failed:", error.message); return { ok: false, error }; }
    console.log("[persist] upsert OK — row written for", userId);
    return { ok: true };
  } catch (e) { console.error("[persist] upsert threw:", e?.message || e); return { ok: false, error: e }; }
}

// Generic debounce with an immediate flush() (for pagehide). The caller supplies saveFn —
// commit 2 passes the Supabase upsert. Pure: this file knows nothing about the DB.
export function makeDebouncedSaver(saveFn, delayMs = 2000) {
  let timer = null;
  let pending = null;
  const run = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending == null) return;
    const payload = pending;
    pending = null;
    console.log("[persist] save flushing (debounce fired)");
    try { saveFn(payload); } catch (e) { console.error("[persist] save threw:", e?.message || e); }
  };
  return {
    schedule(payload) { console.log("[persist] save scheduled (debounce armed)"); pending = payload; if (timer) clearTimeout(timer); timer = setTimeout(run, delayMs); },
    flush() { run(); },
    hasPending() { return pending != null; },
  };
}
