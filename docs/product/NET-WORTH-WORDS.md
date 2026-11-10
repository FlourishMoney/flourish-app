# Plus add-on, bank login limits and net worth: the words (2026-11-10)

**Not approved.** Every line below is a placeholder until both reviewers approve it. The app's copy is `src/lib/netWorthWords.js`; `tests/_pendingWords.cjs` lets a placeholder stay only there, and only for an id listed here with its own placeholder as its line. `scripts/check-pending-words.mjs` refuses the production web build and every store build while one is left. Once a line is approved it replaces the placeholder here and in the code, word for word.

Numbers in a line ({used}, {limit}, {count}) are whole numbers of bank logins, from the server's answer only.

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `plus-status-unavailable` | Any Plus screen, and the line under Connect a bank, when the server could not read the household's plan | We could not check the plan just now; nothing has changed; try again. No number, no "you don't have Plus" | [WORDS: plus-status-unavailable] | 90 |
| `banks-limit-person` | Connect a bank, when this person has used every bank login their plan includes | This person has used {used} of the {limit} bank logins their plan includes; each person in a household has their own; Plus is an add-on with more; nothing already connected changes | [WORDS: banks-limit-person] | 160 |
| `banks-limit-household` | Connect a bank, with Plus, when the household has reached the fair-use limit | The household has {used} of the {limit} bank logins Plus allows under its fair-use limit (the terms); nothing already connected changes | [WORDS: banks-limit-household] | 140 |
| `banks-over-limit-kept` | Settings, banks, when more are connected than the plan includes (after Plus ends, or from before the limit) | {count} banks are connected and the plan includes {limit}; every one stays connected and keeps updating; a new one can be added once under the limit, or with Plus | [WORDS: banks-over-limit-kept] | 180 |
| `networth-empty-title` | Today, the net worth card, when nothing is entered or linked | There is no net worth to show yet | [WORDS: networth-empty-title] | 40 |
| `networth-empty-body` | Today, under that title | Net worth appears once an account, a debt or a balance is added or a bank is connected. No figure, no example, no estimate | [WORDS: networth-empty-body] | 120 |
| `networth-trend-not-yet` | Today, the net worth card, in place of the line, until there are two months of the household's own figures | The line starts once there are two months of this household's own figures; nothing is drawn before then | [WORDS: networth-trend-not-yet] | 90 |

## The main plan's name (2026-11-10)
To households the main paid plan is "flourish" (monthly, annual, founding). "flourish Plus" is only the add-on. Each line below named the main plan "Flourish Plus" or "Plus", and goes back to review. Product and entitlement ids never change. `docs/product/PLAN-NAMES.md` lists every place, in the repo and outside it.

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `plan-name` | Website: the Settings plan card title, the upgrade screen title, the plans screen title, the sidebar badge (after "✦ "). Store apps: the paywall title | The main paid plan's name: flourish | [WORDS: plan-name] | 30 |
| `plan-get-cta` | Website: Today's upgrade card | Open the main plan's plans | [WORDS: plan-get-cta] | 30 |
| `plan-upgrade-cta` | Website: the locked screen's button after a trial, and the sidebar's upgrade link | Open the main plan's plans | [WORDS: plan-upgrade-cta] | 30 |
| `plan-on` | Website: the upgrade screen for a household that pays | This household pays for the main plan | [WORDS: plan-on] | 40 |
| `plan-includes-title` | Website: the locked screen (PremiumGate), above the list | What the main plan includes | [WORDS: plan-includes-title] | 40 |
| `plan-adds-title` | Website: the plans screen's heading | What the main plan adds to the free plan | [WORDS: plan-adds-title] | 40 |
| `plan-adds-lead` | Website: the Settings plan card. Store apps: the paywall lead | The main plan adds Credit and the coach-run meeting and lifts the free plan's limits on the coach and What-If | [WORDS: plan-adds-lead] | 140 |
| `plan-sim-limit` | Website: What-If, when today's free simulations are used | The free simulations for today are used; the main plan has unlimited What-If; or come back tomorrow | [WORDS: plan-sim-limit] | 160 |
| `plan-sim-cta` | Website: What-If, the button under that line | Unlimited simulations come with the main plan | [WORDS: plan-sim-cta] | 40 |
| `plan-terms-web-label` | Website: Terms of Service section 7, the label before "Premium features require a paid subscription." | The main plan's name, as a label | [WORDS: plan-terms-web-label] | 30 |
| `plan-terms-lifts-limits` | Store apps that sell: Terms of Service section 7, the sentence after the free plan's limits | The main plan lifts these limits | [WORDS: plan-terms-lifts-limits] | 60 |
| `plan-household-extra-stripe` | Couple mode: a member paying on the website while the other's subscription covers them | The partner's subscription includes them; cancel theirs on the website under Settings, the plan, Manage subscription | [WORDS: plan-household-extra-stripe] | 160 |
| `plan-server-coach-limit` | The coach, when the free plan's weekly messages are used (the server's line; {n} follows it) | The {n} free coach messages this week are used; the main plan has unlimited; they reset on Monday | [WORDS: plan-server-coach-limit] | 160 |
| `plan-server-one-bank` | Website: connecting a second bank on the free plan (the server's line) | The free plan connects one bank; the main plan connects more | [WORDS: plan-server-one-bank] | 120 |
| `plan-server-one-bank-migrate` | The same, when banks are moved from an older version (the server's line) | The free plan connects one bank; the main plan connects more | [WORDS: plan-server-one-bank-migrate] | 120 |
