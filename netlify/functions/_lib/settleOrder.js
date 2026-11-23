// netlify/functions/_lib/settleOrder.js
// -----------------------------------------------------------------------------
// ONE FIXED ORDER FOR ROWS WRITTEN AT THE SAME MOMENT (round 2 of the 2026-11-22 review, N3 and N4).
//
// A limit that is checked again after the write (a household's bank connections, a person's net worth entries) needs
// every request to agree on WHICH row is the extra one. They agree by reading the rows in this order: when the row was
// made, then its id. It is only ever a tie-break between rows written together. It is not part of any limit: no
// household's limit depends on a date (_lib/bankLimits.js, Amanda 2026-11-10), which is why it lives here and not there.
//
// A row with no time (none should exist) sorts as the oldest: never the one to go.
// -----------------------------------------------------------------------------
"use strict";

const byMade = (timeColumn, ...idColumns) => (a, b) => {
  const x = Date.parse(a && a[timeColumn]), y = Date.parse(b && b[timeColumn]);
  const p = Number.isFinite(x) ? x : 0, q = Number.isFinite(y) ? y : 0;
  if (p !== q) return p < q ? -1 : 1;
  // The same millisecond: the text of the time as the database gave it (it carries microseconds), then the ids.
  for (const c of [timeColumn, ...idColumns]) {
    const i = String((a && a[c]) || ""), j = String((b && b[c]) || "");
    if (i !== j) return i < j ? -1 : 1;
  }
  return 0;
};

// plaid_items: made when the database wrote the row (its own clock, the same for every request).
const banksInOrder = byMade("created_at", "id", "item_id");
// net_worth_entries: entered_at, then id.
const entriesInOrder = byMade("entered_at", "id");

// Every bank connection of these people that counts toward a limit, oldest first. notCounted: statuses left out.
async function bankRowsInOrder(admin, userIds, notCounted = []) {
  const out = [];
  for (const u of userIds) {
    const { data, error } = await admin.from("plaid_items").select("id, user_id, item_id, status, created_at").eq("user_id", u);
    if (error) throw new Error(`plaid_items read: ${error.code || "error"}`);
    out.push(...(data || []).filter((r) => r && !notCounted.includes(r.status)));
  }
  return out.sort(banksInOrder);
}

module.exports = { byMade, banksInOrder, entriesInOrder, bankRowsInOrder };
