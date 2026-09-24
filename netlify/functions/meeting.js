// netlify/functions/meeting.js
// -----------------------------------------------------------------------------
// RECORDING WHAT THE MEETING DECIDED. The only writer of public.meeting_records.
//
// The client reads its own meetings directly (RLS select-own). It cannot write them: a
// household's own browser recording "we accepted that" is the one path a facilitator model
// could be talked into using to change what the app believes. So writes come through here,
// after the session is verified, and through recordableAnswer(), which keeps five string
// fields and drops everything else.
//
// NO FIGURE IS EVER STORED. Not because a figure would be wrong, but because the next
// meeting must read its numbers from the engines; a number stored here would be a second
// source for the same fact, and the older one would eventually be shown as current.
// -----------------------------------------------------------------------------
"use strict";

const { getUserFromRequest, getAdminClient, unauthorized } = require("./_lib/auth");

const ALLOWED_ORIGINS = new Set([
  "https://flourishmoney.app",
  "capacitor://localhost",
  "http://localhost:5173",
  "http://localhost:8888",
]);

function corsHeadersFor(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://flourishmoney.app";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
}

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// The server's own copy of the allow-list in src/lib/meetingRecord.js. Duplicated for the same
// reason planRules.js is: a Netlify function is CommonJS and bundled separately. Kept in step by
// tests/meetingRecord.test.cjs section 6, which runs both over the same inputs.
const ANSWERS = new Set(["accepted", "dismissed"]);
const ALLOWED_FIELDS = ["signature", "domain", "kind", "answer", "subject"];
const MAX_FIELD_LENGTH = 200;

function recordableAnswer(raw) {
  const a = raw || {};
  // Length is checked HERE, not only in the copy below: an over-long signature stripped by the
  // copy would leave an answer with no signature at all — a record that can never be matched to
  // the question it answers, which is worse than refusing it.
  const str = (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD_LENGTH;
  if (!str(a.signature)) return null;
  if (!str(a.domain)) return null;
  if (!ANSWERS.has(a.answer)) return null;
  const out = {};
  for (const f of ALLOWED_FIELDS) {
    const v = a[f];
    if (v == null) continue;
    if (typeof v !== "string") continue;
    if (v.length > MAX_FIELD_LENGTH) continue;   // 50 answers x 5 unbounded strings is megabytes
    out[f] = v;
  }
  return out;
}

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

exports.handler = async (event) => {
  const CORS = corsHeadersFor(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });

  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) return unauthorized(CORS, authError || "unauthorized");

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }
  if (body.action !== "record") return json(400, CORS, { error: "unknown_action" });

  const metOn = isDate(body.met_on) ? body.met_on : null;
  if (!metOn) return json(400, CORS, { error: "invalid_met_on" });

  const raw = Array.isArray(body.answers) ? body.answers : [];
  if (raw.length > 50) return json(400, CORS, { error: "too_many_answers" });
  const answers = raw.map(recordableAnswer).filter(Boolean);
  // An empty meeting is a real outcome (nobody decided anything), but a request whose answers
  // were ALL rejected by the allow-list is a client sending something else, and is refused
  // rather than silently stored as an empty meeting.
  if (raw.length > 0 && answers.length === 0) return json(400, CORS, { error: "no_valid_answers" });

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { console.error("[meeting] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  try {
    // user_id comes from the verified token, never from the body.
    const { error } = await admin
      .from("meeting_records")
      .upsert({ user_id, met_on: metOn, answers }, { onConflict: "user_id,met_on" });
    if (error) throw new Error(error.message);
    return json(200, CORS, { recorded: answers.length, met_on: metOn });
  } catch (e) {
    console.error("[meeting] record:", e.message);
    return json(500, CORS, { error: "record_failed" });
  }
};
