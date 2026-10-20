// src/lib/freePlan.js
// -----------------------------------------------------------------------------
// WHAT THE iOS AND ANDROID APPS SAY ABOUT THE TRIAL AND THE FREE PLAN, in one place (2026-10-20).
//
// The store apps follow the web's rules (lib/featureAccess.js) but sell nothing: no price, no upgrade
// button, no link to pay on the web (Apple 3.1.1 and 3.1.3(f), Google Play's payments policy).
//
// EVERY LINE HERE IS THE FOUNDER'S, WORD FOR WORD: the first five approved 2026-10-19, the second bank and
// Terms section 7 approved 2026-10-20 (ChatGPT and Grok agreed). Do not reword them here;
// tests/nativeFreePlanLine.test.cjs pins each one exactly, and checks that the two naming the trial are the
// only lines here that say "trial" (nativeNoPrice.test still bans it on every other store-app screen).
// The figures in them are the limits the app and the server both enforce, read from FREE_TIER_LIMITS, so a
// change to a limit cannot leave a line wrong.
//
// APPLE 3.1.3(b): a feature bought on the web may unlock in the app only if it is also sold as an in-app
// purchase. So no store-app line may say that a paid plan keeps every feature, even though the server does
// count a paid web plan in the apps (_lib/planRules.js deriveEntitlement); in-app purchase in 1.1 makes
// that clean. The lines describe the trial and the free plan only.
// -----------------------------------------------------------------------------
import { FREE_TIER_LIMITS } from "./usageLimits.js";

// The free plan's bank limit. netlify/functions/plaid.js enforces it (exchange_token and migrate_items);
// tests/nativeFreePlanLine.test.cjs reads the cap there so the two cannot drift.
export const FREE_BANKS = 1;

const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// ── Approved 2026-10-19 ────────────────────────────────────────────────────────────────────────────
// Where the web shows its upgrade bar once the trial has ended.
export const TRIAL_ENDED_BANNER = "Your free trial has ended";

// A locked screen: Credit, and the coach-run meeting.
export const LOCKED_LINE = "This part isn't included in the free plan. On the free plan you keep safe to spend, your bills and paydays, and your weekly agenda.";

// The coach's weekly limit reached.
export function coachLimitLine(perWeek = FREE_TIER_LIMITS.coachMessagesPerWeek) {
  return `You've used this week's ${perWeek} coach messages. You get ${perWeek} more on Monday.`;
}

// What-If's daily limit reached (the free plan has FREE_TIER_LIMITS.simulationsPerDay, which is 1).
export const WHAT_IF_LIMIT_LINE = "You've run today's What-If. You can run another tomorrow.";

// The chip during the trial; the number is the days left (usageLimits.getTrialDaysLeft).
export function trialChip(daysLeft) {
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in your trial`;
}

// ── Approved 2026-10-20 ────────────────────────────────────────────────────────────────────────────
// A second bank on the free plan.
export const FREE_BANK_LINE = `The free plan connects ${n(FREE_BANKS, "bank", "banks")}. You can import a statement for another account.`;

// Terms of Service, section 7, in a store app.
export const STORE_TERMS_SECTION_7 =
  "There is nothing to buy in the iOS and Android apps. A new account has every feature for its first 14 days. " +
  "After that, the free plan has usage limits: " +
  `${n(FREE_TIER_LIMITS.coachMessagesPerWeek, "coach message", "coach messages")} a week, ` +
  `${n(FREE_TIER_LIMITS.simulationsPerDay, "What-If", "What-Ifs")} a day and ${n(FREE_BANKS, "connected bank", "connected banks")}, ` +
  "and it does not include Credit or the coach-run meeting. Each limit is shown where it applies.";

// ── NEEDS REVIEW (ChatGPT and Grok) before it ships: version 1.1, in-app purchase ───────────────────────
// Terms of Service, section 7, in a store app that sells (lib/storeBilling.js storeBillingOn). A 1.0.x store
// build keeps STORE_TERMS_SECTION_7 above, which would be untrue here. No price (the store shows it), no website.
export const STORE_TERMS_SECTION_7_IAP =
  "In the iOS and Android apps, Flourish Plus is an auto-renewing subscription bought through the App Store or Google Play, " +
  "at the price the store shows before you confirm. The store charges it, and it renews every month or every year until you cancel it " +
  "in your App Store or Google Play account settings, at least 24 hours before the end of the period. " +
  "Refunds for a store purchase are requested from that store. " +
  "The founding annual price is for the first 50 households and stays the same for as long as that subscription renews without a break. " +
  "A new account has every feature for its first 14 days. There is no other trial. After that, without a subscription, the free plan has usage limits: " +
  `${n(FREE_TIER_LIMITS.coachMessagesPerWeek, "coach message", "coach messages")} a week, ` +
  `${n(FREE_TIER_LIMITS.simulationsPerDay, "What-If", "What-Ifs")} a day and ${n(FREE_BANKS, "connected bank", "connected banks")}, ` +
  "and it does not include Credit or the coach-run meeting. Each limit is shown where it applies.";
