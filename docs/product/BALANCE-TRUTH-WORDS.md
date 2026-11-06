# Honest bank balances: the words (balance-truth)

Every new line the app shows for the balance-truth fixes (2026-11-06). Approved word for word on 2026-11-06: ChatGPT
and Grok agreed (Amanda; the approved list is the Flourish project doc
claude/BALANCE-TRUTH-WORDS-APPROVED-2026-11-06.md). Two lines changed from the first proposal:
`balance-last-updated-unknown` and `balance-history-slow`. The lines live in `src/lib/balanceWords.js`;
`tests/balanceTruth.test.cjs` section 7 holds that file, this table and the approved text together. No placeholder is
left, so the `balance-` exception in `tests/_pendingWords.cjs` now covers nothing.

`{bank}` is the bank's name as Plaid gives it (for example "Scotiabank"). When Plaid didn't say which bank, it is
`balance-bank-unnamed`. `{when}` is the time if it is today (for example "3:40 p.m."), else the date ("Oct 30"), with
the year when it is not this year. Both are formatted by the device in Canadian English.

Words that already exist and are kept as they are: "Live", "· just refreshed", "· updated 5m ago", "just updated",
"updated 5m ago", "· live", "· estimated", "Balances you entered", "Live from your bank", "Balances imported live from
your bank", "live" (the tag on a card's debt), the dialog button "OK", and the Settings reconnect banner. After this
change each "live" line shows only while the bank answered within the last hour.

The limit is in characters, with `{bank}` counted as 20 and `{when}` as 8.

| Id | Where it shows | The facts it must say | Line | Limit |
|---|---|---|---|---|
| `balance-last-updated` | Today: the status chip, and the line under the safe-to-spend figure. Activity's subtitle. How we got this. Debts in Settings | The bank balances are not live; {when} is the last time the bank answered for them | Last updated {when} | 40 |
| `balance-last-updated-unknown` | The same places, when the app has no time for the bank's answer (accounts saved before this change) | The balances are not live, and the app can't say when the bank last answered | Last update time not available | 40 |
| `balance-signin-title` | Today: the title of the card for a bank whose sign-in has run out. How we got this | {bank} has stopped answering until the person signs in to it again | {bank} needs you to sign in again | 60 |
| `balance-signin-partner` | The same card, for a bank the other person in the household linked (only they can sign in to it) | {bank} needs the person who linked it to sign in again | {bank} needs your partner to sign in again | 60 |
| `balance-signin-body` | Today: under that title | Until then its balances may be out of date and no new transactions come in | Until then, its balances may be out of date and new transactions can't come in. | 110 |
| `balance-signin-button` | Today: the card's button (opens the bank consent, then the bank's sign-in) | Signs in to {bank} again | Sign in to {bank} | 32 |
| `balance-link-closed` | A dialog after the bank window closes from Settings (connect another bank, or reconnect): the reason | The person closed the bank window before it finished | You closed the bank window before it finished. | 60 |
| `balance-link-bank-down` | The same dialog: the reason, when Plaid says the bank didn't respond or is down | {bank} didn't respond | {bank} didn't respond. | 50 |
| `balance-link-code-wrong` | The same dialog: the reason, when the bank's security code didn't match | The code didn't match | The security code didn't match. | 50 |
| `balance-link-login-wrong` | The same dialog: the reason, when the username or password didn't match (or the bank locked the login) | The bank didn't accept the sign-in | Your bank didn't accept that sign-in. | 50 |
| `balance-link-other` | The same dialog: any other reason | The connection didn't finish | The connection didn't finish. | 50 |
| `balance-link-nothing-added` | The same dialog, after a reason, when the person was adding a bank | No bank and no balance was added | Nothing was added. | 30 |
| `balance-link-still-needed` | The same dialog, after a reason, when the person was signing in to a bank again | {bank} still needs a fresh sign-in; nothing else changed | {bank} still needs you to sign in again. | 60 |
| `balance-history-loading` | Today: the title of the card for a new bank whose 90 days are still coming. Onboarding, once a bank is linked. How we got this | Flourish is still getting {bank}'s history | Loading your history from {bank}… | 50 |
| `balance-history-loading-body` | Under that title (Today and onboarding) | The balances are already in; up to 90 days of transactions can take a few minutes | Your balances are in. Up to 90 days of transactions can take a few minutes to arrive. | 110 |
| `balance-history-slow` | Today and How we got this, when the history has taken over 10 minutes | {bank} is still sending it; Flourish checks again each time it opens | {bank} is still sending your history. flourish checks again each time you open it. | 100 |
| `balance-debts-from-bank` | Debts in Settings: the header over card balances from the bank, when they are not live (followed by "· " and `balance-last-updated`) | These card balances came from the bank | Balances from your bank | 30 |
| `balance-bank-unnamed` | In place of {bank} when Plaid didn't say which bank | A bank, unnamed | Your bank | 12 |

A dialog shows a reason and an outcome together, for example "{bank} didn't respond. Nothing was added." Its button
is the existing "OK".
