// src/lib/legacyTokenMigration.js
// -----------------------------------------------------------------------------
// OLD ON-DEVICE BANK TOKENS: WHAT LEAVES THE DEVICE AFTER ONE MIGRATION ANSWER (review 2026-11-22, P7-01).
//
// Before bank tokens lived on the server, a device kept them in localStorage. App.jsx
// migrateLocalStorageTokensToSupabase sends them to plaid.js migrate_items once and then clears them. It used to
// mark the migration done and clear every token whatever the answer said, so a token the server could not save
// that time (the bank's lookup timed out, the database write failed) was deleted from the only place it existed.
//
// The server now says, for each token by its position in the list sent, whether it was saved and, if not, whether
// trying again can help (`retry`). The rule:
//   - saved                       → leaves the device (the server has it)
//   - failed, retry false         → leaves the device (it can never be saved: revoked, refused, over the plan)
//   - failed, retry true          → STAYS, and the migration is not marked done
//   - not mentioned in the answer → STAYS (never assume it was saved)
// A bank credential must not sit in localStorage for ever, so after LEGACY_TOKEN_MAX_TRIES answers the rest are
// cleared as before.
//
// Pure: no storage, no network. App.jsx reads and writes the keys.
// -----------------------------------------------------------------------------

export const LEGACY_TOKEN_TRIES_KEY = "flourish_d1e_tries";
export const LEGACY_TOKEN_MAX_TRIES = 5;

//   sent       [{ token, institution_name }] exactly as sent, in order
//   resp       migrate_items' answer: { successes: [{ item_id, index }], failures: [{ error, index, retry }] }
//   triesSoFar how many answers this device has already had with tokens left over
// Returns { done, keep, tries }: `keep` is what to write back to flourish_plaid_tokens ([{ token, institution }]),
// `done` whether to mark the migration finished and clear everything.
export function afterTokenMigration(sent, resp, triesSoFar = 0) {
  const list = Array.isArray(sent) ? sent : [];
  const successes = Array.isArray(resp && resp.successes) ? resp.successes : [];
  const failures = Array.isArray(resp && resp.failures) ? resp.failures : [];
  const indexed = [...successes, ...failures].some((e) => e && Number.isInteger(e.index));
  // An answer with no positions at all (a server from before this change): nothing can be matched to a token, so
  // it behaves as it always did.
  if (!indexed) return { done: true, keep: [], tries: 0 };
  const settled = new Set();   // positions whose token leaves the device
  for (const s of successes) if (s && Number.isInteger(s.index)) settled.add(s.index);
  for (const f of failures) if (f && Number.isInteger(f.index) && f.retry !== true) settled.add(f.index);
  const keep = list
    .map((t, i) => (t && t.token && !settled.has(i) ? { token: t.token, institution: t.institution_name || "Your Bank" } : null))
    .filter(Boolean);
  const tries = (Number.isFinite(triesSoFar) && triesSoFar > 0 ? Math.floor(triesSoFar) : 0) + 1;
  if (keep.length === 0 || tries >= LEGACY_TOKEN_MAX_TRIES) return { done: true, keep: [], tries };
  return { done: false, keep, tries };
}
