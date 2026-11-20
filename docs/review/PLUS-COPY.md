# flourish Plus: the 48 lines, APPROVED (2026-11-20)

**All 48 lines are approved and in the code, word for word** (ChatGPT 100 AGREE, Grok 100 AGREE, round 2; Amanda, 2026-11-20). The record is `docs/review/PLUS-COPY-APPROVED-2026-11-20.md`. Sections: A 4, B 3, C 4, D 22, E 12, F 3.

- In the code: `src/lib/netWorthWords.js` (45 lines) and `netlify/functions/_lib/planWords.js` (3 lines). No `[WORDS: id]` placeholder is left, so the production website build and the store builds no longer refuse to build for these words (`scripts/check-pending-words.mjs`).
- `tests/netWorthPlus.test.cjs` (7g to 7k) holds the code to the record, line by line, in the record's order.
- A line changed later goes back to a placeholder until it is approved again.
- **The store apps' paywall lead changed too.** Line 40 no longer says the main plan has "every flourish feature", so the store apps' lead of 2026-11-05 is now line 40, word for word (`src/lib/storeOffer.js`).

## What changed between the first draft and the approved words

- **2** `banks-limit-person`: was "You've connected {used} of the {limit} banks your plan includes. Each person in a household has their own. flourish Plus includes more. Nothing you've connected changes."
- **4** `banks-over-limit-kept`: was "You have {count} banks connected and your plan includes {limit}. They all stay connected and keep updating. You can add another once you're under the limit, or with flourish Plus."
- **6** `networth-empty-body`: was "Add an account, a debt or a balance, or connect a bank, and your net worth shows here."
- **16** `networth-plus-part-missing`: was "Missing a balance, a currency, a type, or an answer about a card counted twice."
- **19** `networth-plus-household`: was "Your household's"
- **21** `networth-plus-share-sensitive`: was "This account's type can reveal something about health or disability. It is never shared unless you turn this on."
- **28** `networth-plus-entry-label`: was "A short name, private unless shared"
- **31** `networth-plus-save`: was "Save"
- **33** `networth-plus-error`: was "That didn't save. Nothing changed. Please try again."
- **39** `plan-adds-title`: was "What a subscription adds"
- **40** `plan-adds-lead`: was "A subscription gives you every flourish feature, including Credit and the coach-run meeting, with no limits on the coach or What-If."

- **49** (not one of the 48 placeholders): the website plans screen's headline, `UPGRADE_COPY.headline` in `src/lib/upgradeFlow.js`, was "All of flourish, in one subscription" and is now "flourish, in one subscription" (approved 2026-11-20, ChatGPT 100, Grok 100), for the same reason as line 40.

The other 37 lines were approved as first drafted. Line 31 is the entry form's button: "Done", not "Save".

## Every line: where it shows, what it must say, the approved line and its limit

Lengths are counted with the largest numbers filled in ({used} 10, {limit} 10, {count} 12, {n} 2). Two limits rose to fit the approved line: line 2 (160 to 180) and line 28 (40 to 70; it is the name field's label, read by screen readers).

| # | Id | Where it shows | The facts it must say | Approved line (2026-11-20) | Length / limit |
|---|---|---|---|---|---|
| 1 | `plus-status-unavailable` | Any Plus screen, and the line under Connect a bank, when the server could not read the household's plan | We could not check the plan just now; nothing has changed; try again. No number, no "you don't have Plus" | We couldn't check your plan just now. Nothing has changed. Please try again. | 76 / 90 |
| 2 | `banks-limit-person` | Connect a bank, when this person has used every bank login their plan includes | This person has used {used} of the {limit} bank logins their plan includes; each person in a household has their own; Plus is an add-on with more; nothing already connected changes | You've connected {used} of the {limit} banks included for you. Your partner has their own bank limit. flourish Plus allows more banks for the household. Nothing you've connected changes. | 177 / 180 |
| 3 | `banks-limit-household` | Connect a bank, with Plus, when the household has reached the fair-use limit | The household has {used} of the {limit} bank logins Plus allows under its fair-use limit (the terms); nothing already connected changes | Your household has connected {used} of the {limit} banks flourish Plus allows under its fair use limit. Nothing you've connected changes. | 128 / 140 |
| 4 | `banks-over-limit-kept` | Settings, banks, when more are connected than the plan includes (after Plus ends, or from before the limit) | {count} banks are connected and the plan includes {limit}; every one stays connected and keeps updating; a new one can be added once under the limit, or with Plus | You have {count} banks connected and your plan includes {limit}. They all stay connected and keep updating. You can add another once you're under the limit. | 146 / 180 |
| 5 | `networth-empty-title` | Today, the net worth card, when nothing is entered or linked | There is no net worth to show yet | No net worth to show yet | 24 / 40 |
| 6 | `networth-empty-body` | Today, under that title | Net worth appears once an account, a debt or a balance is added or a bank is connected. No figure, no example, no estimate | Add an account, a debt or a balance, or connect a bank, to start building your net worth here. | 94 / 120 |
| 7 | `networth-trend-not-yet` | Today, the net worth card, in place of the line, until there are two months of the household's own figures | The line starts once there are two months of this household's own figures; nothing is drawn before then | Your trend line starts after two months of your own figures. | 60 / 90 |
| 8 | `networth-locked-title` | Today's net worth card, Goals' Net Worth tab, the investments card and Wrapped's net worth slide, for a household without Plus | Net worth and investments come with flourish Plus. No figure is shown | Net worth and investments come with flourish Plus | 49 / 60 |
| 9 | `networth-locked-body` | Under that title | Net worth and investment holdings are part of the Plus add-on; every bank, card and loan balance stays where it is shown today; no price | Net worth and investment holdings are part of the flourish Plus add-on. Your bank, card and loan balances stay where they are today. | 132 / 140 |
| 10 | `networth-locked-short` | Today's row of small figures, in the net worth tile's place, without Plus | Net worth comes with Plus. No figure | With flourish Plus | 18 / 24 |
| 11 | `networth-locked-unavailable` | The same places, when the plan could not be checked | We couldn't check your plan just now, so net worth isn't shown; nothing has changed; try again. No figure | We couldn't check your plan just now, so net worth isn't shown. Nothing has changed. Please try again. | 102 / 120 |
| 12 | `networth-plus-title` | The Plus net worth screen's heading | Net worth | Net worth | 9 / 30 |
| 13 | `networth-plus-household-total` | Above the total, when it is the whole household's (no partner, or the partner shared everything and every part is real) | This is the household's net worth, per currency, never combined | Your household's net worth, by currency | 39 / 60 |
| 14 | `networth-plus-your-total` | Above the total, when only this person's own parts are counted | This is your own net worth; your partner's private things are not in it | Your own net worth. Anything your partner keeps private isn't included. | 71 / 80 |
| 15 | `networth-plus-no-total` | In place of the total, when a part is missing, not in a stated currency, or may be counted twice | No total until every part is complete; the parts below say what is missing | No total yet. It shows once every part below is complete. Each part says what's missing. | 88 / 120 |
| 16 | `networth-plus-part-missing` | Under a part that is not complete | What is missing for this part: a balance, a currency, a kind, or an answer about a card that may be counted twice | Missing a balance, currency, type, or answer about whether a card is counted twice. | 83 / 90 |
| 17 | `networth-plus-yours` | Section heading: this person's own accounts and entries | Yours | Yours | 5 / 30 |
| 18 | `networth-plus-partner` | Section heading: what the partner shared | Shared by your partner | Shared by your partner | 22 / 40 |
| 19 | `networth-plus-household` | Section heading: what both already see as the household's (debts typed in the app, accounts no bank linked) | The household's | Household | 9 / 40 |
| 20 | `networth-plus-share` | The switch on each of this person's accounts and entries, when they have a partner | Share this with my partner. Off by default | Share this with my partner | 26 / 40 |
| 21 | `networth-plus-share-sensitive` | Under the switch, on an account that could reveal a health or disability fact (an RDSP, an HSA) | This account's type can say something about health or disability to whoever sees it; it is never shared unless you turn this on | This account's type can reveal something about health or disability. Your partner doesn't see it unless you turn this on. | 121 / 140 |
| 22 | `networth-plus-registered` | Beside an investment account the bank calls registered | Registered | Registered | 10 / 20 |
| 23 | `networth-plus-non-registered` | Beside an investment account the bank calls a brokerage account | Non-registered | Non-registered | 14 / 20 |
| 24 | `networth-plus-add` | The button that adds an entry | Add a home, car or pension | Add a home, car or pension | 26 / 40 |
| 25 | `networth-plus-kind-home` | The entry kinds | Home | Home | 4 / 20 |
| 26 | `networth-plus-kind-car` | The entry kinds | Car | Car | 3 / 20 |
| 27 | `networth-plus-kind-pension` | The entry kinds | Pension | Pension | 7 / 20 |
| 28 | `networth-plus-entry-label` | The entry form: the name field | A short name, private unless shared | A short name. Your partner sees it only if you share this entry. | 64 / 70 |
| 29 | `networth-plus-entry-value` | The entry form: the figure field | Your own figure; flourish estimates nothing | Your own figure. Nothing is estimated. | 38 / 40 |
| 30 | `networth-plus-entry-currency` | The entry form: the currency | CAD or USD | CAD or USD | 10 / 20 |
| 31 | `networth-plus-save` | The entry form's save button | Save | Done | 4 / 20 |
| 32 | `networth-plus-delete` | On each entry | Delete | Delete | 6 / 20 |
| 33 | `networth-plus-error` | After a save, delete or share that failed | It didn't save; nothing changed; try again | That change didn't go through. Nothing changed. Please try again. | 65 / 80 |
| 34 | `plan-name` | Website: the Settings plan card title, the upgrade screen title, the plans screen title, the sidebar badge (after "✦ ") | The main paid plan's name: flourish | flourish | 8 / 30 |
| 35 | `plan-get-cta` | Website: Today's upgrade card | Open the main plan's plans | Subscribe to flourish | 21 / 30 |
| 36 | `plan-upgrade-cta` | Website: the locked screen's button after a trial, and the sidebar's upgrade link | Open the main plan's plans | Subscribe to flourish → | 23 / 30 |
| 37 | `plan-on` | Website: the upgrade screen for a household that pays | This household pays for the main plan | You're subscribed to flourish | 29 / 40 |
| 38 | `plan-includes-title` | Website: the locked screen (PremiumGate), above the list | What the main plan includes | A flourish subscription includes: | 33 / 40 |
| 39 | `plan-adds-title` | Website: the plans screen's heading | What the main plan adds to the free plan | What's included with a subscription | 35 / 40 |
| 40 | `plan-adds-lead` | Website: the Settings plan card | The main plan adds Credit and the coach-run meeting and lifts the free plan's limits on the coach and What-If | A flourish subscription includes Credit and the coach-run meeting, with no limits on the coach or What-If. | 106 / 140 |
| 41 | `plan-sim-limit` | Website: What-If, when today's free simulations are used | The free simulations for today are used; the main plan has unlimited What-If; or come back tomorrow | You've used today's free What-If simulations. A flourish subscription has unlimited What-If, or come back tomorrow. | 115 / 160 |
| 42 | `plan-sim-cta` | Website: What-If, the button under that line | Unlimited simulations come with the main plan | Unlimited What-If with a subscription → | 39 / 40 |
| 43 | `plan-terms-web-label` | Website: Terms of Service section 7, the label before "Premium features require a paid subscription." | The main plan's name, as a label | flourish subscription: | 22 / 30 |
| 44 | `plan-terms-lifts-limits` | Store apps that sell: Terms of Service section 7, the sentence after the free plan's limits | The main plan lifts these limits | A flourish subscription lifts these limits. | 43 / 60 |
| 45 | `plan-household-extra-stripe` | Couple mode: a member paying on the website while the other's subscription covers them | The partner's subscription includes them; cancel theirs on the website under Settings, the plan, Manage subscription | Your partner's subscription already includes you. Cancel yours where you bought it: Settings > flourish > Manage subscription. | 126 / 160 |
| 46 | `plan-server-coach-limit` | The coach, when the free plan's weekly messages are used (the server's line; {n} follows it) | The {n} free coach messages this week are used; the main plan has unlimited; they reset on Monday | You've used your {n} free coach messages this week. A flourish subscription has unlimited messages, or come back on Monday when they reset. | 137 / 160 |
| 47 | `plan-server-one-bank` | Website: connecting a second bank on the free plan (the server's line) | The free plan connects one bank; the main plan connects more | The free plan connects one bank. A flourish subscription connects more. | 71 / 120 |
| 48 | `plan-server-one-bank-migrate` | The same, when banks are moved from an older version (the server's line) | The free plan connects one bank; the main plan connects more | The free plan connects one bank. A flourish subscription connects more. | 71 / 120 |

## Section E and F: what a household sees today, beside the approved line

| # | Id | Live today | Approved |
|---|---|---|---|
| 34 | `plan-name` | Flourish Plus | flourish |
| 35 | `plan-get-cta` | Get Flourish Plus | Subscribe to flourish |
| 36 | `plan-upgrade-cta` | Get Flourish Plus → / Upgrade to Flourish Plus → | Subscribe to flourish → |
| 37 | `plan-on` | You're on Flourish Plus | You're subscribed to flourish |
| 38 | `plan-includes-title` | Flourish Plus includes: | A flourish subscription includes: |
| 39 | `plan-adds-title` | What Plus adds | What's included with a subscription |
| 40 | `plan-adds-lead` | Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If. | A flourish subscription includes Credit and the coach-run meeting, with no limits on the coach or What-If. |
| 41 | `plan-sim-limit` | Upgrade to Flourish Plus for unlimited What-If scenarios, or come back tomorrow. | You've used today's free What-If simulations. A flourish subscription has unlimited What-If, or come back tomorrow. |
| 42 | `plan-sim-cta` | Unlimited simulations with Plus → | Unlimited What-If with a subscription → |
| 43 | `plan-terms-web-label` | Flourish Plus: | flourish subscription: |
| 44 | `plan-terms-lifts-limits` | Flourish Plus lifts these limits. | A flourish subscription lifts these limits. |
| 45 | `plan-household-extra-stripe` | Your partner's subscription already includes you. Cancel yours where you bought it: Settings > Flourish Plus > Manage subscription. | Your partner's subscription already includes you. Cancel yours where you bought it: Settings > flourish > Manage subscription. |
| 46 | `plan-server-coach-limit` | You've used your {n} free Coach messages this week. Upgrade to Plus for unlimited, or come back on Monday when this week's messages reset. | You've used your {n} free coach messages this week. A flourish subscription has unlimited messages, or come back on Monday when they reset. |
| 47 | `plan-server-one-bank` | Connecting more than one bank is a Plus feature. Upgrade to add unlimited banks. | The free plan connects one bank. A flourish subscription connects more. |
| 48 | `plan-server-one-bank-migrate` | Free plan supports one bank. Upgrade to Plus to add more. | The free plan connects one bank. A flourish subscription connects more. |

Notes:
- **40** replaces the store apps' paywall lead of 2026-11-05 as well ("A subscription gives you every flourish feature…"): with the add-on, the main plan is no longer every feature. Both places now hold line 40.
- **47 and 48** are the server's own lines. The apps show their own line instead, so these are seen only on the website's older paths. Today's line 47 says "unlimited banks", which stops being true once the bank limits are on.
- **2, 3 and 4** say "banks", not "bank logins": `tests/bankLoginClaim.test.cjs` allows no server line to say "bank login", so the app's lines match it.

## Plus words that do not exist yet (no placeholder, because the screen or the listing is not built)

These are not in the 48. Each needs words before Plus can be sold.

1. **The Plus purchase screen**, website and both store apps: the title, what Plus includes, the two prices ($4.99 a month, $49.99 a year, plus tax), the buy button, the store disclosure, Restore purchases, and "Manage" once bought. Not built.
2. **Settings, the line for a household over its bank limit.** The words are line 4 above; the screen that shows them is not built.
3. **Terms of Service: the fair use sentence** for Plus's 10 banks per household, and Plus in section 7 (price, renewal, cancelling, refunds).
4. **Privacy Policy:** whether net worth entries and the per-account sharing choice need a sentence.
5. **App Store Connect:** the group's display name, and each product's display name and description (Apple's fields are short; the form shows the limit).
6. **Play Console:** the subscription's name, its benefits and its description.
7. **Stripe:** the product name "flourish Plus" (shown on Checkout, receipts and the portal) and its description.
8. **What's New for 1.1.8**, the App Review notes for the new subscriptions, and the store description's Plus section.
