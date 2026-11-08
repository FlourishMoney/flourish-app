// netlify/functions/meeting.js
// -----------------------------------------------------------------------------
// RECORDING WHAT THE MEETING DECIDED. The only writer of public.meeting_records.
//
// READING THEM BACK (action "list", 2026-11-08): the meetings are read AS THE SIGNED-IN PERSON, with
// their own token and the publishable key (_lib/auth.js getUserScopedClient), never the secret key, so
// row-level security decides what comes back: their own records (0011) and their partner's since that
// partner joined (0030). One more rule is applied here, on top: a partner's record from before THIS
// person joined is left out too, so nobody is shown a meeting held before they were in the household.
// Any failed read answers 500 and returns no records at all; the app then shows no opening, never
// "this is your first money meeting" on a read that did not happen.
//
// The client cannot write them: a
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

const auth = require("./_lib/auth");

const { corsHeadersFor } = require("./_lib/cors");

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

// Enough meetings for a year of weekly ones from both partners, with room. Newest first.
const MAX_LIST = 120;

// The household's meetings, read as the signed-in person. Returns { records } or { error }.
async function listMeetings(event, user_id) {
  let client;
  try { client = auth.getUserScopedClient(auth.extractToken(event)); }
  catch (e) { console.error("[meeting] user client:", e.message); return { error: "server_misconfigured", status: 500 }; }

  try {
    // No user_id filter: RLS returns this person's own rows and, in a household, their partner's since
    // that partner joined. Filtering here would only hide what the policies allow.
    const { data, error } = await client
      .from("meeting_records")
      .select("user_id, met_on, answers")
      .order("met_on", { ascending: false })
      .limit(MAX_LIST);
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];

    // When this person is in a household, the day they joined it. A partner's record from before that day
    // is not theirs to see. Read as them too (household_members_select_member).
    let joinedOn = null;
    if (rows.some(r => r && r.user_id !== user_id)) {
      const mine = await client.from("household_members").select("joined_at").eq("user_id", user_id).maybeSingle();
      if (mine.error) throw new Error(mine.error.message);
      joinedOn = mine.data && typeof mine.data.joined_at === "string" ? mine.data.joined_at.slice(0, 10) : null;
      // A partner's row with no membership of our own to date it against: none of them are shown.
      if (!isDate(joinedOn)) joinedOn = "9999-12-31";
    }

    const records = rows
      .filter(r => r && isDate(r.met_on))
      .filter(r => r.user_id === user_id || r.met_on >= joinedOn)
      .map(r => ({
        metOn: r.met_on,
        mine: r.user_id === user_id,
        answers: (Array.isArray(r.answers) ? r.answers : []).map(recordableAnswer).filter(Boolean),
      }));
    return { records };
  } catch (e) {
    console.error("[meeting] list:", e.message);
    return { error: "list_failed", status: 500 };
  }
}

exports.handler = async (event) => {
  const CORS = corsHeadersFor(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, CORS, { error: "Method not allowed" });

  const { user_id, error: authError } = await auth.getUserFromRequest(event);
  if (!user_id) return auth.unauthorized(CORS, authError || "unauthorized");

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, CORS, { error: "invalid_json" }); }
  if (body.action === "list") {
    const out = await listMeetings(event, user_id);
    if (out.error) return json(out.status || 500, CORS, { error: out.error });
    return json(200, { ...CORS, "Cache-Control": "private, no-store" }, { records: out.records });
  }
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
  try { admin = auth.getAdminClient(); }
  catch (e) { console.error("[meeting] admin client:", e.message); return json(500, CORS, { error: "server_misconfigured" }); }

  try {
    // user_id comes from the verified token, never from the body.
    const { error } = await admin
      .from("meeting_records")
      .upsert({ user_id, met_on: metOn, answers }, { onConflict: "user_id,met_on" });
    if (error) throw new Error(error.message);
    // The stored answers come back, so the app adds exactly what was kept, not what it sent.
    return json(200, CORS, { recorded: answers.length, met_on: metOn, answers });
  } catch (e) {
    console.error("[meeting] record:", e.message);
    return json(500, CORS, { error: "record_failed" });
  }
};
