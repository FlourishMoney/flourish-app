// src/lib/netWorthWords.js
// -----------------------------------------------------------------------------
// THE WORDS FOR THE PLUS ADD-ON, BANK LOGIN LIMITS AND NET WORTH (2026-11-10). Every line the app shows for them.
// docs/product/NET-WORTH-WORDS.md lists each id: where it shows, the facts it must state, the line and its limit.
//
// NOT APPROVED YET. Every line is a "[WORDS: …]" placeholder until both reviewers approve it (the brief of
// 2026-11-10). Nothing ships meanwhile: scripts/check-pending-words.mjs refuses the production web build
// (netlify.toml) and every store build (npm run build:native) while one is left, and tests/_pendingWords.cjs allows
// a placeholder only here, only for an id the words doc lists with its own placeholder as its line.
//
// A line may carry {used}, {limit} and {count}: whole numbers of bank logins, from the server's answer only, never
// worked out on the phone. While a line is a placeholder the values follow it in brackets, so a screen and a test
// can still see which numbers it is about.
// -----------------------------------------------------------------------------

export const NET_WORTH_WORDS = Object.freeze({
  // Any Plus screen, and the bank-login line, when the server could not read the household's plan.
  "plus-status-unavailable": "[WORDS: plus-status-unavailable]",
  // Adding a bank: this person has used every bank login their plan includes ({used} of {limit}).
  "banks-limit-person": "[WORDS: banks-limit-person]",
  // Adding a bank with Plus: the household has reached the fair-use limit ({used} of {limit}).
  "banks-limit-household": "[WORDS: banks-limit-household]",
  // Settings, banks: more banks connected than the plan includes ({count} connected, {limit} included). All stay.
  "banks-over-limit-kept": "[WORDS: banks-over-limit-kept]",
  // Today's net worth card, with nothing entered or linked yet.
  "networth-empty-title": "[WORDS: networth-empty-title]",
  "networth-empty-body": "[WORDS: networth-empty-body]",
  // Today's net worth card, before there are two months of the household's own figures to draw a line between.
  "networth-trend-not-yet": "[WORDS: networth-trend-not-yet]",

  // NET WORTH BEHIND PLUS (Amanda, 2026-11-10): the locked state, and the Plus net worth screen (private by default).
  "networth-locked-title": "[WORDS: networth-locked-title]",
  "networth-locked-body": "[WORDS: networth-locked-body]",
  "networth-locked-short": "[WORDS: networth-locked-short]",
  "networth-locked-unavailable": "[WORDS: networth-locked-unavailable]",
  "networth-plus-title": "[WORDS: networth-plus-title]",
  "networth-plus-household-total": "[WORDS: networth-plus-household-total]",
  "networth-plus-your-total": "[WORDS: networth-plus-your-total]",
  "networth-plus-no-total": "[WORDS: networth-plus-no-total]",
  "networth-plus-part-missing": "[WORDS: networth-plus-part-missing]",
  "networth-plus-yours": "[WORDS: networth-plus-yours]",
  "networth-plus-partner": "[WORDS: networth-plus-partner]",
  "networth-plus-household": "[WORDS: networth-plus-household]",
  "networth-plus-share": "[WORDS: networth-plus-share]",
  "networth-plus-share-sensitive": "[WORDS: networth-plus-share-sensitive]",
  "networth-plus-registered": "[WORDS: networth-plus-registered]",
  "networth-plus-non-registered": "[WORDS: networth-plus-non-registered]",
  "networth-plus-add": "[WORDS: networth-plus-add]",
  "networth-plus-kind-home": "[WORDS: networth-plus-kind-home]",
  "networth-plus-kind-car": "[WORDS: networth-plus-kind-car]",
  "networth-plus-kind-pension": "[WORDS: networth-plus-kind-pension]",
  "networth-plus-entry-label": "[WORDS: networth-plus-entry-label]",
  "networth-plus-entry-value": "[WORDS: networth-plus-entry-value]",
  "networth-plus-entry-currency": "[WORDS: networth-plus-entry-currency]",
  "networth-plus-save": "[WORDS: networth-plus-save]",
  "networth-plus-delete": "[WORDS: networth-plus-delete]",
  "networth-plus-error": "[WORDS: networth-plus-error]",

  // THE MAIN PLAN'S NAME (Amanda, 2026-11-10): to households the main paid plan is "flourish" (monthly, annual,
  // founding); "flourish Plus" is only the add-on. Every place a household saw "Flourish Plus" or "Plus" for the main
  // plan takes one of these. Product and entitlement ids never change. docs/product/PLAN-NAMES.md lists each place.
  "plan-name": "[WORDS: plan-name]",
  "plan-get-cta": "[WORDS: plan-get-cta]",
  "plan-upgrade-cta": "[WORDS: plan-upgrade-cta]",
  "plan-on": "[WORDS: plan-on]",
  "plan-includes-title": "[WORDS: plan-includes-title]",
  "plan-adds-title": "[WORDS: plan-adds-title]",
  "plan-adds-lead": "[WORDS: plan-adds-lead]",
  "plan-sim-limit": "[WORDS: plan-sim-limit]",
  "plan-sim-cta": "[WORDS: plan-sim-cta]",
  "plan-terms-web-label": "[WORDS: plan-terms-web-label]",
  "plan-terms-lifts-limits": "[WORDS: plan-terms-lifts-limits]",
  "plan-household-extra-stripe": "[WORDS: plan-household-extra-stripe]",
});

/** The words for an id. {used}, {limit} and {count} are filled in; a placeholder carries them after it. */
export function netWorthWords(id, values = {}) {
  const w = NET_WORTH_WORDS[id];
  if (typeof w !== "string") throw new Error(`no such words: ${id}`);
  const keys = ["used", "limit", "count"].filter((k) => values[k] !== undefined);
  if (/^\[WORDS:/.test(w)) return keys.length ? `${w} [${keys.map((k) => `${k} ${values[k]}`).join(", ")}]` : w;
  return keys.reduce((s, k) => s.split(`{${k}}`).join(String(values[k])), w);
}
