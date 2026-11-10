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

## Net worth behind Plus (2026-11-10)

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `networth-locked-title` | Today's net worth card, Goals' Net Worth tab, the investments card and Wrapped's net worth slide, for a household without Plus | Net worth and investments come with flourish Plus. No figure is shown | [WORDS: networth-locked-title] | 60 |
| `networth-locked-body` | Under that title | Net worth and investment holdings are part of the Plus add-on; every bank, card and loan balance stays where it is shown today; no price | [WORDS: networth-locked-body] | 140 |
| `networth-locked-short` | Today's row of small figures, in the net worth tile's place, without Plus | Net worth comes with Plus. No figure | [WORDS: networth-locked-short] | 24 |
| `networth-locked-unavailable` | The same places, when the plan could not be checked | We couldn't check your plan just now, so net worth isn't shown; nothing has changed; try again. No figure | [WORDS: networth-locked-unavailable] | 120 |
| `networth-plus-title` | The Plus net worth screen's heading | Net worth | [WORDS: networth-plus-title] | 30 |
| `networth-plus-household-total` | Above the total, when it is the whole household's (no partner, or the partner shared everything and every part is real) | This is the household's net worth, per currency, never combined | [WORDS: networth-plus-household-total] | 60 |
| `networth-plus-your-total` | Above the total, when only this person's own parts are counted | This is your own net worth; your partner's private things are not in it | [WORDS: networth-plus-your-total] | 80 |
| `networth-plus-no-total` | In place of the total, when a part is missing, not in a stated currency, or may be counted twice | No total until every part is complete; the parts below say what is missing | [WORDS: networth-plus-no-total] | 120 |
| `networth-plus-part-missing` | Under a part that is not complete | What is missing for this part: a balance, a currency, a kind, or an answer about a card that may be counted twice | [WORDS: networth-plus-part-missing] | 90 |
| `networth-plus-yours` | Section heading: this person's own accounts and entries | Yours | [WORDS: networth-plus-yours] | 30 |
| `networth-plus-partner` | Section heading: what the partner shared | Shared by your partner | [WORDS: networth-plus-partner] | 40 |
| `networth-plus-household` | Section heading: what both already see as the household's (debts typed in the app, accounts no bank linked) | The household's | [WORDS: networth-plus-household] | 40 |
| `networth-plus-share` | The switch on each of this person's accounts and entries, when they have a partner | Share this with my partner. Off by default | [WORDS: networth-plus-share] | 40 |
| `networth-plus-share-sensitive` | Under the switch, on an account that could reveal a health or disability fact (an RDSP, an HSA) | This account's type can say something about health or disability to whoever sees it; it is never shared unless you turn this on | [WORDS: networth-plus-share-sensitive] | 140 |
| `networth-plus-registered` | Beside an investment account the bank calls registered | Registered | [WORDS: networth-plus-registered] | 20 |
| `networth-plus-non-registered` | Beside an investment account the bank calls a brokerage account | Non-registered | [WORDS: networth-plus-non-registered] | 20 |
| `networth-plus-add` | The button that adds an entry | Add a home, car or pension | [WORDS: networth-plus-add] | 40 |
| `networth-plus-kind-home` | The entry kinds | Home | [WORDS: networth-plus-kind-home] | 20 |
| `networth-plus-kind-car` | The entry kinds | Car | [WORDS: networth-plus-kind-car] | 20 |
| `networth-plus-kind-pension` | The entry kinds | Pension | [WORDS: networth-plus-kind-pension] | 20 |
| `networth-plus-entry-label` | The entry form: the name field | A short name, private unless shared | [WORDS: networth-plus-entry-label] | 40 |
| `networth-plus-entry-value` | The entry form: the figure field | Your own figure; flourish estimates nothing | [WORDS: networth-plus-entry-value] | 40 |
| `networth-plus-entry-currency` | The entry form: the currency | CAD or USD | [WORDS: networth-plus-entry-currency] | 20 |
| `networth-plus-save` | The entry form's save button | Save | [WORDS: networth-plus-save] | 20 |
| `networth-plus-delete` | On each entry | Delete | [WORDS: networth-plus-delete] | 20 |
| `networth-plus-error` | After a save, delete or share that failed | It didn't save; nothing changed; try again | [WORDS: networth-plus-error] | 80 |

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
