# Couple mode: code-audit fixes (PR #108)

Audited: 6941969. ChatGPT said NOT READY; Grok said READY with one LOW. Every item is fixed on branch `couple-mode`. Migrations 0030 and 0031 have **not run**, so they were edited in place.

Paths: `0030` and `0031` are the two migrations in `supabase/migrations/`. `household.js` alone is the server's `netlify/functions/household.js`; `_lib/…` is under `netlify/functions/`; the app's `src/lib/household.js` is always written in full. Line numbers are at the commit this file ships in.

Test names give the suite and its check ids:
- **sql** is `tests/household.sql.test.cjs`, which runs in a real Postgres and on CI.
- **server** is `tests/householdServer.test.cjs`.
- **client** is `tests/householdClient.test.cjs`.
- **browser** is `tests/householdFlow.browser.test.cjs`.

| # | Finding | Fix (file:line) | Tests |
|---|---|---|---|
| B1 | `household_remove_partner` checked owner and partner without a lock | Takes the household row lock first, checks under the lock that the caller is still the owner and who the partner is, then removes in the same transaction: `0031:434`. `household_leave` re-reads membership under the lock: `0031:416`. Both use one inner function nobody else can call: `0031:380`. The owner-deletion trigger takes the same lock: `0030:250-253`. | sql 9a-9i (remove vs leave, both orders; vs owner account deletion; vs owner leaving; remove then deletion) |
| H2 | Code brute force across accounts | **Locking:** per-account, per-invited-address and per-network counts are each taken under an advisory lock, always in the same order: `0031:192-209`. **Recording:** every failed try is written in the same transaction as its answer, unknown codes included: `0031:228`. **Per invite:** an invite dies after 5 wrong tries: `0031:61` and `0031:231-242`. **Attempts table:** `0031:72`. **Network key:** a keyed hash, never the IP: `_lib/household.js:83`, passed in at `household.js:155`. | sql 8a-8q (the burst test: 12 tries at once stop at 10). Code works only for the invited address: sql 8a-8b, 8i, 3g; server 7a-7d. |
| H3 + M6 | Personal AI and Plaid consent in the shared blob | **Private table:** one row per person, `household_member_private` (`0030:66`). RLS allows only `user_id = auth.uid()`: `0030:181-189`. **Shared blob:** a trigger strips personal keys and any `personal` section from every write: `0030:200-203`. **Key list:** `0030:132` matches `src/lib/household.js:25`. **Moves:** the owner's keys move at invite (`0031:137`), the partner's at join (`0031:257`). **App:** reads at `App.jsx:17821`; saves at `App.jsx:17704` with `persistence.js:262-269`; the blob carries shared keys only (`src/lib/household.js:54-60`). **Server:** reads consent only from the asker's own `profiles` row (`coach.js:236`), never from a blob. | sql 7a-7q, 11p; client 1a-1m, 2d; browser 2h, 3e2, 3f2 |
| H4 | Names at the AI provider | Every provider request goes through `providerFetch` (`coach.js:32`), at all 3 call sites (`coach.js:83`, `:124`, `:445`). It redacts the system prompt and every message (`_lib/coachRedact.js:92`). Names are read from the asker's side (`coachRedact.js:106`). If the names cannot be read, nothing is sent (`coach.js:272`). | server 10a-10f. Both members' names, and a child's, are put in the profile, the context and the messages. The test asserts none appear in any serialized request. Server rules match the app's. |
| H5 | Two purchases at once, on two platforms | **Hold:** `household_purchase_holds` and `household_hold_purchase` (`0031:93`, `:270`); `holdPurchase` (`_lib/household.js:183`). **Web checkout:** holds a household member only (`billing.js:336`); the session ends before the hold does (`billing.js:351`). **Store app:** `store_hold` (`billing.js:257`), asked before the sheet opens (`storeBilling.js:138`, `App.jsx:14108`). **Reconciliation:** one rule picks the extra plan (`_lib/household.js:200`). The extra is logged, flagged, and its holder told (`household.js:65`). If it is ours it is set to end at period end (`_lib/household.js:230`). Reconcile runs after paid Stripe events (`stripe-webhook.js:301`, `:381`), store events (`revenuecat-webhook.js:103`, `billing.js:205`) and a join (`household.js:157`). Resume on leave, remove or account deletion: `_lib/household.js:263`, `household.js:169`, `:176`, `plaid.js:765`. | sql 10a-10g; server 8a-8n, 9a-9o, 6d-6d2 |
| M7 | Derived data left behind after leave or remove | **Inventory** is in the strip's header comment (`0031:292-310`). **SQL strip** (`0031:318`) removes the departed member's accounts, including unstamped ones at a bank only they linked. With them go transactions, liabilities, investments, bank debts and links to them, "different" answers, bill-to-debt links and the cached pay suggestion; `bankConnected` is recomputed. **Liabilities bug:** they are an object of lists, and the old strip never matched them: `0031:348`. **Meeting records:** records since joining move to the member who stays (`0031:391`); none from before joining are visible (`0030:114`, `:195`). **App:** the merge keeps removals (`src/lib/household.js:79`, `:118`, `:162`) and clears local copies (`src/lib/household.js:127`, `App.jsx:17777`). New accounts are stamped with their item (`App.jsx:4287`, `:18689`). | sql 11a-11p (11o: the app's strip equals the database's on the same data); client 2h-2m |
| LOW | Partner's old `user_data` kept after joining | Deleted on join, in the same transaction, after their own keys move to their private row: `0031:257-261`. | sql 7c-7d; browser 3e3 |

## Why the LOW delete is safe
- The partner's consent screen already says their data is replaced, not combined.
- A member's app never reads `user_data`.
- Leaving starts them fresh anyway.
- The last one out gets the household's data written back.

## Choices made
- **Which plan is the extra one:**
  1. A founding price is kept.
  2. Then a store's plan is kept over ours, since we can stop ours.
  3. Then the owner's is kept.
- **No automatic refunds.**
  - Our extra Stripe plan is set to end at the end of its paid period and flagged for support (`household_two_paid`).
  - A refund for a period already paid is support's call, as with every other double subscription.
- **No new support email.** The flag and the log line record it; nothing new is emailed.

## Known limits
- Category corrections and deposit answers are keyed by a bank transaction's id. The database cannot match them, because bank transactions are never stored.
  - The other member's app removes the ones for transactions it holds.
  - Any others stay as orphaned entries showing nothing.
