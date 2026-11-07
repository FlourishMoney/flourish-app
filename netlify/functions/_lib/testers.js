// netlify/functions/_lib/testers.js
// -----------------------------------------------------------------------------
// TESTER CODES AND THE DAY 30 QUESTIONS (2026-11-04, migration 0038).
//
// A code marks an account as a tester and does nothing else: no plan, no discount, no reward, nothing tied to a store rating.
// THE QUESTIONS are testerQuestions.json: [{ "id": "q1", "text": "..." }, ...], read by the server only, so the wording can
// change without a store build. Until the five are in, the list is empty and no tester is ever asked.
// -----------------------------------------------------------------------------
"use strict";
const QUESTIONS = require("./testerQuestions.json");

const TESTER_DAY = 30;
const CODE_RX = /^[A-Z0-9-]{3,30}$/;
const ANSWER_MAX = 1000;

function cleanTesterCode(value) {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CODE_RX.test(v) ? v : null;
}

// True when the code is live. Throws when the check itself fails (the caller says so and creates nothing).
async function testerCodeIsLive(admin, code) {
  const { data, error } = await admin.from("tester_codes").select("code").eq("code", code).eq("active", true).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function anyLiveCode(admin) {
  const { data, error } = await admin.from("tester_codes").select("code").eq("active", true).limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

function isDue(row, questions, now = new Date()) {
  if (!row || row.answered_at || !questions.length) return false;
  const marked = new Date(row.marked_at).getTime();
  return Number.isFinite(marked) && now.getTime() - marked >= TESTER_DAY * 24 * 60 * 60 * 1000;
}

// The rows to store, with the wording each answer was given to. An unknown question or an empty answer is left out.
function answerRows(userId, answers, questions, now = new Date()) {
  const a = answers && typeof answers === "object" ? answers : {};
  return questions.flatMap((q) => {
    const text = typeof a[q.id] === "string" ? a[q.id].trim().slice(0, ANSWER_MAX) : "";
    return text ? [{ user_id: userId, question_id: q.id, question_wording: q.text, answer: text, answered_at: now.toISOString() }] : [];
  });
}

module.exports = { QUESTIONS, TESTER_DAY, ANSWER_MAX, cleanTesterCode, testerCodeIsLive, anyLiveCode, isDue, answerRows };
