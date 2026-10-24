# No free plan: words needed, and the free-plan lines still in the product

Founder's decision, 2026-10-23: "Yes, drop the free plan. 14 days free, then Plus."
Branch `drop-free-plan`. No new user-facing words were written. Every line the change needs is a
`[WORDS: …]` placeholder below, to be approved (ChatGPT and Grok) and swapped in before merge.
`tests/noPlanWords.test.cjs` fails if a placeholder in the code is missing from this list, or if this
list names one the code no longer has.

## 1. Placeholders (new words needed)

| # | Placeholder, exactly as it ships | File | Where it shows |
|---|---|---|---|
| 1 | `[WORDS: plan required, server]` | `netlify/functions/_lib/planGate.js` `PLAN_REQUIRED_MESSAGE` | The server's refusal of a paid call with no plan (402). An older store build may show it, so it must name no price, website or way to pay. |
| 2 | `[WORDS: plan check unavailable, server]` | `netlify/functions/_lib/planGate.js` `PLAN_UNKNOWN_MESSAGE` | The server could not read the plan (503): try again. Same rules as 1. |
| 3 | `[WORDS: paywall heading]` | `src/lib/paywallGate.js` `NO_PLAN_COPY.heading` | The no-plan paywall's heading, every app (in a store build that sells it replaces "Flourish Plus" on the store paywall). |
| 4 | `[WORDS: paywall body: the trial has ended, subscribe to keep using flourish]` | `src/lib/paywallGate.js` `NO_PLAN_COPY.body` | The line under the heading, every app (in a store build it replaces the store paywall's lead, which describes the free plan). |
| 5 | `[WORDS: paywall in a store build that cannot sell: subscribe in a current version of the app]` | `src/lib/paywallGate.js` `NO_PLAN_COPY.noStorePurchase` | Only in a store build with in-app purchase off. No price, link or website (Apple 3.1.1). |
| 6 | `[WORDS: 30-day notice: every feature until <date>, then a subscription is needed]` | `src/lib/paywallGate.js` `graceNotice(date)` | The small notice during the 30 days from go-live, where the trial chip sits. The date is the server's, as "November 23, 2026". |

Reused, word for word (already approved and shipping): "Your accounts, bills and history stay as they
are.", "See plans", "Check again", "Manage subscription", "Sign out", "⬇ Export my data (JSON)", "Delete
Account", "Privacy Policy", "Terms", "Support", and in a store build the store paywall's own approved
lines (Terms of Use, Privacy Policy, Restore purchases, the disclosure).

## 2. Public lines that still promise a free plan or its limits (listed, NOT changed)

Line numbers are at the head of this branch. Several are no longer reachable once the server refuses
every paid call with no plan (marked "unreachable"), but they still ship in the bundle.

### In-app paywall, upgrade and limit screens
- `src/lib/freePlan.js:30` "Your free trial has ended" (`TRIAL_ENDED_BANNER`), and `src/App.jsx:18742` the website's banner "Your free trial has ended" with "Upgrade Now" (18743).
- `src/lib/freePlan.js:33` "This part isn't included in the free plan. On the free plan you keep safe to spend, your bills and paydays, and your weekly agenda." (`LOCKED_LINE`, store apps' locked screens; unreachable).
- `src/lib/freePlan.js:37` "You've used this week's N coach messages. You get N more on Monday." (`coachLimitLine`; unreachable).
- `src/lib/freePlan.js:41` "You've run today's What-If. You can run another tomorrow." (`WHAT_IF_LIMIT_LINE`; unreachable).
- `src/lib/freePlan.js:50` "The free plan connects 1 bank. You can import a statement for another account." (`FREE_BANK_LINE`; unreachable).
- `src/App.jsx:10331` "You've used this week's N coach messages. They reset Monday." (unreachable).
- `src/App.jsx:12997` "You've hit today's Coach message limit. It resets tomorrow." (unreachable).
- `src/App.jsx:2202` "You've used all N simulations for today. Upgrade to Flourish Plus for unlimited What-If scenarios, or come back tomorrow."; `2208` "Daily limit reached" / "Upgrade to continue"; `2212` "Daily simulation limit reached on the free plan." (unreachable).
- `src/App.jsx:12441` and `src/lib/storeOffer.js:86` "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If." (Settings' Plus card; the store paywall's lead when opened from Settings).
- `src/lib/plusIncludes.js:12` "The coach with no weekly limit" (what Plus includes, implying a limited free coach).
- `src/App.jsx:13999` "Keep the free plan" (the older web Paywall's close button); `14006` "Live numbers from linked accounts, unlimited coaching, and the weekly meeting with agenda and facilitator. Free keeps Today, Watch and Do with manual entry."
- `src/App.jsx:18652` "Upgrade to Flourish Plus →" and `18734` "Upgrade →" (the web's upgrade bar after the trial).

### Terms of Service (in the app and on the website)
- `src/App.jsx:13566-13567` web Terms section 7 "Cost and usage limits": "Free Tier: Core features are available at no charge with a 14-day trial of premium features."
- `src/lib/freePlan.js:55-58` store apps' Terms section 7 (`STORE_TERMS_SECTION_7`, 1.0.x builds): "…After that, the free plan has usage limits: 2 coach messages a week, 1 What-If a day and 1 connected bank, and it does not include Credit or the coach-run meeting…"
- `src/lib/freePlan.js:64-67` store apps' Terms section 7 (`STORE_TERMS_SECTION_7_IAP`, 1.1 and later): the same free-plan limits, then "Flourish Plus lifts these limits."

### Privacy policy
- None. The privacy policy (`src/App.jsx` `PrivacyPolicy`) mentions no free plan or limit.

### Landing page and the live demo
- `src/App.jsx:4475` "Free to start · Canada & USA · No credit card".
- `src/App.jsx:6711` "Try Free →".
- `src/App.jsx:15830` "Create your free account".
- `src/App.jsx:10405` "A scripted preview. Create a free account to run this meeting on your own numbers." (demo Meet).
- `src/App.jsx:13106-13107` "That's the coach working on sample data. Create a free account to ask it about your own." / "Create free account →" (demo coach).
- Not a free-plan line, for completeness: `index.html:21-22` and `src/App.jsx` landing "Every feature free for 14 days." describe the trial and stay true.

### Server messages an older store build can show
- `netlify/functions/_lib/coachLimits.js:33` "You've used your 2 free Coach messages this week. Upgrade to Plus for unlimited, or come back on Monday when this week's messages reset." (unreachable).
- `netlify/functions/_lib/coachLimits.js:117` "You've used today's What-If explanation. It resets tomorrow." (unreachable).
- `netlify/functions/_lib/coachLimits.js:118` "The coach-run meeting isn't part of the free plan. Your agenda is unchanged." (unreachable).
- `netlify/functions/plaid.js:187` "Connecting more than one bank is a Plus feature. Upgrade to add unlimited banks." and `:607` "Free plan supports one bank. Upgrade to Plus to add more." (unreachable).

### Emails
- None. The waitlist welcome, founding link and founding confirmation emails (`netlify/functions/_lib/`) mention no free plan or limit.

### App Store and Google Play description text in the repo
- None in the repo: the store descriptions are not stored here.
- `docs/ops/LEGAL-PACKET.md:148` (the reviewer and lawyer packet): "Business model: free tier (manual entry, 2 coaching messages a week, meeting agenda without the AI facilitator) and Flourish Plus…"; `:106` and `:108` quote both Terms section 7 texts above.
