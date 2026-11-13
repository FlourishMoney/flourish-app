# Trial plan first: every place that says "no card" (or the old trial), for the day it goes live

Amanda's decision (2026-11-10): from the day `TRIAL_PLAN_FIRST` goes on, a new person picks a plan with Apple, Google or Stripe, gives a card (or their store account), and gets 14 days free. Anything that says "no card", or describes the old account trial as the way in, must change that day. Searched 2026-11-10 on main 69480cd: src/, public/, index.html, netlify/functions (emails), docs/, src/whatsNew.json, and ~/Documents/Flourish (store copy and social drafts).

## Switched by the code (the approved line while the switch is on, today's line while it is off)
| Where | Today's line | While on |
|---|---|---|
| App, first onboarding screen (`src/App.jsx`, Onboarding) | "Free to start · Canada & USA · No credit card" | "Made for Canadian households" |
| Website landing, under the main button (`src/App.jsx`, AuthScreen) | "Every feature free for 14 days. Also on iPhone and Android." | "Choose a plan to get started. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled. Also on iPhone and Android." |
| Website landing, the main button, top and bottom (`src/App.jsx`, TrialButton; approved 2026-11-11) | "Try flourish free for 14 days" | "Get started", with the line above under it (top and bottom) |
| Terms of Service section 7, website and a store app that sells (`src/App.jsx` TermsOfService, `src/lib/freePlan.js` trialFirstTermsSection7; approved 2026-11-11) | the web "Free Tier / Flourish Plus" text; in the apps STORE_TERMS_SECTION_7_IAP | "7. Plans and billing": one text for both, with terms-7-founding and the switch's date; "Last updated" is that date |

All ask `GET /api/trial-plan-first` (the Terms, for its `since` as well). With no answer they keep today's line. A store build only has what it was built with: 1.1.6 (526911 / 27) and older keep their bundled section 7, so the apps' Terms follow the switch from the first build made with this change.

## Not switched by the code: change on the day (Amanda, or a small follow-up PR)
1. **`index.html`** meta description and og:description (approved 2026-11-11): the last sentence "Every feature free for 14 days." becomes "Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled." The file is static, read by search engines and link previews, so it can't ask the server. Since 2026-11-13 it follows the switch at build time instead (`scripts/trial-first-meta.mjs`): the switch only takes effect with a deploy, and that deploy's build reads the same two variables by the same rule. Nothing is changed by hand; the runbook checks the published page's source.
2. **Terms section 7:** switched by the code since 2026-11-11 (the table above), on the website and in store builds made from then on. `docs/ops/LEGAL-PACKET.md` still carries the older reviewed text.
3. **Store builds already in the stores' hands (1.1.6 and older):** their section 7 is bundled and still describes the account trial. They need a new build to change.
4. **`TrialButton`:** switched by the code since 2026-11-11 (the table above).
5. **`PremiumGate`** (`src/App.jsx`): "Start 14 days free →" and "14 days free. Cancel any time." Shown only while billing is off. Not seen in production; left alone.
6. **The store founding "keep my trial" link** (`src/lib/pendingWords.js`, "Not now, keep my 14-day trial"): shown only to someone inside the old account trial. Correct for them; it ends when the last account trial ends.
7. **App Store and Google Play listings** (not in the repo; nothing in the repo or ~/Documents/Flourish records "no card" in them). Amanda checks the live descriptions, promotional text and What's New in App Store Connect and Play Console. Apple's App Review notes in `docs/ops/LEGAL-PACKET.md` say "A 14-day trial of Plus".
8. **Emails:** none of the repo's emails says "no card".
9. **Docs only** (no household sees these):
   - `docs/ops/BEFORE-MONDAY.md`: "no card is required for the trial"
   - `docs/ops/LEGAL-PACKET.md`: "14-day free trial without a card"
   - `docs/ops/OPERATING-PLAN.md`: "the 14-day no-card trial", "no card up front", "(card or no card)"
   - `docs/product/COPY-CHANGES.md`: "No credit card." and "No credit card. Sixty seconds."
10. **Social: Amanda's posts.** The approved Reel script, `~/Documents/Flourish/01 Marketing/Reel paycheque (2026-11-08)/REEL-PAYCHEQUE-APPROVED-2026-11-08.md`, says "No card needed to start. Then a paid plan." (lines 11, 20, 30, 39). It is built, not posted. Any post or caption already up that says "no card" changes that day.
11. **Captures of the old onboarding line**, for reference only: `~/Documents/Flourish/onboarding-audit/onboarding-copy.txt`, and the walkthrough video's `getting-started-captures/rects.json`. The walkthrough video itself shows the line if it is reused.
