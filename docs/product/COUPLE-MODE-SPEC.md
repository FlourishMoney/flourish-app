# Couple mode v1: spec and plan (2026-10-29)

Branch `couple-mode` from main 7f02c1b. Migrations `0030_couple_household.sql` and `0031_couple_household_private.sql` are written, **not run**. The words were approved by ChatGPT and Grok on 2026-10-29 (`COUPLE-MODE-WORDS.md`).
Ships dark: the server answers 404 until `HOUSEHOLD_ENABLED=true` (Netlify), and the app shows Settings > Household only when the server answers.
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
- **Join (partner).** The partner signs in or creates a login, opens the link or types the code, and sees the consent screen. Then the server adds them, in one locked transaction: it checks expiry, single use, the address and the 2-adult limit. A wrong code counts toward a limit of 10 failed tries an hour per account. The partner's phone then drops its own data and loads the household's.
- **Shared.** Today, Safe to spend, bills, paydays, debts, goals, budgets, the money meeting and corrections are all in the household blob (`household_data`). Both people read and write it.
  - Saves check a version number. If both edited at once, the app merges by section (bills, debts, and so on): a section only one person changed keeps that change; if both changed the same section, the later save wins.
  - The app re-reads the household when it comes back to the front.
- **Personal, per person:** AI consent and the coach switch, the plan cache, and Plaid consent time. These sit under `personal[user_id]` in the blob. One person's AI consent never applies to the other.
- **Banks.** Either person links their own bank, and both see every account.
  - The server lets a member use an item linked by anyone in the same household.
  - Only the person who linked a bank can disconnect or reconnect it, because the Plaid consent is theirs.
  - Each member has their own sync cursor (`plaid_item_cursors`), so one phone never consumes the other's new transactions.
- **Leave, remove, delete.**
  - Either person can leave, and the owner can remove the partner. The person who goes loses database access in the same transaction.
  - Their bank accounts are taken out of the household blob, and their banks stay linked to their own login.
  - Their `user_data` row is deleted and their phone is wiped, so they start fresh.
  - If the owner deletes their account, the partner is promoted to owner by a trigger. When the last member goes, the household and its data go too.
- **One subscription.**
  - A paid subscription (web, App Store or Play) or a beta-founder flag on either member covers both.
  - Trials stay per person: otherwise a new email every 14 days would be a free plan.
  - A covered partner is never offered or sold a plan: checkout returns 409 and the store screen gets paid:true. If the partner already pays separately, they are told how to cancel and where.
  - Founding: the household is only ever sold one plan, so it takes one seat. The founding-seats work (0029, other session) still counts seats per account. If both already held a seat before joining, see Risks.
- **Coach:** still roles only. If the partner asks, the coach context swaps "you" and "your partner" (employment, incomes, age). Names and emails never go in. A test checks this.
- **Removed:** the fake Household tab (the FLRSH code, the "join" that always worked, `HOUSEHOLD_ENABLED=false`), the `household` state and the two "Household connected" chips.

## Tables touched (migration 0030, not run)
| table | change | RLS / grants |
|---|---|---|
| `households` new | id, created_by, owner_consented_at | select: members only; no client writes |
| `household_members` new | household_id, user_id (unique: one household each), role owner/partner, consented_at | select: people in the same household; no client writes; trigger enforces at most 2 members and exactly 1 owner, promotes on owner delete |
| `household_invites` new | email_key, token_hash, code_hash, expires_at, used_at/used_by, revoked_at | **no client access**; service role only |
| `household_join_attempts` new | user_id, at | service role only |
| `household_data` new | household_id pk, data jsonb, version, updated_at | select + update: members only; no client insert/delete; anon nothing |
| `plaid_item_cursors` new | plaid_item_id, user_id, next_cursor | service role only |
| `meeting_records` | policy added: members can read each other's records | select own or same household |
| `plaid_items`, `subscriptions`, `profiles`, `user_data` | **no schema change** | plaid_items stays service-only; household access is checked in plaid.js and tested |

RPCs (security definer, `search_path` fixed, execute for service_role only):
- `household_create_invite`
- `household_accept_invite`
- `household_leave`
- `household_remove_partner`

Two read helpers are used inside the policies (`is_household_member` and `shares_household_with`). They are the only household functions granted to `authenticated`.

## Files
- **New:**
  - `netlify/functions/household.js` (`/api/household`), `_lib/household.js`
  - `src/lib/household.js` (pure: merge, the personal/shared split, coach roles, hydrate decision)
  - `src/lib/householdApi.js`
  - the Household settings screen
  - tests, including `household.sql.test.cjs` (real Postgres, runs on CI)
- **Edited:** `plaid.js` (household item access, cursors, delete_account leaves first), `_lib/auth.js` (coverage), `App.jsx` (persistence switch, Settings row, fake screen out).
- **Edited, small:** `billing.js` (3 subscription reads, plus the checkout guard), `persistence.js`. These are kept away from the hunks the founding session changed, and that session's files are otherwise untouched.

## Tests that must pass
- **SQL (real Postgres):**
  - A non-member reads 0 rows and writes nothing on every new table, cannot call the RPCs, and gets nothing from anon.
  - A removed partner reads 0 and updates 0 straight after removal.
  - Expired, used, revoked and wrong-address invites are refused.
  - A second accept fails, a third adult is refused, and the owner's delete promotes the partner.
- **JS:**
  - plaid.js refuses a non-member's item and allows the partner's.
  - Only the linker can disconnect.
  - Billing coverage works and checkout returns 409.
  - The merge, coach roles, and the absence of FLRSH.

## Risks
1. **Joint accounts:** if both people link the same joint account, it counts twice (different Plaid items). v1 does not detect this. A note in Connected Banks warns (`household.bank.joint_note`); real de-duplication is a follow-up.
2. **Last-writer-wins inside one section:** if both people edit the same section in the same few seconds, one edit is lost. That needs both apps open at once. Versions plus the per-section merge cover everything else.
3. **A removed partner's phone** keeps its last cached screen until it next talks to the server (open or foreground). Then it is wiped. No new data reaches it.
4. **Founding seats:** if both people already held a seat before joining, the seat count (other session's 0029) still shows two. Fix after both merge: count seats per household (one line, given to that session).
5. **The partner's own data is replaced when they join, not merged.** The partner's consent screen says so (`household.consent.partner.body`).
6. **`user_data` has no migration.** The SQL test stands in for it with production's shape; this must be checked against production before running 0030.
7. **The same migration number 0029 is already used by two open branches.** Mine is 0030, so it must run after whatever 0029 lands.
