// netlify/functions/creator-commissions-sweep.js
// -----------------------------------------------------------------------------
// SCHEDULED, DAILY (netlify.toml): a creator's commission is pending until its payment is more than 30 days old, then
// payable (creator_commissions_mature). Reads and writes nothing unless CREATORS_ENABLED is exactly "true". The monthly
// report doesn't wait for this: it counts a payment as ready by its date (docs/ops/CREATOR-PAYOUTS.md).
// -----------------------------------------------------------------------------
"use strict";

const { getAdminClient } = require("./_lib/auth");
const { creatorsEnabled } = require("./_lib/creators");

exports.handler = async (_event, _ctx, deps = {}) => {
  if (!creatorsEnabled(deps.env || process.env)) return { statusCode: 200, body: JSON.stringify({ skipped: "creators_off" }) };
  try {
    const admin = deps.admin || getAdminClient();
    const { data, error } = await admin.rpc("creator_commissions_mature", {});
    if (error) throw new Error(error.code || "error");
    console.log(`[creator-sweep] payable now: ${data}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, matured: data }) };
  } catch (e) {
    console.error("[creator-sweep] failed:", e && e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
