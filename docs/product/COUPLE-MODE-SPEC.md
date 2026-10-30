# Couple mode v1: spec and plan (2026-10-29)

Branch `couple-mode` from main 7f02c1b (main 9247a43 merged in). Migrations `0030_couple_household.sql` and `0031_couple_household_private.sql` are written, **not run**. The words were approved by ChatGPT and Grok on 2026-10-29 (`COUPLE-MODE-WORDS.md`). The code audit's findings (ChatGPT, Grok, 2026-10-29) are fixed and mapped to their tests in `COUPLE-MODE-FIXES.md`.
Ships dark: the server answers 404 until `HOUSEHOLD_ENABLED=true` (Netlify), and the app shows Settings > Household only when the server answers.

**The switch is also the boundary for the migrations (audit round 4).** While `HOUSEHOLD_ENABLED` is off, a missing household table or function (Postgres 42P01 or 42883, PostgREST PGRST202 or PGRST205, a "schema cache" message) means 0030/0031 have not run, and every path behaves as it does today. Once it is on, the same error is a failure like any other, and everything fails closed: membership reads, purchase holds, the account record, disconnecting, the coach's names, billing and `/api/household` all answer 503 or 500 rather than "no household". Disconnecting may still delete a bank's row directly (without `household_disconnect_item`) only for someone a successful read shows is in no household. So the order is: run 0030, then 0031, then turn the switch on.
So the 1.1.3 store build can carry it before the migration runs.

## How it works
- **Today, every account is its own household.** The app saves one blob per person in `user_data`. That table has no migration in the repo; production made it. It stays exactly as it is for everyone who never invites anyone.
- **Invite (owner).**
  1. Settings > Household. The owner sees the consent screen, then types the partner's email.
  2. The server creates the household. It copies the owner's `user_data` blob into `household_data`, so the owner's data moves with them.
  3. The server makes an invite and emails a link. A 6-character code shows on the owner's screen for the store apps.
  - Each invite is tied to the partner's address: only an account signed in with that confirmed address can use the link or the code.
  - It expires after 7 days and can be used once. Sending a new invite cancels the old one.
  - The database stores only SHA-256 hashes of the link token and the code.
- **Join (partner).** The partner signs in or creates a login, opens the link or types the code, and sees the consent screen. Then the server adds them, in one locked transaction: it checks expiry, single use, the address and the 2-adult limit. The partner's phone then drops its own data and loads the household's.
  - A code is only ever matched among invites to the signed-in account's own confirmed address.
  - Failed tries are limited three ways, each counted under its own lock so tries at the same moment cannot slip past: 10 an hour per account, 10 an hour per invited address (whatever account tries), 30 an hour per network. The network is sent to the database as a keyed hash, never the IP address. Every failed try is recorded in the same transaction as its answer, unknown codes and links included, and kept a day.
  - An invite dies after 5 wrong code guesses from the invited account. The owner sends a new one. A valid link opened by an account with another address is counted against that account and its network only, never against the invite, so someone holding a leaked link cannot cancel it.
  - The partner's own keys (their AI and Plaid consent) move to their own private row, and their old `user_data` row is deleted: it is replaced by the household's, as their consent screen says, and it would never be read again.
- **Shared.** Today, Safe to spend, bills, paydays, debts, goals, budgets, the money meeting and corrections are all in the household blob (`household_data`). Both people read and write it.
  - Saves check a version number. If both edited at once, the app merges by section (bills, debts, and so on): a section only one person changed keeps that change; if both changed the same section, the later save wins.
  - The app re-reads the household when it comes back to the front.
- **Personal, per person:** AI consent and the coach switch, the plan cache, the Plaid consent time and the dismissed tips (`PERSONAL_SIDE_KEYS`, the same list as the database's `household_personal_keys()`).
  - They live in `household_member_private`, one row per person, which only that person can read, make or update (RLS on `auth.uid()`). They are never in the shared blob: a trigger takes them, and any `personal` section, out of every write to `household_data`, whoever makes it.
  - The server never reads consent from a blob: the coach's consent gate reads the asker's own `profiles` row, as before.
- **Banks.** Either person links their own bank, and both see every account.
  - The server lets a member use an item linked by anyone in the same household.
  - Only the person who linked a bank can disconnect or reconnect it, because the Plaid consent is theirs.
  - Disconnecting is one transaction on the server (`household_disconnect_item`): what came from that bank leaves the shared blob, then its Plaid row goes.
  - The server records who linked each bank account, from Plaid's own answers (`plaid_account_owners`), before it returns anything about that account: accounts, transactions, investments and liabilities. Leaving cleans up by that record, so it never depends on a Plaid row still being there. A record that cannot be written answers 503 with no bank data.
  - Each member has their own sync cursor (`plaid_item_cursors`), so one phone never consumes the other's new transactions.
- **Leave, remove, delete.**
  - Either person can leave, and the owner can remove the partner. The person who goes loses database access in the same transaction.
  - Every membership change takes the household's row lock first and reads membership again under it, and the trigger that promotes the partner when the owner's account is deleted takes the same lock. So a remove at the same moment as a leave or an ownership change runs one after the other, each on what the other left.
  - Their bank accounts leave the household blob with everything made from them: the transactions, liabilities (Plaid keeps these as an object of lists) and investments on them; the debts made from them and every link to those debts or accounts; the "these are different" answers that named them; and the cached pay suggestion. An older account saved before it was stamped with its Plaid item goes if it is at a bank only the leaver linked. Their banks stay linked to their own login.
  - The other member's app does the same when it merges (a removed account stays removed even if that phone changed its accounts), and clears what it keeps about those accounts outside the blob: the net-worth history, their loan activity, and the category corrections and deposit answers for their transactions.
  - The money meeting's records since the leaver joined move to the one who stays; the rest of the leaver's go. A member never reads the other's records from before the other joined.
  - Their `user_data` and private rows are deleted and their phone is wiped, so they start fresh.
  - If the owner deletes their account, the partner is promoted to owner by a trigger. When the last member goes, the household's data, with their own keys, goes back to their `user_data` row and the household goes.
- **One subscription.**
  - A paid subscription (web, App Store or Play) or a beta-founder flag on either member covers both.
  - Trials stay per person: otherwise a new email every 14 days would be a free plan.
  - A covered partner is never offered or sold a plan: checkout returns 409 and the store screen gets paid:true.
  - One purchase ATTEMPT at a time (`household_purchase_holds`). A Stripe checkout (its session id), or one tap in the store app (a random id), holds the household for 32 minutes. Any other attempt is refused, whoever makes it and on any platform, the same person's included: the only thing replaced is that person's own earlier web checkout once Stripe says it has expired. A household's Stripe checkout ends after 31 minutes, before its hold; one refused is expired at Stripe at once.
  - A store purchase the store calls pending holds the household for 7 days from when the attempt began.
  - **Every buyer has one purchase attempt, alone or not** (audit round 5, `purchase_attempts`), with the same fixed ends. Every web checkout and every store sheet records it first, and every web checkout ends after 31 minutes, before its attempt. While it lives, the person can't start another purchase, and can't create or join a household: the invite and the join answer `purchase_in_progress` (its line: `household.error.purchase_in_progress`). So a purchase begun alone can never complete inside a household that already pays.
    - Before refusing, the server ends what it can. An open web checkout is expired at Stripe; once Stripe confirms it has ended (or that it completed), that attempt is cleared and the invite or join goes ahead. A store purchase is cleared once it is on the person's own row from that store. A store sheet still open, or a pending purchase the store hasn't settled, is waited out.
    - A household purchase checks the buyer's own attempt, the household's hold, and the other member's own attempt. One lock per person (taken first by the purchase and by the invite and the join) means a purchase and a join never interleave, and billing reads the household's cover again once the attempt is recorded.
  - **No one joins a household that is holding a purchase** (audit round 6). An owner who invites and then buys alone holds their household; while that hold (or any member's own attempt) is live, the join answers `household_purchase_in_progress` (409; its line: `household.error.partner_purchase_in_progress`). It is not the joiner's attempt, so the server never ends it for them: the partner waits for it to finish or reach its fixed end (32 minutes, or 7 days once pending). It is read under the household's row lock, which the purchase takes too, so the two never interleave; if the join lands first, billing reads the household's cover again and refuses the purchase. Not a failed try: nothing is counted.
  - Every hold's end is fixed from when its attempt began (32 minutes, or 7 days once pending); asking again never moves it. Nothing ends a hold sooner (audit round 4): not the app (a cancelled or failed sheet lapses on its own, and the app keeps one attempt id for 20 minutes so a retry is the same attempt), and not a store's report or the app's sync, which cannot say which attempt they are about. A purchase that went through needs no release: it is a paid row, and every check reads that, and the other member's cover, before it looks at a hold.
  - If a household still ends up paying twice (both paid before joining, or a store purchase made outside the app), one rule picks the extra one: a founding price is kept; then a store's over ours (we can stop ours, not the store's); then the owner's. The extra one's holder is told, in the approved line, where to cancel it; its row is flagged for support (`support_flag = 'household_two_paid'`); it is logged; and if it is ours (Stripe) it is set to end at the end of the period it is paid for, so we never charge it again. This runs after every paid Stripe or store event, when someone joins, and on the Household screen.
  - When the two stop sharing (leave, remove, account deleted), a Stripe subscription we had set to end as the extra one is resumed.
  - Founding: the household is only ever sold one plan, so it takes one seat. The founding-seats work (0029, other session) still counts seats per account. If both already held a seat before joining, see Risks.
- **Coach:** still roles only. If the partner asks, the coach context swaps "you" and "your partner" (employment, incomes, age). Names and emails never go in.
  - The server enforces it at the last moment: every request to the AI provider (`coach.js providerFetch`) has the household's names, read from its saved profile from the asker's side, replaced by roles, and emails and account numbers masked, in the system prompt and every message. If the names cannot be read, nothing is sent.
  - The coach takes text only: strings and text blocks, in the keys the app sends. Anything else is refused (400) before any read or request.
- **Removed:** the fake Household tab (the FLRSH code, the "join" that always worked, `HOUSEHOLD_ENABLED=false`), the `household` state and the two "Household connected" chips.

## Tables touched (migration 0030, not run)
| table | change | RLS / grants |
|---|---|---|
| `households` new | id, created_by, owner_consented_at | select: members only; no client writes |
| `household_members` new | household_id, user_id (unique: one household each), role owner/partner, consented_at | select: people in the same household; no client writes; trigger enforces at most 2 members and exactly 1 owner, promotes on owner delete |
| `household_invites` new | email_key, token_hash, code_hash, expires_at, used_at/used_by, revoked_at, revoke_reason, failed_attempts | **no client access**; service role only |
| `household_join_attempts` new | user_id, target_key, net_key, invite_id, result, at | service role only |
| `household_data` new | household_id pk, data jsonb, version, updated_at | select + update: members only; no client insert/delete; anon nothing; a trigger strips personal keys from every write |
| `household_member_private` new | user_id pk, data jsonb (personal keys only), updated_at | select, insert, update: the row's own person only; nobody can move a row; anon nothing |
| `household_purchase_holds` new | household_id pk, user_id, provider, attempt_id, pending, expires_at | service role only |
| `purchase_attempts` new | user_id pk, provider, attempt_id, pending, expires_at, created_at (every buyer, round 5) | service role only |
| `plaid_account_owners` new | user_id, item_id, account_id (pk user_id + account_id), seen_at | service role only |
| `plaid_item_cursors` new | plaid_item_id, user_id, next_cursor | service role only |
| `meeting_records` | policy added: members read each other's records from the day the author joined | select own, or same household since the author joined |
| `plaid_items`, `subscriptions`, `profiles`, `user_data` | **no schema change** | plaid_items stays service-only; household access is checked in plaid.js and tested |

RPCs (security definer, `search_path` fixed, execute for service_role only):
- `household_create_invite`, `household_revoke_invite`
- `household_accept_invite` (refuses while the household's own purchase hold, or a member's own attempt, is live: round 6; locks the household, then its invite, in the same order as the invite and revoke functions: round 7)
- `household_hold_purchase`, `household_hold_pending` (no function ends a hold early; leaving takes the leaver's own)
- `purchase_attempt_begin`, `purchase_attempt_pending`, `purchase_attempt_clear` (every buyer's attempt; billing.js calls only `purchase_attempt_begin` and `purchase_attempt_pending`, which take a member's household hold too; only `/api/household` clears one, by its id, once the server has seen it can no longer charge)
- `household_disconnect_item`
- `household_leave`, `household_remove_partner` (both through `household_leave_locked`, which nobody may call directly)

A trigger on `auth.users` (`household_user_deleting`, before delete) takes a directly deleted sign-in's banks out of the shared blob, then deletes its rows in `plaid_account_owners`.

Three read helpers are used inside the policies (`is_household_member`, `shares_household_with`, `shares_household_record`). They are the only household functions granted to `authenticated`.

## Files
- **New:**
  - `netlify/functions/household.js` (`/api/household`), `_lib/household.js` (membership, invite secrets, the network key, purchase holds, the extra-plan rule and reconciliation)
  - `netlify/functions/_lib/coachRedact.js` (the coach's names become roles at the provider request)
  - `src/lib/household.js` (pure: merge, the personal/shared split, the account strip, coach roles, hydrate decision)
  - `src/lib/householdWords.js` (the approved words)
  - the Household settings screen (`HouseholdSection` in `App.jsx`)
  - tests, including `household.sql.test.cjs` (real Postgres, runs on CI)
- **Edited:** `plaid.js` (household item access, cursors, delete_account leaves first), `_lib/auth.js` (coverage), `coach.js` (every provider request through `providerFetch`), `App.jsx` (persistence switch, private keys, Settings row, fake screen out).
- **Edited, small:** `billing.js` (subscription reads, the checkout guard and hold, `store_hold`), `stripe-webhook.js` and `revenuecat-webhook.js` (reconcile after a paid event), `persistence.js`, `storeBilling.js` (the hold before the store sheet).

## Tests that must pass
- **SQL (real Postgres):**
  - A non-member reads 0 rows and writes nothing on every new table, cannot call the RPCs, and gets nothing from anon.
  - A removed partner reads 0 and updates 0 straight after removal.
  - Expired, used, revoked and wrong-address invites are refused.
  - A second accept fails, a third adult is refused, and the owner's delete promotes the partner.
  - Each person's private row is theirs alone; consent written into the shared blob never lands.
  - Twelve wrong tries at the same moment stop at 10; the per-address and per-network limits; an invite dies after 5.
  - A remove racing a leave, an owner's account deletion or an owner's leave.
  - Purchase holds.
  - What a departed member's banks left behind, and the app's strip giving exactly the database's answer.
- **JS:**
  - plaid.js refuses a non-member's item and allows the partner's.
  - Only the linker can disconnect.
  - Billing coverage works and checkout returns 409.
  - The merge, coach roles, and the absence of FLRSH.

## Risks
1. **Category corrections and deposit answers keyed by a bank transaction's id** cannot be matched by the database (the bank's transactions are never stored). The other member's app removes the ones for the departed member's transactions it holds; any it never held stay as orphaned entries (a transaction id and a category, nothing shown).
1. **Joint accounts:** if both people link the same joint account, it counts twice (different Plaid items). v1 does not detect this. A note in Connected Banks warns (`household.bank.joint_note`); real de-duplication is a follow-up.
2. **Last-writer-wins inside one section:** if both people edit the same section in the same few seconds, one edit is lost. That needs both apps open at once. Versions plus the per-section merge cover everything else.
3. **A removed partner's phone** keeps its last cached screen until it next talks to the server (open or foreground). Then it is wiped. No new data reaches it.
4. **Founding seats:** if both people already held a seat before joining, the seat count (0032, now on main) still counts two: it counts per account. One line in `founding_seats_taken()` once this is merged; left to the founding-seats work.
5. **The partner's own data is replaced when they join, not merged.** The partner's consent screen says so (`household.consent.partner.body`).
6. **`user_data` has no migration.** The SQL test stands in for it with production's shape; this must be checked against production before running 0030.
7. **Migration order:** 0032 (founding seats) is already on main. 0030 and 0031 do not touch its tables, so they may run before or after it.
8. **The owner's own `user_data` row** stays while they are a member (it is never read then): it is deleted when they leave someone behind, and written over when they are the last one out.
