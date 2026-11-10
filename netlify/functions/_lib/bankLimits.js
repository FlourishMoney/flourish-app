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
const { plusEnabled, getPlusEntitlement } = require("./plusAddon");

const BASIC_PER_PERSON = 2;
const PLUS_HOUSEHOLD_FAIR_USE = 10;
const NOT_COUNTED = Object.freeze(["revoked"]);

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
  if (!plusEnabled(env)) return null;
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

// The 402 body for a refused new link: numbers from the server only, never a message the app shows as is.
const limitBody = (lim) => ({ error: "bank_limit", scope: lim.scope, used: lim.used, limit: lim.limit });

module.exports = { BASIC_PER_PERSON, PLUS_HOUSEHOLD_FAIR_USE, NOT_COUNTED, mayAddBank, bankLimitFor, limitBody };
