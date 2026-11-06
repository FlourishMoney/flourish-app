# Honest bank balances: the words (balance-truth)

Every new line the app shows for the balance-truth fixes (2026-11-06). The app holds a `[WORDS: id]` placeholder for
each until Amanda has ChatGPT and Grok agree on the line. Then the line replaces the placeholder in
`src/lib/balanceWords.js` and in the table below. `tests/_pendingWords.cjs` allows these placeholders only in that
file, and only while this table still shows them. `scripts/check-pending-words.mjs` refuses the production web build
and every store build while any is left.

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
| `balance-last-updated` | Today: the status chip, and the line under the safe-to-spend figure. Activity's subtitle. How we got this. Debts in Settings | The bank balances are not live; {when} is the last time the bank answered for them | [WORDS: balance-last-updated] | 40 |
| `balance-last-updated-unknown` | The same places, when the app has no time for the bank's answer (accounts saved before this change) | The balances are not live, and the app can't say when the bank last answered | [WORDS: balance-last-updated-unknown] | 40 |
| `balance-signin-title` | Today: the title of the card for a bank whose sign-in has run out. How we got this | {bank} has stopped answering until the person signs in to it again | [WORDS: balance-signin-title] | 60 |
| `balance-signin-partner` | The same card, for a bank the other person in the household linked (only they can sign in to it) | {bank} needs the person who linked it to sign in again | [WORDS: balance-signin-partner] | 60 |
| `balance-signin-body` | Today: under that title | Until then its balances may be out of date and no new transactions come in | [WORDS: balance-signin-body] | 110 |
| `balance-signin-button` | Today: the card's button (opens the bank consent, then the bank's sign-in) | Signs in to {bank} again | [WORDS: balance-signin-button] | 32 |
| `balance-link-closed` | A dialog after the bank window closes from Settings (connect another bank, or reconnect): the reason | The person closed the bank window before it finished | [WORDS: balance-link-closed] | 60 |
| `balance-link-bank-down` | The same dialog: the reason, when Plaid says the bank didn't respond or is down | {bank} didn't respond | [WORDS: balance-link-bank-down] | 50 |
| `balance-link-code-wrong` | The same dialog: the reason, when the bank's security code didn't match | The code didn't match | [WORDS: balance-link-code-wrong] | 50 |
| `balance-link-login-wrong` | The same dialog: the reason, when the username or password didn't match (or the bank locked the login) | The bank didn't accept the sign-in | [WORDS: balance-link-login-wrong] | 50 |
| `balance-link-other` | The same dialog: any other reason | The connection didn't finish | [WORDS: balance-link-other] | 50 |
| `balance-link-nothing-added` | The same dialog, after a reason, when the person was adding a bank | No bank and no balance was added | [WORDS: balance-link-nothing-added] | 30 |
| `balance-link-still-needed` | The same dialog, after a reason, when the person was signing in to a bank again | {bank} still needs a fresh sign-in; nothing else changed | [WORDS: balance-link-still-needed] | 60 |
| `balance-history-loading` | Today: the title of the card for a new bank whose 90 days are still coming. Onboarding, once a bank is linked. How we got this | Flourish is still getting {bank}'s history | [WORDS: balance-history-loading] | 50 |
| `balance-history-loading-body` | Under that title (Today and onboarding) | The balances are already in; up to 90 days of transactions can take a few minutes | [WORDS: balance-history-loading-body] | 110 |
| `balance-history-slow` | Today and How we got this, when the history has taken over 10 minutes | {bank} is still sending it; Flourish checks again each time it opens | [WORDS: balance-history-slow] | 100 |
| `balance-debts-from-bank` | Debts in Settings: the header over card balances from the bank, when they are not live (followed by "· " and `balance-last-updated`) | These card balances came from the bank | [WORDS: balance-debts-from-bank] | 30 |
| `balance-bank-unnamed` | In place of {bank} when Plaid didn't say which bank | A bank, unnamed | [WORDS: balance-bank-unnamed] | 12 |

## Proposed lines (for ChatGPT and Grok to agree on; not in the app)

| Id | Proposed line |
|---|---|
| `balance-last-updated` | Last updated {when} |
| `balance-last-updated-unknown` | Last update time not known |
| `balance-signin-title` | {bank} needs you to sign in again |
| `balance-signin-partner` | {bank} needs your partner to sign in again |
| `balance-signin-body` | Until then, its balances may be out of date and new transactions can't come in. |
| `balance-signin-button` | Sign in to {bank} |
| `balance-link-closed` | You closed the bank window before it finished. |
| `balance-link-bank-down` | {bank} didn't respond. |
| `balance-link-code-wrong` | The security code didn't match. |
| `balance-link-login-wrong` | Your bank didn't accept that sign-in. |
| `balance-link-other` | The connection didn't finish. |
| `balance-link-nothing-added` | Nothing was added. |
| `balance-link-still-needed` | {bank} still needs you to sign in again. |
| `balance-history-loading` | Loading your history from {bank}… |
| `balance-history-loading-body` | Your balances are in. Up to 90 days of transactions can take a few minutes to arrive. |
| `balance-history-slow` | {bank} is still sending your history. Flourish checks again each time you open it. |
| `balance-debts-from-bank` | Balances from your bank |
| `balance-bank-unnamed` | Your bank |

A dialog shows a reason and an outcome together, for example "{bank} didn't respond. Nothing was added." Its button
is the existing "OK".
