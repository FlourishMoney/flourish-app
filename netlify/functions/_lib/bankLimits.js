// netlify/functions/_lib/bankLimits.js
// -----------------------------------------------------------------------------
// HOW MANY BANK CONNECTIONS A HOUSEHOLD MAY CONNECT (2026-11-10). Behind PLUS_ENABLED, with the Plus add-on.
//
// Amanda's decisions, fixed:
//   the basic plan   2 bank connections PER PERSON, counted per person, never pooled: a two-person household has 4, and
//                    a partner who has used both of theirs cannot use the other's
//   Plus             unlimited, with a fair-use limit of 10 per household, stated in the terms
// A bank connection is one Plaid item: one sign-in at one bank, however many accounts it holds. Every item counts except
// one the bank has revoked; one that needs a fresh sign-in is still held.
//
// WHAT A LIMIT DOES, AND ONLY THIS: it stops a NEW bank connection. It never disconnects a bank, never stops one updating,
// and never refuses a reconnect (Plaid's update mode reuses the same item). A household over the limit (its Plus
// ended, or it connected them before the limit) keeps every one; a person may add another once they are under it.
//
// FAILS CLOSED, THE SAFE WAY ROUND: a read that fails refuses the NEW link with "unavailable" (503) and a plain line,
// never a count worked out from a guess, and never touches what is connected.
// Off (PLUS_ENABLED unset): this answers null and nothing changes from today.
// -----------------------------------------------------------------------------
"use strict";

const { peerIdsOf } = require("./household");
const { plusEnabledFor, getPlusEntitlement } = require("./plusAddon");
const { bankRowsInOrder } = require("./settleOrder");

const BASIC_PER_PERSON = 2;
const PLUS_HOUSEHOLD_FAIR_USE = 10;
// "refused" (round 3 of the review): a new bank that turned out to be the one past the limit. Its row is marked first,
// so it stops counting at once, and is then removed at Plaid and deleted; a row still marked so is one whose removal
// has not finished (plaid.js finishes it the next time the banks are listed). It is never connected, never listed.
const REFUSED = "refused";
const NOT_COUNTED = Object.freeze(["revoked", REFUSED]);

// The rule alone. { allowed, scope, used, limit }: scope "person" on the basic plan (used = this person's own), or
// "household" with Plus (used = everyone's).
function mayAddBank({ plus, personUsed, householdUsed }) {
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const p = n(personUsed), h = n(householdUsed);
  if (plus === true) {
    if (h === null) return { allowed: false, scope: "household", used: null, limit: PLUS_HOUSEHOLD_FAIR_USE, unavailable: true };
    return { allowed: h < PLUS_HOUSEHOLD_FAIR_USE, scope: "household", used: h, limit: PLUS_HOUSEHOLD_FAIR_USE };
  }
  if (p === null) return { allowed: false, scope: "person", used: null, limit: BASIC_PER_PERSON, unavailable: true };
  return { allowed: p < BASIC_PER_PERSON, scope: "person", used: p, limit: BASIC_PER_PERSON };
}

async function countConnections(admin, userId) {
  const { data, error } = await admin.from("plaid_items").select("item_id, status").eq("user_id", userId);
  if (error) throw new Error(`plaid_items read: ${error.code || "error"}`);
  return (data || []).filter((r) => r && !NOT_COUNTED.includes(r.status)).length;
}

/**
 * This person's answer now: null while PLUS_ENABLED is off (today's rules stand), else
 * { allowed, scope, used, limit, plus, person_used, household_used, connected, over, unavailable }.
 *   over        the household holds more than its plan includes (basic: more than 2 for some person; Plus: more than
 *               10): every one stays connected
 */
async function bankLimitFor(admin, userId, { env = process.env, now = Date.now() } = {}) {
  if (!plusEnabledFor(userId, env)) return null;   // off for this account (the flag, and the tester list): today's rules
  const unavailable = { allowed: false, unavailable: true };
  try {
    const ent = await getPlusEntitlement(admin, userId, { env, now });
    if (ent.status_unavailable) return unavailable;
    const peers = await peerIdsOf(admin, userId);
    const personUsed = await countConnections(admin, userId);
    const peerUsed = [];
    for (const p of peers) peerUsed.push(await countConnections(admin, p));
    const householdUsed = personUsed + peerUsed.reduce((a, b) => a + b, 0);
    const rule = mayAddBank({ plus: ent.plus, personUsed, householdUsed });
    const over = ent.plus ? householdUsed > PLUS_HOUSEHOLD_FAIR_USE : [personUsed, ...peerUsed].some((u) => u > BASIC_PER_PERSON);
    return { ...rule, plus: !!ent.plus, person_used: personUsed, household_used: householdUsed, connected: householdUsed, over, unavailable: false };
  } catch (e) {
    console.error("[bank-limits] read failed (unavailable):", e.message);
    return unavailable;
  }
}

// ── AFTER THE WRITE: WHICH NEW BANK IS THE EXTRA ONE (round 2 of the 2026-11-22 review, N3) ─────────────────────
// Round 1 counted again after the write and took the request's own bank back out if the count was past the limit.
// Two people finishing at the same moment, one below the limit, then BOTH saw one too many and BOTH took their bank
// out: one fewer than the limit was left and both were refused. Now every request reads the banks in ONE fixed order
// (_lib/settleOrder.js: when each row was made, by the database's clock, then its id; a tie-break only, never part of
// anyone's limit), so they all agree on which is the extra:
//   this bank is BEYOND the limit in that order   it is the extra: it goes now
//   this bank is INSIDE the limit                 the extra is another request's. Wait a moment for it to step out of
//                                                 the count and look again (RECHECK_WAITS_MS); then this bank stays.
// ROUND 3 (NEW-3, Amanda 2026-11-22): a bank inside the limit is NEVER removed. Round 2 took it out when the count
// was still past the limit after the last wait, which could not tell "the extra is slow to go" from "the extra is
// staying", and could leave one fewer than the limit. Now the extra is marked refused before its slow removal at
// Plaid, so it stops counting at once; and if the count is still past the limit after the waits, the answer is
// `unresolved`: nothing connected is taken away, the household sits one over, and no further bank is accepted until
// it is back within the limit (the check before every new bank). In the ordinary case exactly the limit stays.
const RECHECK_WAITS_MS = [400, 800, 1600];
const SETTLE_MS = 150;

/**
 * AFTER a new bank has been written: is its scope now past the limit, and is THIS bank (opts.itemId) the one to go?
 * (review 2026-11-22, H3: the limit is read before Plaid's exchange, so two new banks finishing at the same moment
 * could each see room for one more.)
 * { over, unavailable, lim }. over is true only on a count that was read: a failed read is never "over", so nothing is
 * undone on a guess. lim is the fresh answer (null while Plus is off for this account). A caller that names no bank
 * gets the plain answer: past the limit or not.
 */
async function overAfterAdding(admin, userId, opts = {}) {
  const lim = await bankLimitFor(admin, userId, opts);
  if (!lim) return { over: false, unavailable: false, lim: null };
  if (lim.unavailable) return { over: false, unavailable: true, lim };
  const used = lim.scope === "household" ? lim.household_used : lim.person_used;
  if (!Number.isInteger(used)) return { over: false, unavailable: false, lim };
  if (!opts.itemId) return { over: used > lim.limit, unavailable: false, lim };
  if (used < lim.limit) return { over: false, unavailable: false, lim };          // room to spare: nothing to settle
  const waits = Array.isArray(opts.waits) ? opts.waits : RECHECK_WAITS_MS;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  try {
    const who = lim.scope === "household" ? [userId, ...(await peerIdsOf(admin, userId))] : [userId];
    // EXACTLY AT THE LIMIT (round 3): one more look after a short pause, so a bank that was landing at this very
    // moment is seen now, and the real extra goes by the fixed order. Without it, two requests that each missed the
    // other once would both stay.
    if (used === lim.limit) await sleep(Number.isFinite(opts.settleMs) ? opts.settleMs : SETTLE_MS);
    for (let look = 0; ; look++) {
      const rows = await bankRowsInOrder(admin, who, NOT_COUNTED);
      if (rows.length <= lim.limit) return { over: false, unavailable: false, lim };
      const place = rows.findIndex((r) => r.user_id === userId && r.item_id === opts.itemId);
      if (place < 0) return { over: false, unavailable: false, lim };          // not in the table: nothing of this request's to undo
      if (place >= lim.limit) return { over: true, unavailable: false, lim };  // this bank is the extra
      // INSIDE THE LIMIT: never removed (round 3, NEW-3). The extra steps out of the count the moment its own request
      // sees it (it is marked refused before it is removed at Plaid), so waiting here is for that, not for Plaid. If
      // the count is still past the limit after the last wait, the other request never saw this bank: the household
      // sits one over, nothing connected is taken away, and no further bank is accepted until it is back within it.
      if (look >= waits.length) {
        console.error("[bank-limits] unresolved: the count is past the limit and this bank is inside it; nothing was removed");
        return { over: false, unavailable: false, unresolved: true, lim };
      }
      await sleep(waits[look]);
    }
  } catch (e) {
    console.error("[bank-limits] unresolved: the second look failed (nothing undone):", e.message);
    return { over: false, unavailable: true, unresolved: true, lim };
  }
}

// The 402 body for a refused new link: numbers from the server only, never a message the app shows as is.
const limitBody = (lim) => ({ error: "bank_limit", scope: lim.scope, used: lim.used, limit: lim.limit });

module.exports = { BASIC_PER_PERSON, PLUS_HOUSEHOLD_FAIR_USE, NOT_COUNTED, REFUSED, RECHECK_WAITS_MS, SETTLE_MS, mayAddBank, bankLimitFor, overAfterAdding, limitBody };
