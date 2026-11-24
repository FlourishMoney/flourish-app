# Free v1 on the website

Branch `free-v1-web`, from main `f048f72` (2026-11-23). Website only. The iPhone and Android apps keep today's rules until their next store builds.

## What changed

**A. No bank on Free, enforced by the server** (`netlify/functions/plaid.js`, `netlify/functions/_lib/freeBanks.js`)

- The free plan connects 0 banks from the website. A store app keeps today's 1 bank, told apart by the Origin its WebView sends.
- A new bank is refused at `create_link_token`, before Plaid opens.
- The exchange: on the website's free plan it goes on only for a bank the account already holds (a reconnect in Plaid's update mode). Any other bank is removed at Plaid at once and refused.
- The old-bank import (`migrate_items`): 0 new banks on the website; a bank the account already holds is its own.
- Unchanged:
  - a reconnect is never refused;
  - paid, trial (account, Stripe or store), founder, gift and partner cover are unlimited;
  - a plan the server can't read behaves as before (the link opens, the exchange is 503).

**B. The plans screen closes onto Free** (`src/lib/trialPlanFirst.js`, `src/App.jsx`)

- On the website, a new account with no plan, or one whose subscription ended, sees the plans once and can close them. Closing keeps the account on Free.
- A store app is still held at its plans screen, as today.

**C. The website's bank buttons on Free** (`src/App.jsx`)

- These places show the free-bank line and a button that opens the plans, never "Couldn't reach your bank", and Plaid never opens:
  - onboarding's bank step;
  - Settings' "+ Connect a Bank";
  - a reconnect with no bank;
  - a refused exchange.
- In onboarding, the statement upload and "Enter it myself" stay. The plans open over the step and close back to it.
- Once the server says the account is paid or covered, the step asks again.

**Word slots** (`src/lib/freeWords.js`, `netlify/functions/_lib/freeWords.js`, listed in `docs/product/FREE-V1-WORDS.md`)

- 13 slots, plus the Terms' new date (`FREE_TERMS_DATE`).
- `tests/freeV1Words.test.cjs` fails while any slot is a placeholder or the date is unset. It runs last in `test:math`, so every other suite still runs.
- The production build refuses the placeholders as well (`scripts/check-pending-words.mjs`).

## Review round 1 (2026-11-23: Grok 100, Gemini 92, ChatGPT 72)

- A refused bank is cleaned up durably (ported from plus-1.1.8, no migration): a refused row keeps the Item until Plaid
  confirms the removal or says it is gone, tried again when the banks are listed (finishRefusedBanks); the error tracker
  is told the Item and the path, never the token. When ownership cannot be read, nothing is removed: an insert-if-absent
  of the refused row tells a new bank from the account's own. Refused rows are never listed, counted, read,
  reconnected, held by migrate_items, or revived by the webhook (`tests/freeV1RefusedBank.test.cjs`).
- migrate_items answers a retryable 503 before any token when either read of the held banks fails.
- Onboarding's stale refusal: retried once per visit to the bank step while paid, with a fresh link token; no loop if
  the server disagrees. No bank error beside the free-bank line (`tests/freeV1Web.browser.test.cjs` 4 to 6).
- Known defects 70 (Origin is not authenticated; the one-bank count is not atomic) and 71 (a plan ending mid-exchange).
- `FREE_TERMS_DATE` is 2026-11-24, the go-live day.

## Not in this branch

- Removing a bank at the end of a paid period (a bank kept after a trial ends stays connected and billed for now).
- Typing one transaction; statement import outside onboarding.
- The new onboarding; the checklist with its ring.
- Unlimited What-If: Free keeps 1 a day.
- The store apps' rules, which change with their next builds.
- `plus-1.1.8`, which is left alone. When main is next merged into it:
  - `plaid.js`, `upgradeFlow.js`, the plans tests and `package.json` will need resolving;
  - its own line "The free plan connects one bank. A flourish subscription connects more." needs new words.
