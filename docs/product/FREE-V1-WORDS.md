# Free v1 on the website: word slots

Every new or changed line for the free plan on the website (branch `free-v1-web`, 2026-11-23). Each slot is a placeholder in the code until its approved line is pasted in, word for word, here and in the code:

- the app's slots: `src/lib/freeWords.js`;
- the server's slot: `netlify/functions/_lib/freeWords.js`;
- the Terms' new date: `FREE_TERMS_DATE` in `src/lib/freeWords.js` ("YYYY-MM-DD", the day the words go live).

`tests/freeV1Words.test.cjs` fails while any slot below still shows its placeholder, or while the Terms' date is not set, so the gate (and the pull request's `math` check) stays red until every word is in. `scripts/check-pending-words.mjs` also refuses the production build while a placeholder is left.

**What Free is on the website, the facts every line must match:**

- Free has no bank connection. Bank connections come with a paid plan or a trial (14 days free for eligible new subscribers).
- On Free: manual entry and statement import (PDF or CSV), paydays and bills, Safe to Spend, the dated list of bills and paydays, What-If (1 a day), the coach (2 messages a week, reset Monday).
- Not on Free: bank connections, Credit, the coach-run money meeting, unlimited coach and What-If.
- The plans screen can be closed; closing it keeps the account on Free. Nothing is taken away by closing it.
- A bank that is already connected when a trial or plan ends stays connected and keeps updating for now; no new bank can be added on Free. (Removal at the end of a paid period comes in a later release, with notice.)
- The iPhone and Android apps keep today's rules until their next builds: these words are the website's only.

| Id | Where it shows | What it must say | Line | Limit |
|---|---|---|---|---|
| `free-bank-line` | Website, a Free account at "Connect a bank": onboarding's bank step, Settings, a reconnect with no bank | Bank connections come with a paid plan or trial; statement import and typing work on Free | [WORDS: free-bank-line] | 200 |
| `free-bank-button` | Website, the button with that line (opens the plans) | Opens the plans | [WORDS: free-bank-button] | 30 |
| `free-server-bank` | Website, the server's answer when a Free account asks to connect a bank (create link token, exchange, old-bank import) | Same fact as the bank line | [WORDS: free-server-bank] | 200 |
| `free-plans-bullet-bank` | Website plans screen, third bullet (was "More than one bank, all in one place") | Bank connections are part of a subscription | [WORDS: free-plans-bullet-bank] | 60 |
| `free-includes-bank` | Website locked screens (Credit, the coach-run meeting), the list of what a subscription includes (was "More than one connected bank") | Bank connections are part of a subscription | [WORDS: free-includes-bank] | 60 |
| `free-plans-close` | Website plans screen, the button that closes it onto Free (was "Close") | Closes the plans and keeps Free | [WORDS: free-plans-close] | 30 |
| `free-settings-plan-line` | Website Settings, the plan card's line (was "Flourish Plus adds Credit and the coach-run meeting, and lifts the free plan's limits on the coach and What-If.") | What a subscription adds over Free, bank connections included | [WORDS: free-settings-plan-line] | 160 |
| `free-signup-title` | Website sign-up card heading (was "Create your account") | Creating an account (free is now true) | [WORDS: free-signup-title] | 40 |
| `free-landing-line` | Website landing, the line under "Get started", top and bottom, and the same in the pre-rendered home page (was "Choose a plan to get started. Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled. Also on iPhone and Android.") | Free to start; a plan or trial for bank connections; the trial's renewal terms if mentioned | [WORDS: free-landing-line] | 200 |
| `free-page-description` | Website page description for search results and link previews: the sentence after "Know what's safe to spend until payday. A Canadian money app where safe to spend is built around your paydays." (was "Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled.") | Same as the landing line, shorter | [WORDS: free-page-description] | 120 |
| `free-terms-7-new-account` | Website Terms section 7, first paragraph: replaces "A new account chooses a plan to keep using flourish." | A new account can use the free plan; a subscription adds the paid features | [WORDS: free-terms-7-new-account] | 200 |
| `free-terms-7-free-plan` | Website Terms section 7, the free-plan paragraph: replaces "An account opened before {date} keeps its 14-day account trial to its end, then moves to the free plan: 2 coach messages a week, 1 What-If a day, 1 connected bank, and no Credit or coach-run meeting." May use {date} | What Free includes and excludes (no bank connection); older accounts keep their account trial to its end, then Free | [WORDS: free-terms-7-free-plan] | 500 |
| `free-terms-7-bank-end` | Website Terms section 7, new sentence after the free-plan paragraph | What happens to a connected bank when a trial or plan ends (today: it stays connected; no new bank on Free) | [WORDS: free-terms-7-bank-end] | 300 |

The Terms' "Last updated" date moves to `FREE_TERMS_DATE` on the website, and the consent step records the same date.

Not in this branch: the Plus branch's own line "The free plan connects one bank. A flourish subscription connects more." (`plus-1.1.8`, left alone today) needs new words when main is next brought into it.
