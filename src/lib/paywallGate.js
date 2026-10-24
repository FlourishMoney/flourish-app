// src/lib/paywallGate.js
// -----------------------------------------------------------------------------
// THE PAYWALL FOR A HOUSEHOLD WITH NO PLAN (founder's decision, 2026-10-23: "Yes, drop the free plan.
// 14 days free, then Plus.").
//
// WHEN IT SHOWS is the SERVER's answer, never this app's guess. billing.js `status` (the website, and a store
// build that does not sell) and `store_status` (a store build that sells) carry `access`, worked out by the
// same rule that refuses the paid calls (netlify/functions/_lib/auth.js getUserPlan, _lib/planRules.js):
//   { entitled: true|false, basis: "founder"|"paid"|"trial"|"grace"|"none", grace_ends_at: ISO|null }
// The paywall shows only for a signed-in account whose answer is entitled: false. No answer (offline, the
// call blocked, the plan unreadable on the server) is never "no plan": the last definite answer for this
// account stands in (remembered below), and with none the app opens as it is. A paying household is never
// shown the paywall because a call failed, and the server still refuses every paid call on its own.
//
// THE LIVE DEMO never shows it: it has no account, so it is never asked.
//
// NOTHING IS DELETED. The paywall is drawn over the app (App.jsx noPlanOverlay), which stays mounted with its
// state underneath; nothing here writes the household's data. The moment the server's answer turns entitled
// (a purchase, a restore, a renewal) the paywall goes and the app is exactly where it was.
// -----------------------------------------------------------------------------

const GATE_KEY = "flourish_access_gate";

const BASES = ["founder", "paid", "trial", "grace", "none"];

/** The server's access answer from a billing status body, or null when it gave none we can trust. */
export function accessFromStatus(status) {
  const a = status && status.access;
  if (!a || typeof a !== "object" || typeof a.entitled !== "boolean") return null;
  const basis = BASES.includes(a.basis) ? a.basis : (a.entitled ? "paid" : "none");
  const grace = typeof a.grace_ends_at === "string" && Number.isFinite(Date.parse(a.grace_ends_at)) ? a.grace_ends_at : null;
  return { entitled: a.entitled, basis, graceEndsAt: grace };
}

/** Keeps this account's last definite answer, for when there is none (offline). Never stores anything else. */
export function rememberAccess(storage, userId, access) {
  if (!storage || !userId || !access || typeof access.entitled !== "boolean") return;
  try { storage.setItem(GATE_KEY, JSON.stringify({ uid: userId, entitled: access.entitled })); } catch { /* storage full or blocked */ }
}

/** This account's last definite answer: true, false, or null when there is none for this account. */
export function recalledAccess(storage, userId) {
  if (!storage || !userId) return null;
  let rec = null;
  try { rec = JSON.parse(storage.getItem(GATE_KEY) || "null"); } catch { rec = null; }
  if (!rec || rec.uid !== userId || typeof rec.entitled !== "boolean") return null;
  return rec.entitled;
}

/**
 * Whether the no-plan paywall covers the app.
 * @param {object} a
 * @param {boolean} a.signedIn   a real account is signed in (the demo has none)
 * @param {boolean} a.demo       the live demo
 * @param {object|null} a.access this account's answer from the server just now (accessFromStatus), or null
 * @param {boolean|null} a.recalled this account's last definite answer (recalledAccess), or null
 */
export function paywallShows({ signedIn = false, demo = false, access = null, recalled = null } = {}) {
  if (!signedIn || demo) return false;
  if (access) return access.entitled === false;
  return recalled === false;
}

/** The small notice during the 30 days from go-live (the brief's item 4), or null when it does not apply. */
export function graceNoticeEnds(access, now = Date.now()) {
  if (!access || access.entitled !== true || access.basis !== "grace" || !access.graceEndsAt) return null;
  const end = Date.parse(access.graceEndsAt);
  return Number.isFinite(end) && end > now ? access.graceEndsAt : null;
}

// ── WORDS ───────────────────────────────────────────────────────────────────────────────────────────
// Reused where an approved line fits (where each is from is noted). NEW WORDS ARE NOT WRITTEN HERE: each one
// is a [WORDS: …] placeholder until the founder's are in (the brief's item 5), and
// tests/noPlanPaywall.test.cjs lists them so none can ship by accident unnoticed.
export const NO_PLAN_COPY = Object.freeze({
  heading: "[WORDS: paywall heading]",
  body: "[WORDS: paywall body: the trial has ended, subscribe to keep using flourish]",
  dataSafe: "Your accounts, bills and history stay as they are.",   // approved 2026-10-20 (storeOffer.js PAYWALL_COPY.dataSafe)
  seePlans: "See plans",                                            // approved (PremiumGate, Settings)
  checkAgain: "Check again",                                        // approved 2026-10-20 (PAYWALL_COPY.checkAgain)
  manage: "Manage subscription",                                    // approved (UpgradeScreen, Settings)
  signOut: "Sign out",                                              // approved (Settings)
  exportData: "⬇ Export my data (JSON)",                            // approved (Settings → Your Data)
  deleteAccount: "Delete Account",                                  // approved (Settings → Delete Account)
  privacy: "Privacy Policy",                                        // approved 2026-10-20 (PAYWALL_COPY.privacy)
  terms: "Terms",                                                   // approved (the website's footer)
  support: "Support",                                               // approved (the website's footer)
  noStorePurchase: "[WORDS: paywall in a store build that cannot sell: subscribe in a current version of the app]",
});

/** The notice during the 30 days from go-live. `ends` is the server's date, shown by the caller's own format. */
export function graceNotice(endsLabel) {
  return `[WORDS: 30-day notice: every feature until ${endsLabel}, then a subscription is needed]`;
}

// Every placeholder this module ships, for the report and for the test that keeps them visible.
export const NO_PLAN_PLACEHOLDERS = Object.freeze([
  NO_PLAN_COPY.heading, NO_PLAN_COPY.body, NO_PLAN_COPY.noStorePurchase, graceNotice("<date>"),
]);

// ── EXPORT ──────────────────────────────────────────────────────────────────────────────────────────
// What "Export my data" downloads, built in one place so Settings and the paywall export the same thing.
// Moved here unchanged from Settings (App.jsx exportMyData). `readLocal(key, fallbackJson)` reads a side key.
export function exportPayload(data, readLocal, now = new Date()) {
  const d = data || {};
  return {
    _meta: { app: "Flourish Money", schema: 1, exportedAt: now.toISOString(),
             note: "Your Flourish data, exported for your records / portability." },
    profile: d.profile || null,
    incomes: d.incomes || [],
    bills: d.bills || [],
    debts: d.debts || [],
    goals: d.goals || [],
    budgets: d.budgets || {},
    accounts: d.accounts || [],
    transactions: d.transactions || [],
    household: d.household || null,
    // The household's forecast corrections: edited or skipped deposits and bills, "from this date on"
    // changes, expected money in or out, their daily spend figure, and which deposits are not income.
    forecastEdits: d.forecastEdits || {},
    depositDecisions: d.depositDecisions || {},
    depositRules: d.depositRules || {},
    customCategories: readLocal("flourish_custom_cats", "[]"),
    categoryOverrides: readLocal("flourish_cat_overrides", "{}"),
    coachHistory: readLocal("flourish_coach_history", "null"),
  };
}
