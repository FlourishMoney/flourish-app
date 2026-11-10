# Trial plan first: every place that says "no card" (or the old trial), for the day it goes live

Amanda's decision (2026-11-10): from the day `TRIAL_PLAN_FIRST` goes on, a new person picks a plan with Apple, Google or Stripe, gives a card (or their store account), and gets 14 days free. Anything that says "no card", or describes the old account trial as the way in, must change that day. Searched 2026-11-10 on main 69480cd: src/, public/, index.html, netlify/functions (emails), docs/, src/whatsNew.json, and ~/Documents/Flourish (store copy and social drafts).

## Switched by the code (placeholder while the switch is on, today's line while it is off)
| Where | Today's line | While on |
|---|---|---|
| App, first onboarding screen (`src/App.jsx`, Onboarding) | "Free to start · Canada & USA · No credit card" | `trialfirst-welcome` |
| Website landing, under the main button (`src/App.jsx`, AuthScreen) | "Every feature free for 14 days. Also on iPhone and Android." | `trialfirst-landing` |

Both ask `GET /api/trial-plan-first` before sign-in. With no answer they keep today's line.

## Not switched by the code: change on the day (Amanda, or a small follow-up PR)
1. **`index.html`** meta description and og:description: "Every feature free for 14 days." Static, read by search engines and link previews. Correct as a claim (14 days free), but it doesn't say a plan is chosen first.
2. **Website Terms of Service section 7** (`src/App.jsx`, web Terms): "a 14-day trial of premium features" describes the account trial. It goes through the legal review (`docs/ops/LEGAL-PACKET.md` carries the reviewed text, including "14-day free trial without a card").
3. **Store builds' Terms section 7** (`src/lib/freePlan.js`): "every feature for its first 14 days". Same review.
4. **`TrialButton`** (`src/App.jsx`): "Try flourish free for 14 days". Still true, but it leads to signup and then a plan with a card. Words to review.
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
