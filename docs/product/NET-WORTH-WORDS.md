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
