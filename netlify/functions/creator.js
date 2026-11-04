// netlify/functions/creator.js  (/api/creator)
// -----------------------------------------------------------------------------
// THE CREATOR CODE, FROM THE APP (docs/product/CREATOR-PROGRAM-SPEC.md).
//
// OFF UNTIL IT IS SWITCHED ON: every request answers 404 unless CREATORS_ENABLED is exactly "true", and the app shows
// no field and no card while it does.
//   GET              { enabled: true }: the sign-up form asks whether to show the field. Nobody signed in, nothing read.
//   POST status      { may_add }: may this account add a code in Settings now?
//   POST add {code}  adds it. Within 14 days of sign-up, before the first payment, the account's own or its household's
//                    first code, never a partner's, never a creator's own: the database's rules (creator_attribute).
// The answers never say whose address a code belongs to: a creator's own code answers as a wrong code does. A code gives
// nobody a discount, so there is nothing to win by guessing one.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");
const C = require("./_lib/creators");

const MAX_BODY_BYTES = 2048;
const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

exports.handler = async (event, _ctx, deps = {}) => {
  const env = deps.env || process.env;
  const CORS = { ...corsHeadersFor(event), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" };
  if (!C.creatorsEnabled(env)) return json(404, CORS, { error: "not_found" });
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod === "GET") return json(200, CORS, { enabled: true });
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });
  if ((event.body || "").length > MAX_BODY_BYTES) return json(413, CORS, { error: "too_large" });

  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }
  const action = body && body.action;
  if (action !== "status" && action !== "add") return json(400, CORS, { error: "unknown_action" });

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[creator] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  try {
    if (action === "status") return json(200, CORS, { enabled: true, ...(await C.creatorStatus(admin, user_id)) });
    const code = C.cleanCreatorCode(body.code);
    if (!code) return json(400, CORS, { error: "creator_code_invalid" });
    const result = await C.attributeCreatorCode(admin, user_id, code, C.creatorSourceOf(event));
    if (result === "attributed") return json(200, CORS, { ok: true });
    if (result === "invalid") return json(400, CORS, { error: "creator_code_invalid" });
    return json(409, CORS, { error: "creator_code_closed" });   // already, not_owner, too_late, paid: one line for them all
  } catch (e) {
    console.error("[creator]", action, e.message);
    return json(503, CORS, { error: "creator_code_unavailable" });
  }
};
