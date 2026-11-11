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
import { pendingWords } from "./pendingWords.js";
import { chargeDateLabel } from "./trialPlanFirst.js";

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

// ── Approved 2026-10-20 (ChatGPT and Grok agreed): version 1.1, in-app purchase ─────────────────────────────
// Terms of Service, section 7, in a store app that sells (lib/storeBilling.js storeBillingOn). A 1.0.x store
// build keeps STORE_TERMS_SECTION_7 above, which is true for it and untrue here. No price (the store shows it).
export const STORE_TERMS_SECTION_7_IAP =
  "A new account has every feature for its first 14 days, at no charge. After that, the free plan has usage limits: " +
  `${n(FREE_TIER_LIMITS.coachMessagesPerWeek, "coach message", "coach messages")} a week, ` +
  `${n(FREE_TIER_LIMITS.simulationsPerDay, "What-If", "What-Ifs")} a day and ${n(FREE_BANKS, "connected bank", "connected banks")}, ` +
  "and it does not include Credit or the coach-run meeting. Each limit is shown where it applies. Flourish Plus lifts these limits. " +
  "In the iOS and Android apps it is sold as an auto-renewing subscription through the App Store or Google Play, at the price shown in the app before you buy. " +
  "Payment is charged to your Apple or Google account when you confirm. " +
  "The subscription renews automatically at the end of each period unless you cancel it in your App Store or Google Play account settings before it renews (for Apple, at least 24 hours before the period ends). " +
  "Cancelling takes effect at the end of the current period. " +
  "Refunds for purchases made in the apps are handled by Apple or Google under their own policies. " +
  // (2026-10-29: the first 50 who subscribe; the words that assumed a waitlist number are to come, lib/pendingWords.js)
  pendingWords("terms-7-founding");

// ── Approved 2026-11-11 (ChatGPT 100, Grok 100): TRIAL_PLAN_FIRST on ───────────────────────────────────────────
// Terms of Service, section 7, while TRIAL_PLAN_FIRST is on: ONE text for the website and for a store app that sells
// (a store build that sells nothing keeps STORE_TERMS_SECTION_7). The founding sentence is terms-7-founding; {date} is
// TRIAL_PLAN_FIRST_SINCE as a date (GET /api/trial-plan-first). The free plan's figures are FREE_TIER_LIMITS and
// FREE_BANKS, as in the lines above. Its paragraphs, in order; the heading is TRIAL_FIRST_TERMS_7_HEADING.
// tests/trialGoLiveWords.test.cjs pins the whole text word for word.
export const TRIAL_FIRST_TERMS_7_HEADING = "7. Plans and billing";
export function trialFirstTermsSection7(since) {
  const t = Date.parse(since || "");
  if (!Number.isFinite(t)) return null;
  const date = chargeDateLabel(new Date(t));
  return [
    "flourish is sold as a subscription: flourish monthly, flourish annual and, while offered, flourish founding annual. " +
      pendingWords("terms-7-founding") + " " +
      "A new account chooses a plan to keep using flourish. A partner who joins a household can use the same subscription. " +
      "Prices are in Canadian dollars, plus sales tax on the website.",
    "Eligible new subscribers get 14 days free. Apple, Google or Stripe decides who is eligible, and the website needs a card to start. " +
      "The plans screen shows whether the 14 days apply and the first-charge date. " +
      "Unless you cancel before the first charge, you will be charged automatically. Apple may charge up to 24 hours before the trial ends. " +
      "Your plan then renews automatically each billing period until you cancel.",
    "To cancel on iPhone: Settings, your name, then Subscriptions, at least 24 hours before the trial or period ends. " +
      "On Android: Google Play, your profile, Payments & subscriptions, then Subscriptions. On the website: Settings, then Manage subscription. " +
      "Cancel before the first charge and you pay nothing; after that, cancelling takes effect at the period's end.",
    `An account opened before ${date} keeps its 14-day account trial to its end, then moves to the free plan: ` +
      `${n(FREE_TIER_LIMITS.coachMessagesPerWeek, "coach message", "coach messages")} a week, ` +
      `${n(FREE_TIER_LIMITS.simulationsPerDay, "What-If", "What-Ifs")} a day, ${n(FREE_BANKS, "connected bank", "connected banks")}, ` +
      "and no Credit or coach-run meeting.",
    "Apple or Google handle refunds for in-app purchases under their own policies. " +
      "On the website, partial periods are not refunded unless the law requires it.",
  ];
}
