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

## It never touches production

| What | In the test |
|---|---|
| Database and sign-in | A throwaway Supabase (Postgres, Auth, REST) started inside the run by `supabase start`, built from `supabase/migrations`, gone when the run ends. No project, no cost, no secret. |
| Server functions | The real ones in `netlify/functions`, run on the same machine by `server.cjs`. |
| Bank | Plaid sandbox only. `server.cjs` refuses to start unless `PLAID_ENV` is `sandbox` and Supabase is on this machine. |
| The app's requests | `run.cjs` checks every one. The store build's calls to `flourishmoney.app/api` are answered locally. Any other request to flourishmoney.app or to production's Supabase is refused and fails the run. |
| Email, payments, AI | No key for any of them is given to the test, and the server refuses to start if one is. |

## When it fails

The run is red, a picture of every step is kept with the run (30 days), and one email goes to hello@flourishmoney.app naming the device and the step. A pull request's own run is red on the pull request and sends no email.

## Secrets (repository secrets)

| Name | What it is | Needed for |
|---|---|---|
| `PLAID_CLIENT_ID` | The Plaid client id | step 5 |
| `PLAID_SANDBOX_SECRET` | Plaid's **Sandbox** secret (never the Production one) | step 5 |
| `NIGHTLY_RESEND_API_KEY` | A Resend key with sending access only | the failure email |

Without the two Plaid secrets the test fails at step 5 and says so. Without the Resend key a failure is still red, with pictures, but no email goes out.

## Running it

- Every night at 3:17 am Eastern, once the workflow is on `main`.
- By hand: GitHub, Actions, "nightly end-to-end", Run workflow. Choosing `manual` runs a rehearsal that types the balance by hand at step 5 and connects no bank: it tells you whether a failure is Plaid's or ours.
- Fire drill: tick `drill` when running by hand. The run fails on purpose after the first step and sends the email, so you can see the alert arrive. (On a pull request that changes the test, the label `nightly-fire-drill` does the same.)
- On this Mac: `supabase start --workdir e2e/nightly`, `node e2e/nightly/setup-db.cjs`, build the two apps, `node e2e/nightly/server.cjs`, `node e2e/nightly/run.cjs` (the workflow file is the exact recipe).

## Known limits

- It is a browser, not a phone: Apple's and Google's sign-in sheets, the stores' purchase sheets and the real status bar are not exercised.
- The throwaway database is built from `supabase/migrations`. Production also has two pieces that no migration creates (the table `public.coach_usage` and the column `plaid_items.transactions_pending`); the functions log their absence and carry on, so those two are not exercised.
- Plaid changes its sandbox screens from time to time. Step 5 reads what is on the screen and acts on it, and names what it saw when it cannot go on.
