/**
 * Flourish — tester codes and the day 30 questions
 * netlify/functions/tester.js   (/api/tester, migration 0038)
 *
 *   GET                         { enabled }: is any code live? The sign-up field shows only then.
 *   POST {action:"status"}      signed in. { due, questions }: the questions only on or after day 30, and only until answered.
 *   POST {action:"answer", answers:{id:text}}   signed in, and only while due. Saved to the account with the wording shown.
 *
 * The server decides who is a tester and when: the app's flag only saves a call for everyone else.
 */
"use strict";
const { getUserFromRequest, getAdminClient } = require("./_lib/auth");
const { corsHeadersFor } = require("./_lib/cors");
const { QUESTIONS, anyLiveCode, isDue, answerRows } = require("./_lib/testers");

async function route(event, deps) {
  const CORS = { ...corsHeadersFor(event), "Cache-Control": "no-store" };
  const reply = (code, o) => ({ statusCode: code, headers: CORS, body: JSON.stringify(o) });
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod === "GET") {
    let enabled = false;
    try { enabled = await anyLiveCode(deps.admin()); } catch { enabled = false; }
    return { statusCode: 200, headers: { ...CORS, "Cache-Control": "public, max-age=60" }, body: JSON.stringify({ enabled }) };
  }
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
  let body = null;
  try { body = JSON.parse(event.body || "{}"); } catch { /* not JSON */ }
  if (!body || (body.action !== "status" && body.action !== "answer")) return reply(400, { error: "unknown_action" });
  const { user_id } = await deps.user(event);
  if (!user_id) return reply(401, { error: "unauthorized" });
  try {
    const admin = deps.admin();
    const { data: row, error } = await admin.from("tester_accounts").select("marked_at,answered_at").eq("user_id", user_id).maybeSingle();
    if (error) throw error;
    const due = isDue(row, deps.questions, deps.now());
    if (body.action === "status") return reply(200, due ? { due, questions: deps.questions } : { due });
    if (!due) return reply(409, { error: "not_due" });
    const rows = answerRows(user_id, body.answers, deps.questions, deps.now());
    if (!rows.length) return reply(400, { error: "no_answers" });
    const { error: saveErr } = await admin.from("tester_answers").upsert(rows, { onConflict: "user_id,question_id" });
    if (saveErr) throw saveErr;
    const { error: doneErr } = await admin.from("tester_accounts").update({ answered_at: deps.now().toISOString() }).eq("user_id", user_id);
    if (doneErr) throw doneErr;
    return reply(200, { ok: true });
  } catch {
    console.error("[tester] failed");
    return reply(503, { error: "unavailable" });
  }
}

const LIVE = { admin: () => getAdminClient(), user: (event) => getUserFromRequest(event), questions: QUESTIONS, now: () => new Date() };
exports.handler = (event) => route(event, LIVE);
exports._test = { route };
