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

## Round 2: re-audit of 0355d3a

Grok said READY. ChatGPT found B1, H2, H3, M6 and the LOW fixed, and left these open.

| # | Finding | Fix (file:line) | Tests |
|---|---|---|---|
| a | **The same person could replace their own hold.** They could open a Stripe checkout, then start a store purchase. A pending store purchase also outlived the 32-minute lease. | **One attempt per hold.** The holds table records the attempt that holds it, as `attempt_id` (`0031:100`). Only that attempt may refresh the hold (`0031:314`). Any other live attempt is refused, whoever makes it and on whatever platform (`0031:299`). **One replacement allowed:** the same person's own earlier Stripe checkout, once Stripe reports it expired (`0031:318`, `billing.js:383`). **Pending:** a pending store purchase keeps the hold until the store reports (`0031:331`), with 7 days as the backstop. Completed, cancelled or failed ends it (`0031:343`, `billing.js:209`, `revenuecat-webhook.js:108`). **Web checkout:** a household checkout is created first and holds under its own session id (`billing.js:377`). If refused, it is expired at Stripe at once (`billing.js:371`). **Store app:** each tap gets its own id (`storeBilling.js:145`), and the store's answer is reported for that id (`storeBilling.js:162`, `billing.js:261`, `App.jsx:14109`). | sql 10a-10w: same user Stripe then iOS (10c), Stripe then Android (10d), iOS then Android (10j-10k), pending for over 32 minutes (10m), backstop (10s). server 8a-8z3. |
| b | **Non-text blocks reached the provider.** Message blocks other than text were passed through unchanged. | **Input check:** only strings and `{type:"text", text}` blocks are accepted, and only the app's own keys. Anything else gets a 400 before any read and before any provider call (`_lib/coachRedact.js:97`, `coach.js:207`). **Last step before the provider:** it refuses a non-text block too (`_lib/coachRedact.js:122`). **App:** the chat no longer sends its day dividers, which had role `system`, as messages (`App.jsx:13117`). | server 12a (9 refused shapes, each carrying a household name: no read, no fetch), 12b-12d |
| c | **Disconnect deleted the ownership row first.** The bank's data was then left in the shared blob, with nothing to say whose it was. | **One-transaction disconnect** (`0031:459`). Under the household lock it checks the bank is the caller's (`0031:464`). It removes everything from that bank, using the shared strip (`0031:380`). Only then does it delete the `plaid_items` row (`0031:480`). `delete_item` and both duplicate clean-ups go through it (`plaid.js:527`, `:237`, `:570`, via `_lib/household.js:230`). **Ownership record:** the server records who linked each bank account, from Plaid's own answers, against the linker (`0031:114`, `_lib/household.js:216`, `plaid.js:256`, `:294`). Leave's cleanup reads it (`0031:442`), and so does a sign-in deleted without leaving (`0030:263`). The record outlives the Plaid row, and is deleted with the account (`plaid.js:776`). | sql 12a-12l (link and stamp, disconnect, nothing remains; a bank disconnected the old way, then removal, nothing remains; a deleted sign-in); server 11a-11i |
| d | **A leaked link could kill an invite.** Opening a valid link from the wrong account counted as a strike against it. | A valid link opened by the wrong account is counted against that account and its network only. It is never counted against the invite or the invited address (`0031:256`). Only code guesses strike an invite (`0031:257`). | sql 13a-13d (six wrong-account opens: no strike, nothing counted against the invited address, the invited person still joins) |

## Round 1: audit of 6941969

ChatGPT said NOT READY; Grok said READY with one LOW.

| # | Finding | Fix (file:line) | Tests |
|---|---|---|---|
| B1 | **Remove without a lock.** `household_remove_partner` checked owner and partner without locking. | It locks the household row first. Under the lock it re-checks that the caller is still the owner, and who the partner is. The removal happens in the same transaction (`0031:544`). `household_leave` also re-reads membership under the lock (`0031:526`). Both use one inner function that nothing else may call (`0031:490`). The trigger for a deleted owner takes the same lock (`0030:253-256`). | sql 9a-9i |
| H2 | **Code brute force.** Guesses could be spread across many accounts. | **Limits:** per account, per invited address and per network, each counted under an advisory lock (`0031:219-235`). **Recording:** every failed try is written in the same transaction, unknown codes included (`0031:255`). **Invite strikes:** a code dies after 5 wrong guesses (`0031:68`, `0031:257-262`). **Storage:** the attempts table (`0031:79`); the network is kept as a keyed hash (`_lib/household.js:83`, `household.js:155`). | sql 8a-8q; a code works only for its own address: sql 8a-8b, 8i, 3g; server 7a-7d |
| H3 + M6 | **Personal consent in the shared blob.** | **Private table:** one row per person (`0030:66`). RLS lets only `auth.uid()` reach its own row (`0030:181-189`). **Shared blob:** a trigger strips personal keys from every write (`0030:200-203`). **Key list:** `0030:132` matches `src/lib/household.js:25`. **Moving keys:** at invite (`0031:162`) and at join (`0031:277`). **App:** reads at `App.jsx:17822`; saves at `App.jsx:17705`, through `persistence.js:262` and `:269`; builds the shared blob without them (`src/lib/household.js:54-60`). **Server:** reads consent only from the asker's own `profiles` row (`coach.js:243`). | sql 7a-7q, 11p; client 1a-1m, 2d; browser 2h, 3e2, 3f2 |
| H4 | **Names at the AI provider.** | **One path out:** every provider request goes through `providerFetch` (`coach.js:32`), at three call sites (`:83`, `:124`, `:452`). **Redaction:** names are swapped for roles at that point (`_lib/coachRedact.js:119`). **Name source:** the names are read from the asker's side (`:137`). If they cannot be read, nothing is sent (`coach.js:279`). | server 10a-10f |
| H5 | **Two purchases at once.** | **Hold:** `0031:299` and `_lib/household.js:187`; see round 2 a. **Reconciliation:** the extra plan follows one rule (`_lib/household.js:246`). It is logged, flagged and its holder told (`household.js:65`). If it is ours it is set to end at period end (`_lib/household.js:276`). It runs after paid Stripe events (`stripe-webhook.js:301`, `:381`), store events (`revenuecat-webhook.js:107`) and a join (`household.js:157`). **Resume:** our extra plan comes back on leave, removal or account deletion (`_lib/household.js:309`, `household.js:169`, `:176`, `plaid.js:766`). | sql 10a-10w; server 8a-8z3, 9a-9o, 6d-6d2 |
| M7 | **Derived data left behind.** | **Inventory:** the strip's header comment (`0031:352`). **Strip:** everything made from the departed member's accounts (`0031:380`, `:429`). **Liabilities bug:** they are an object of lists, which the old strip missed (`0031:399`). **Meeting records:** records since joining move to whoever stays (`0031:501`); none from before joining are visible (`0030:114`, `:195`). **App:** the merge keeps removals (`src/lib/household.js:79`, `:118`, `:162`); the phone's local copies are cleared (`src/lib/household.js:127`, `App.jsx:17778`); accounts are stamped with their item (`App.jsx:4287`, `:18690`). | sql 11a-11p; client 2h-2m |
| LOW | **Partner's old `user_data` kept.** | Deleted on join, after their own keys move to their private row (`0031:277-281`). | sql 7c-7d; browser 3e3 |

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
- **The owner id lives on the server, per account.** It is in `plaid_account_owners`, recorded from Plaid's own answers, rather than as a stamp in the shared blob that either member could edit. Every derived record is matched to it through its account id. That covers records whose account had already been removed.

## Known limits
- **Records keyed by a bank transaction's id:** category corrections and deposit answers. The database cannot match them, because bank transactions are never stored. The other member's app removes the ones for transactions it holds; any others stay as orphaned entries that show nothing.
- **An account the server never saw listed** (linked before this change and not refreshed since) is matched by its item stamp, or by a bank only the leaver linked.
