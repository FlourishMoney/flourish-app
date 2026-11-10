// src/lib/trialPlanFirst.js
// -----------------------------------------------------------------------------
// TRIAL_PLAN_FIRST (Amanda, 2026-11-10): the usual app-store trial. A new person picks a plan on day one with Apple,
// Google or Stripe, gets 14 days free there, and is charged automatically unless they cancel. Off by default; the
// server decides (netlify/functions/_lib/trialPlanFirst.js) and says so in its billing status calls, so the store
// builds follow the switch with no new upload. With it off the server sends no trial_plan_first key, and every
// answer here is today's exactly.
//
// PURE, except the small device cache (a storage object is passed in).
// -----------------------------------------------------------------------------

/** The server's trial_plan_first answer when the switch is on, or null (off, no answer, or a shape not known). */
export function trialPlanFirstOf(status) {
  const t = status && typeof status === "object" ? status.trial_plan_first : null;
  return t && typeof t === "object" && t.on === true ? t : null;
}

/** Does this account keep the 14-day account trial? Only an explicit false from the server takes it away. */
export function accountTrialFrom(status) {
  const t = trialPlanFirstOf(status);
  return t ? t.account_trial !== false : true;
}

// THE DEVICE CACHE of that one answer, per account, so the plan read at sign-in (before the status call answers) is
// already right on a device that has heard it once. A status answer with the switch off clears it.
const KEY = (uid) => `flourish_tpf_account_trial_${uid}`;
export function rememberAccountTrial(storage, uid, status) {
  if (!storage || !uid || !status) return;
  try {
    const t = trialPlanFirstOf(status);
    if (t && t.account_trial === false) storage.setItem(KEY(uid), "false");
    else storage.removeItem(KEY(uid));
  } catch { /* storage refused: the status call's own answer still applies */ }
}
export function recalledAccountTrial(storage, uid) {
  if (!storage || !uid) return true;
  try { return storage.getItem(KEY(uid)) !== "false"; } catch { return true; }
}
