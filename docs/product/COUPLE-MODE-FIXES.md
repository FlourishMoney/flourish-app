# Couple mode: code-audit fixes (PR #108)

Migrations 0030 and 0031 have **not run**, so every database fix is an edit in place.

**Paths.**
- `0030` and `0031` are the two migrations in `supabase/migrations/`.
- `household.js` on its own means the server's `netlify/functions/household.js`.
- `_lib/…` means `netlify/functions/_lib/…`.
- The app's `src/lib/household.js` is always written out in full.

Line numbers are as of the commit this file ships in.

**Test suites.** Each test is named by its suite and check id:
- **sql** is `tests/household.sql.test.cjs`, which runs every migration in a real Postgres (also on CI).
- **server** is `tests/householdServer.test.cjs`.
- **client** is `tests/householdClient.test.cjs`.
- **browser** is `tests/householdFlow.browser.test.cjs`.

## Round 3: audit of f9451a9

Grok said READY. ChatGPT found b, c and d fixed and the round 1 fixes intact, and left these open.

| # | Finding | Fix (file:line) | Tests |
|---|---|---|---|
| a1 | **The app could release its own hold.** `store_hold` with state `released` deleted the hold, so a pending store purchase could be released, a second purchase started, and both completed. | **The app can never end a hold.** `store_hold` hears only `pending` (or no state); anything else, `released` included, gets a 400 before anything is read (`billing.js:270`). The release-by-attempt function is gone from the database; the only release left is the store's report (see a3). **App:** a cancelled or failed sheet tells the server nothing (`storeBilling.js:174`); its hold lapses on its own. So the same person is not stopped by their own hold, one attempt id is kept across taps for 20 minutes (`storeBilling.js:143`, `App.jsx:14073`), and a paid purchase starts the next afresh (`storeBilling.js:179`). | sql 10i (no release call exists; the hold still refuses others); server 8r, 8s (`released` and five other words refused, nothing released or written), 8z2-8z5 |
| a2 | **Hold lifetimes slid.** Asking again for the same attempt, or saying `pending` again, pushed the end later, so one member could hold the household for ever. | **Every hold's end is fixed from when its attempt began** (`0031:294`). Asking again for the same attempt answers with the end it already has (`0031:324`); a pending attempt asking again is refused (`0031:323`). **Pending** is for a store hold only, never a web checkout (`0031:346`), and is set once, to 7 days from when the attempt began (`0031:350`). | sql 10e, 10e2 (asked five more times 20 minutes in: the end does not move), 10l, 10l2, 10s0 (7 days from the start, not from now), 10z-10z2 (a web checkout can't be made pending) |
| a3 | **The webhook released with a null attempt,** which could clear a newer, unrelated hold. | **Only the matching store hold ends.** RevenueCat carries no attempt id of ours, so its report is matched by person, store and time: it ends that person's hold on the store that reported, only if the hold began no later than the report (`0031:361`, `:369`). The time is RevenueCat's own event time, which a late or retried delivery keeps (`revenuecat-webhook.js:35`, `:119`). A web checkout's hold, the other store's, and a newer attempt's are never touched. The app's own sync releases the same way, once the server has read the store's record (`billing.js:211`, via `_lib/household.js:209`). | sql 10n2, 10o, 10x (a late report never ends a newer Stripe hold), 10y-10y4 (a late Google Play report leaves a newer store attempt held); server 8v-8v4 (the real webhook: store and event time passed, never a null release) |
| NEW HIGH | **The ownership write failed open.** `recordAccountOwners` swallowed database errors, and `get_accounts` and `get_transactions` still returned bank data. | **Fails closed.** Any error except the table not existing yet throws (`_lib/household.js:234`). `plaid.js` then answers 503 with no financial data (`plaid.js:859`). For transactions, the record is written before the sync's cursor moves on (`plaid.js:1005`, set up at `:291`), so a 503 loses nothing: the next sync returns the same transactions. The older-call fallback records first too (`plaid.js:297`). | server 11j (accounts: 503, none returned), 11k (transactions: 503, none returned, the cursor has not moved), 11l (the partner reading the owner's bank: the same, and no cursor of theirs saved), 11m (the fallback path); 11h (before 0031 runs: 200, as today). `tests/loanActivity.test.cjs` drives the real `get_transactions`; its database stand-in now accepts the write, as the real database does, and its checks are unchanged. |
| NEW MEDIUM | **Ownership rows outlived a deleted sign-in.** Deleting an `auth.users` row directly left its `plaid_account_owners` rows. | **A trigger on `auth.users`, before delete** (`0031:586`, created at `:605`). Under the household lock it first takes the member's banks out of the shared blob, while the ownership rows and Plaid rows still exist (`0031:595`). Then it deletes that user's ownership rows (`0031:598`). For someone in no household, only the rows go. | sql 12j (strengthened: an account only the ownership record knew is removed too), 12m (0 rows left for the deleted partner, the owner's kept), 12n (in no household: 0 rows), 12o (an owner deleted directly: the partner is promoted, the bank leaves, 0 rows) |

## Round 2: re-audit of 0355d3a

Grok said READY. ChatGPT found B1, H2, H3, M6 and the LOW fixed, and left these open.

| # | Finding | Fix (file:line) | Tests |
|---|---|---|---|
| a | **The same person could replace their own hold.** They could open a Stripe checkout, then start a store purchase. A pending store purchase also outlived the 32-minute lease. | **One attempt per hold.** The holds table records the attempt that holds it, as `attempt_id` (`0031:104`). Only that attempt may ask again (`0031:323`; since round 3 this never moves its end). Any other live attempt is refused, whoever makes it and on whatever platform (`0031:308`). **One replacement allowed:** the same person's own earlier Stripe checkout, once Stripe reports it expired (`0031:326`, `billing.js:389`). **Pending:** a pending store purchase keeps the hold until the store reports (`0031:341`), with 7 days as the backstop. The store's report ends it (round 3 a3 has how). **Web checkout:** a household checkout is created first and holds under its own session id (`billing.js:383`). If refused, it is expired at Stripe at once (`billing.js:377`). **Store app:** each purchase gets its own id (`storeBilling.js:158`), and "pending" is reported for that id (`storeBilling.js:175`, `billing.js:267`, `App.jsx:14113`). | sql 10a-10w: same user Stripe then iOS (10c), Stripe then Android (10d), iOS then Android (10j-10k), pending for over 32 minutes (10m), backstop (10s). server 8a-8z5. |
| b | **Non-text blocks reached the provider.** Message blocks other than text were passed through unchanged. | **Input check:** only strings and `{type:"text", text}` blocks are accepted, and only the app's own keys. Anything else gets a 400 before any read and before any provider call (`_lib/coachRedact.js:97`, `coach.js:207`). **Last step before the provider:** it refuses a non-text block too (`_lib/coachRedact.js:122`). **App:** the chat no longer sends its day dividers, which had role `system`, as messages (`App.jsx:13117`). | server 12a (9 refused shapes, each carrying a household name: no read, no fetch), 12b-12d |
| c | **Disconnect deleted the ownership row first.** The bank's data was then left in the shared blob, with nothing to say whose it was. | **One-transaction disconnect** (`0031:481`). Under the household lock it checks the bank is the caller's (`0031:486`). It removes everything from that bank, using the shared strip (`0031:402`). Only then does it delete the `plaid_items` row (`0031:502`). `delete_item` and both duplicate clean-ups go through it (`plaid.js:532`, `:237`, `:575`, via `_lib/household.js:241`). **Ownership record:** the server records who linked each bank account, from Plaid's own answers, against the linker (`0031:118`, `_lib/household.js:223`, `plaid.js:257`, `:291`). Leave's cleanup reads it (`0031:464`), and so does a sign-in deleted without leaving (since round 3 `0031:586`, then `0030:263`). The record outlives the Plaid row, and is deleted with the account (`plaid.js:781`). | sql 12a-12l (link and stamp, disconnect, nothing remains; a bank disconnected the old way, then removal, nothing remains; a deleted sign-in); server 11a-11m |
| d | **A leaked link could kill an invite.** Opening a valid link from the wrong account counted as a strike against it. | A valid link opened by the wrong account is counted against that account and its network only. It is never counted against the invite or the invited address (`0031:260`). Only code guesses strike an invite (`0031:261`). | sql 13a-13d (six wrong-account opens: no strike, nothing counted against the invited address, the invited person still joins) |

## Round 1: audit of 6941969

ChatGPT said NOT READY; Grok said READY with one LOW.

| # | Finding | Fix (file:line) | Tests |
|---|---|---|---|
| B1 | **Remove without a lock.** `household_remove_partner` checked owner and partner without locking. | It locks the household row first. Under the lock it re-checks that the caller is still the owner, and who the partner is. The removal happens in the same transaction (`0031:566`). `household_leave` also re-reads membership under the lock (`0031:548`). Both use one inner function that nothing else may call (`0031:512`). The trigger for a deleted owner takes the same lock (`0030:253-256`). | sql 9a-9i |
| H2 | **Code brute force.** Guesses could be spread across many accounts. | **Limits:** per account, per invited address and per network, each counted under an advisory lock (`0031:223-239`). **Recording:** every failed try is written in the same transaction, unknown codes included (`0031:259`). **Invite strikes:** a code dies after 5 wrong guesses (`0031:72`, `0031:261-266`). **Storage:** the attempts table (`0031:83`); the network is kept as a keyed hash (`_lib/household.js:83`, `household.js:155`). | sql 8a-8q; a code works only for its own address: sql 8a-8b, 8i, 3g; server 7a-7d |
| H3 + M6 | **Personal consent in the shared blob.** | **Private table:** one row per person (`0030:66`). RLS lets only `auth.uid()` reach its own row (`0030:181-189`). **Shared blob:** a trigger strips personal keys from every write (`0030:200-203`). **Key list:** `0030:132` matches `src/lib/household.js:25`. **Moving keys:** at invite (`0031:166`) and at join (`0031:281`). **App:** reads at `App.jsx:17827`; saves at `App.jsx:17710`, through `persistence.js:262` and `:269`; builds the shared blob without them (`src/lib/household.js:54-60`). **Server:** reads consent only from the asker's own `profiles` row (`coach.js:243`). | sql 7a-7q, 11p; client 1a-1m, 2d; browser 2h, 3e2, 3f2 |
| H4 | **Names at the AI provider.** | **One path out:** every provider request goes through `providerFetch` (`coach.js:32`), at three call sites (`:83`, `:124`, `:452`). **Redaction:** names are swapped for roles at that point (`_lib/coachRedact.js:119`). **Name source:** the names are read from the asker's side (`:137`). If they cannot be read, nothing is sent (`coach.js:279`). | server 10a-10f |
| H5 | **Two purchases at once.** | **Hold:** `0031:308` and `_lib/household.js:189`; see round 2 a. **Reconciliation:** the extra plan follows one rule (`_lib/household.js:257`). It is logged, flagged and its holder told (`household.js:65`). If it is ours it is set to end at period end (`_lib/household.js:287`). It runs after paid Stripe events (`stripe-webhook.js:301`, `:381`), store events (`revenuecat-webhook.js:117`) and a join (`household.js:157`). **Resume:** our extra plan comes back on leave, removal or account deletion (`_lib/household.js:320`, `household.js:169`, `:176`, `plaid.js:771`). | sql 10a-10z2; server 8a-8z5, 9a-9o, 6d-6d2 |
| M7 | **Derived data left behind.** | **Inventory:** the strip's header comment (`0031:374`). **Strip:** everything made from the departed member's accounts (`0031:402`, `:451`). **Liabilities bug:** they are an object of lists, which the old strip missed (`0031:421`). **Meeting records:** records since joining move to whoever stays (`0031:523`); none from before joining are visible (`0030:114`, `:195`). **App:** the merge keeps removals (`src/lib/household.js:79`, `:118`, `:162`); the phone's local copies are cleared (`src/lib/household.js:127`, `App.jsx:17783`); accounts are stamped with their item (`App.jsx:4287`, `:18695`). | sql 11a-11p; client 2h-2m |
| LOW | **Partner's old `user_data` kept.** | Deleted on join, after their own keys move to their private row (`0031:281-285`). | sql 7c-7d; browser 3e3 |

## Why deleting the partner's `user_data` on join is safe
- **Their consent screen:** it already says their own data is replaced, not combined.
- **Never read:** a member's app never reads `user_data`.
- **Leaving:** starts them fresh anyway.
- **Last one out:** gets the household's data written back.

## Choices made
- **Which plan is the extra one:**
  1. A founding price is kept.
  2. Then a store plan is kept over ours, since we can stop ours.
  3. Then the owner's is kept.
- **No automatic refunds.** Our extra Stripe plan is set to end at the end of its paid period and flagged for support (`household_two_paid`). A refund for a period already paid is support's call.
- **No new support email.**
- **A pending store purchase has a backstop.** It holds the household until the store reports, for 7 days at most, so a store that never reports cannot block the household for ever.
- **The app's word ends nothing; time does** (round 3). A cancelled store sheet can't be confirmed with the store (RevenueCat hears of no purchase), so its hold just lapses: 32 minutes from the tap at most. The app keeps one attempt id for 20 minutes, so a retry is the same attempt and opens at once, with at least 12 minutes of hold left for the store's sheet. A tap after that is a new attempt and waits for the old hold to lapse; the person sees the existing "didn't complete" line.
- **"Pending" is still the app's word** (round 3), because the store tells only the app. It is limited: store holds only, set once, and 7 days from when the attempt began.
- **The store's report is matched by person, store and time** (round 3), because RevenueCat carries no attempt id of ours.
- **The owner id lives on the server, per account.** It is in `plaid_account_owners`, recorded from Plaid's own answers, rather than as a stamp in the shared blob that either member could edit. Every derived record is matched to it through its account id. That covers records whose account had already been removed.

## Known limits
- **Records keyed by a bank transaction's id:** category corrections and deposit answers. The database cannot match them, because bank transactions are never stored. The other member's app removes the ones for transactions it holds; any others stay as orphaned entries that show nothing.
- **An account the server never saw listed** (linked before this change and not refreshed since) is matched by its item stamp, or by a bank only the leaver linked.
- **Purchases back to back** (round 3). A member who starts one purchase after another can keep the other from starting one. Each hold still ends at its fixed time, and the owner can remove a partner, or a partner can leave.
