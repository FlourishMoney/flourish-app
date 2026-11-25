# The nightly end-to-end test

Real people could not connect a bank from launch to November 11, 2026, and nobody noticed. This test walks a new household's first ten minutes every night, so a broken step is caught within a day.

## What it does

On the iPhone app, the Android app and the website (the built app, in a browser the size of each):

1. fresh visit
2. sign up, with a throwaway address
3. the AI notice
4. "Before you start"
5. connect a bank: Plaid's sandbox, as Plaid's standard test user
6. first number
7. "Choose your plan"
8. Delete Account
9. the account is gone (asked of the database, not of the app)

The website walks the free plan, as a new website account does since Free v1 (PR #158): at step 5 the server refuses a bank (the run has `ENFORCE_PLAN_LIMITS` on, as the live site does) and the app shows the free plan's bank line, so the balance is typed by hand; at step 7 the plans open once and their close button goes onto the free plan, which Settings then confirms; at step 8 the account is deleted from Settings. The iPhone and Android apps still connect one sandbox bank, are held at "Choose your plan", and delete from there. The screens' words are read from `src/lib/upgradeFlow.js` and `src/lib/freeWords.js`, so a change of approved words does not break the walk.

## It never touches production

| What | In the test |
|---|---|
| Database and sign-in | A throwaway Supabase (Postgres, Auth, REST) started inside the run by `supabase start`, built from `supabase/migrations`, gone when the run ends. No project, no cost, no secret. |
| Server functions | The real ones in `netlify/functions`, run on the same machine by `server.cjs`. |
| Bank | Plaid sandbox only. `server.cjs` refuses to start unless `PLAID_ENV` is `sandbox` and Supabase is on this machine. |
| The app's requests | `run.cjs` checks every one. The store build's calls to `flourishmoney.app/api` are answered locally. Any other request to flourishmoney.app or to production's Supabase is refused and fails the run. |
| Email, payments, AI | No key for any of them is given to the test, and the server refuses to start if one is. |

## When it fails

The run is red, a picture of every step is kept with the run (30 days), and GitHub sends its own "Run failed" email. The step that broke is in that email (as an error annotation) and at the top of the run's summary.

GitHub sends a scheduled run's email to the person who last changed the schedule line in the workflow file (here, the FlourishMoney account that merged it), if that account has Settings, Notifications, System, Actions set to email, failed workflows only.

## Secrets (repository secrets)

| Name | What it is | Needed for |
|---|---|---|
| `PLAID_CLIENT_ID` | The Plaid client id | step 5 on the two phone apps |
| `PLAID_SANDBOX_SECRET` | Plaid's **Sandbox** secret (never the Production one) | step 5 on the two phone apps |

Without them the test fails at step 5 and says so.

## Running it

- Every night at 3:17 am Eastern, once the workflow is on `main`.
- By hand: GitHub, Actions, "nightly end-to-end", Run workflow. Choosing `manual` runs a rehearsal that types the balance by hand at step 5 and connects no bank: it tells you whether a failure is Plaid's or ours.
- On a pull request: when it changes the test, any of `src/App.jsx` (which holds the plans screens), the plans' rules, words and prices in `src/lib`, or the server's bank limit, plan, entitlement and billing code in `netlify/functions` (the full list is the workflow's `paths`). A label other than `nightly-fire-drill` never starts or cancels a run.
- Fire drill: tick `drill` when running by hand. The run fails on purpose after the first step and GitHub sends its failure email, so you can see the alert arrive. (On a pull request that changes the test, the label `nightly-fire-drill` does the same.)
- On this Mac: `supabase start --workdir e2e/nightly`, `node e2e/nightly/setup-db.cjs`, build the two apps, `node e2e/nightly/server.cjs`, `node e2e/nightly/run.cjs` (the workflow file is the exact recipe).

## Known limits

- It is a browser, not a phone: Apple's and Google's sign-in sheets, the stores' purchase sheets and the real status bar are not exercised.
- The throwaway database is built from `supabase/migrations`. Production also has two tables that no migration creates (`public.coach_usage` and `public.webhook_seen`, the bank webhook's replay list); the functions log their absence and carry on, so those two are not exercised. (Until 2026-11-23 the columns `plaid_items.transactions_pending` and `holdings_pending` were missing here too; migration 0056 makes them.)
- Plaid changes its sandbox screens from time to time. Step 5 reads what is on the screen and acts on it, and names what it saw when it cannot go on.
