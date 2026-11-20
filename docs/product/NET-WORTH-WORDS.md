# Plus add-on, bank login limits and net worth: the words (approved 2026-11-20, ChatGPT 100 and Grok 100)

**Approved by Amanda, 2026-11-20** (`docs/review/PLUS-COPY-APPROVED-2026-11-20.md`). Every line below is in the code word for word: the app's in `src/lib/netWorthWords.js`, the server's three in `netlify/functions/_lib/planWords.js`. A line changed later goes back to a `[WORDS: id]` placeholder, here and in the code, until approved again: `tests/_pendingWords.cjs` lets a placeholder stay only in those two files, and only for an id listed here with its own placeholder as its line, and `scripts/check-pending-words.mjs` refuses the production web build and every store build while one is left.

Two limits rose to fit the approved line: `banks-limit-person` (160 to 180) and `networth-plus-entry-label` (40 to 70; it is the name field's label, read by screen readers, not a line that has to fit on one row).

Numbers in a line ({used}, {limit}, {count}) are whole numbers of bank logins, from the server's answer only.

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `plus-status-unavailable` | Any Plus screen, and the line under Connect a bank, when the server could not read the household's plan | We could not check the plan just now; nothing has changed; try again. No number, no "you don't have Plus" | We couldn't check your plan just now. Nothing has changed. Please try again. | 90 |
| `banks-limit-person` | Connect a bank, when this person has used every bank login their plan includes | This person has used {used} of the {limit} bank logins their plan includes; each person in a household has their own; Plus is an add-on with more; nothing already connected changes | You've connected {used} of the {limit} banks included for you. Your partner has their own bank limit. flourish Plus allows more banks for the household. Nothing you've connected changes. | 180 |
| `banks-limit-household` | Connect a bank, with Plus, when the household has reached the fair-use limit | The household has {used} of the {limit} bank logins Plus allows under its fair-use limit (the terms); nothing already connected changes | Your household has connected {used} of the {limit} banks flourish Plus allows under its fair use limit. Nothing you've connected changes. | 140 |
| `banks-over-limit-kept` | Settings, banks, when more are connected than the plan includes (after Plus ends, or from before the limit) | {count} banks are connected and the plan includes {limit}; every one stays connected and keeps updating; a new one can be added once under the limit, or with Plus | You have {count} banks connected and your plan includes {limit}. They all stay connected and keep updating. You can add another once you're under the limit. | 180 |
| `networth-empty-title` | Today, the net worth card, when nothing is entered or linked | There is no net worth to show yet | No net worth to show yet | 40 |
| `networth-empty-body` | Today, under that title | Net worth appears once an account, a debt or a balance is added or a bank is connected. No figure, no example, no estimate | Add an account, a debt or a balance, or connect a bank, to start building your net worth here. | 120 |
| `networth-trend-not-yet` | Today, the net worth card, in place of the line, until there are two months of the household's own figures | The line starts once there are two months of this household's own figures; nothing is drawn before then | Your trend line starts after two months of your own figures. | 90 |

## Net worth behind Plus (2026-11-10)

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `networth-locked-title` | Today's net worth card, Goals' Net Worth tab, the investments card and Wrapped's net worth slide, for a household without Plus | Net worth and investments come with flourish Plus. No figure is shown | Net worth and investments come with flourish Plus | 60 |
| `networth-locked-body` | Under that title | Net worth and investment holdings are part of the Plus add-on; every bank, card and loan balance stays where it is shown today; no price | Net worth and investment holdings are part of the flourish Plus add-on. Your bank, card and loan balances stay where they are today. | 140 |
| `networth-locked-short` | Today's row of small figures, in the net worth tile's place, without Plus | Net worth comes with Plus. No figure | With flourish Plus | 24 |
| `networth-locked-unavailable` | The same places, when the plan could not be checked | We couldn't check your plan just now, so net worth isn't shown; nothing has changed; try again. No figure | We couldn't check your plan just now, so net worth isn't shown. Nothing has changed. Please try again. | 120 |
| `networth-plus-title` | The Plus net worth screen's heading | Net worth | Net worth | 30 |
| `networth-plus-household-total` | Above the total, when it is the whole household's (no partner, or the partner shared everything and every part is real) | This is the household's net worth, per currency, never combined | Your household's net worth, by currency | 60 |
| `networth-plus-your-total` | Above the total, when only this person's own parts are counted | This is your own net worth; your partner's private things are not in it | Your own net worth. Anything your partner keeps private isn't included. | 80 |
| `networth-plus-no-total` | In place of the total, when a part is missing, not in a stated currency, or may be counted twice | No total until every part is complete; the parts below say what is missing | No total yet. It shows once every part below is complete. Each part says what's missing. | 120 |
| `networth-plus-part-missing` | Under a part that is not complete | What is missing for this part: a balance, a currency, a kind, or an answer about a card that may be counted twice | Missing a balance, currency, type, or answer about whether a card is counted twice. | 90 |
| `networth-plus-yours` | Section heading: this person's own accounts and entries | Yours | Yours | 30 |
| `networth-plus-partner` | Section heading: what the partner shared | Shared by your partner | Shared by your partner | 40 |
| `networth-plus-household` | Section heading: what both already see as the household's (debts typed in the app, accounts no bank linked) | The household's | Household | 40 |
| `networth-plus-share` | The switch on each of this person's accounts and entries, when they have a partner | Share this with my partner. Off by default | Share this with my partner | 40 |
| `networth-plus-share-sensitive` | Under the switch, on an account that could reveal a health or disability fact (an RDSP, an HSA) | This account's type can say something about health or disability to whoever sees it; it is never shared unless you turn this on | This account's type can reveal something about health or disability. Your partner doesn't see it unless you turn this on. | 140 |
| `networth-plus-registered` | Beside an investment account the bank calls registered | Registered | Registered | 20 |
| `networth-plus-non-registered` | Beside an investment account the bank calls a brokerage account | Non-registered | Non-registered | 20 |
| `networth-plus-add` | The button that adds an entry | Add a home, car or pension | Add a home, car or pension | 40 |
| `networth-plus-kind-home` | The entry kinds | Home | Home | 20 |
| `networth-plus-kind-car` | The entry kinds | Car | Car | 20 |
| `networth-plus-kind-pension` | The entry kinds | Pension | Pension | 20 |
| `networth-plus-entry-label` | The entry form: the name field | A short name, private unless shared | A short name. Your partner sees it only if you share this entry. | 70 |
| `networth-plus-entry-value` | The entry form: the figure field | Your own figure; flourish estimates nothing | Your own figure. Nothing is estimated. | 40 |
| `networth-plus-entry-currency` | The entry form: the currency | CAD or USD | CAD or USD | 20 |
| `networth-plus-save` | The entry form's save button | Save | Done | 20 |
| `networth-plus-delete` | On each entry | Delete | Delete | 20 |
| `networth-plus-error` | After a save, delete or share that failed | It didn't save; nothing changed; try again | That change didn't go through. Nothing changed. Please try again. | 80 |

## The main plan's name (2026-11-10)
To households the main paid plan is "flourish" (monthly, annual, founding). "flourish Plus" is only the add-on. Each line below named the main plan "Flourish Plus" or "Plus", and was reviewed again (approved 2026-11-20). Product and entitlement ids never change. `docs/product/PLAN-NAMES.md` lists every place, in the repo and outside it.

The store apps' paywall title is not here: main's approved title (2026-11-05, "Subscribe to flourish") already names the main plan "flourish". Its lead of 2026-11-05 said "every flourish feature", which is not true once the add-on is sold, so from 1.1.8 the store apps' lead is `plan-adds-lead`, word for word (`src/lib/storeOffer.js` `PAYWALL_COPY.lead`, approved 2026-11-20).

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `plan-name` | Website: the Settings plan card title, the upgrade screen title, the plans screen title, the sidebar badge (after "✦ ") | The main paid plan's name: flourish | flourish | 30 |
| `plan-get-cta` | Website: Today's upgrade card | Open the main plan's plans | Subscribe to flourish | 30 |
| `plan-upgrade-cta` | Website: the locked screen's button after a trial, and the sidebar's upgrade link | Open the main plan's plans | Subscribe to flourish → | 30 |
| `plan-on` | Website: the upgrade screen for a household that pays | This household pays for the main plan | You're subscribed to flourish | 40 |
| `plan-includes-title` | Website: the locked screen (PremiumGate), above the list | What the main plan includes | A flourish subscription includes: | 40 |
| `plan-adds-title` | Website: the plans screen's heading | What the main plan adds to the free plan | What's included with a subscription | 40 |
| `plan-adds-lead` | Website: the Settings plan card | The main plan adds Credit and the coach-run meeting and lifts the free plan's limits on the coach and What-If | A flourish subscription includes Credit and the coach-run meeting, with no limits on the coach or What-If. | 140 |
| `plan-sim-limit` | Website: What-If, when today's free simulations are used | The free simulations for today are used; the main plan has unlimited What-If; or come back tomorrow | You've used today's free What-If simulations. A flourish subscription has unlimited What-If, or come back tomorrow. | 160 |
| `plan-sim-cta` | Website: What-If, the button under that line | Unlimited simulations come with the main plan | Unlimited What-If with a subscription → | 40 |
| `plan-terms-web-label` | Website: Terms of Service section 7, the label before "Premium features require a paid subscription." | The main plan's name, as a label | flourish subscription: | 30 |
| `plan-terms-lifts-limits` | Store apps that sell: Terms of Service section 7, the sentence after the free plan's limits | The main plan lifts these limits | A flourish subscription lifts these limits. | 60 |
| `plan-household-extra-stripe` | Couple mode: a member paying on the website while the other's subscription covers them | The partner's subscription includes them; cancel theirs on the website under Settings, the plan, Manage subscription | Your partner's subscription already includes you. Cancel yours where you bought it: Settings > flourish > Manage subscription. | 160 |
| `plan-server-coach-limit` | The coach, when the free plan's weekly messages are used (the server's line; {n} follows it) | The {n} free coach messages this week are used; the main plan has unlimited; they reset on Monday | You've used your {n} free coach messages this week. A flourish subscription has unlimited messages, or come back on Monday when they reset. | 160 |
| `plan-server-one-bank` | Website: connecting a second bank on the free plan (the server's line) | The free plan connects one bank; the main plan connects more | The free plan connects one bank. A flourish subscription connects more. | 120 |
| `plan-server-one-bank-migrate` | The same, when banks are moved from an older version (the server's line) | The free plan connects one bank; the main plan connects more | The free plan connects one bank. A flourish subscription connects more. | 120 |
