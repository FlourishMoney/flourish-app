// netlify/functions/_lib/coachRedact.js
// -----------------------------------------------------------------------------
// ROLES, NEVER NAMES, IN WHAT THE SERVER SENDS THE AI PROVIDER (audit H4, 2026-10-29).
//
// The app already turns the household's names into roles before a request leaves the phone
// (src/lib/coachPrivacy.js). The server no longer relies on that: just before every request to Anthropic
// (coach.js providerFetch), every text in it, the system prompt and every message, has the household's names
// replaced by roles, email addresses masked and account numbers cut to their last 4 digits. The names are the
// household's own, read here from its saved profile (the household's shared blob for a member, the person's own
// row otherwise), from the asker's side: the asker is "you", the other adult "partner", the children
// "child 1", "child 2"…
//
// The name rules below are the app's, copied (as meeting.js copies its allow-list); tests/householdServer.test.cjs
// holds the two copies to the same answers.
// -----------------------------------------------------------------------------
"use strict";

const { membershipOf } = require("./household");

// Names that are also everyday words: these are only replaced when written as a name (Capitalised or CAPITALS),
// so "you may" keeps its "may".
const COMMON_WORDS = new Set(["may", "will", "june", "april", "august", "grace", "hope", "faith", "joy", "rose", "mark", "bill", "sue",
  "pat", "art", "dawn", "ray", "rich", "sky", "summer", "autumn", "win", "chase", "page", "hunter", "april", "eve", "lane", "max",
  "an", "ed", "al", "jo", "bo", "di", "le", "la", "de", "you", "partner", "child",
  // Review of 2026-10-26: surnames and names that are everyday words, and the months.
  "day", "price", "cash", "bell", "hill", "wood", "stone", "king", "young", "green", "black", "white", "brown", "gray",
  "grey", "long", "short", "little", "love", "rich", "bank", "banks", "money", "bond", "bonds", "gold", "silver", "fee",
  "rent", "bills", "payne", "best", "may", "june", "april", "august", "march", "sunny", "summer", "winter", "dawn",
  "january", "february", "july", "september", "october", "november", "december", "major", "mason", "cook", "baker",
  "carter", "hunter", "fisher", "miller", "taylor", "page", "lane", "field", "fields", "ward", "north", "west", "south"]);

const _letters = "\\p{L}\\p{N}";
const _esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The household's names as [{ text, role }], longest first, so a full name is replaced before its parts.
function householdNames(profile) {
  const p = profile || {};
  const out = [];
  const add = (name, role) => {
    const full = String(name || "").trim().replace(/\s+/g, " ");
    if (full.length < 2) return;
    out.push({ text: full, role, part: false });
    for (const tok of full.split(/[\s\-']+/)) if (tok.length >= 2 && tok !== full) out.push({ text: tok, role, part: true });
  };
  add(p.name, "you");
  add(p.partnerName, "partner");
  (Array.isArray(p.kids) ? p.kids : []).forEach((k, i) => add(k && k.name, `child ${i + 1}`));
  const seen = new Set();
  return out
    .filter((n) => { const k = n.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.text.length - a.text.length);
}

const MONTHS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);

// Replace each of the household's names in `text` with its role, in any case. A name (or part of one) that is
// also an everyday word ("Day" in "Sarah Day") only as a name, Capitalised or CAPITALS, so "a 30 day window" keeps
// its "day" (review of 2026-10-26); and a month's name followed by a day or a year ("May 1", "May 2027") is a
// date, never a person.
function redactNames(text, names) {
  let out = String(text == null ? "" : text);
  for (const n of names || []) {
    const lower = n.text.toLowerCase();
    const notDate = MONTHS.has(lower) ? "(?!\\s*\\d)" : "";
    const bound = (body, flags) => new RegExp(`(?<![${_letters}])(?:${body})(?![${_letters}])${notDate}`, flags);
    if (!/\s/.test(n.text) && COMMON_WORDS.has(lower)) {
      const cap = n.text.charAt(0).toUpperCase() + n.text.slice(1).toLowerCase();
      out = out.replace(bound(`${_esc(cap)}|${_esc(n.text.toUpperCase())}`, "gu"), n.role);
    } else {
      out = out.replace(bound(_esc(n.text), "giu"), n.role);
    }
  }
  return out;
}

// Account and card numbers: 7 or more digits in one run, or in groups of 3 or more joined by a space or a dash.
// Not an amount (a decimal part after it, or a $ or digit before it) and not a date (groups of 2 never join).
const ACCOUNT_RX = /(?<![\d$.,])(?:\d{3,}(?:[ \-]\d{3,})+|\d{7,})(?![\d]|[.,]\d)/g;
function redactAccountNumbers(text) {
  return String(text == null ? "" : text).replace(ACCOUNT_RX, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 7 ? `••••${digits.slice(-4)}` : m;
  });
}

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const redactText = (text, names) => redactNames(redactAccountNumbers(String(text).replace(EMAIL_RX, "[email]")), names);

// WHAT THE APP MAY SEND (audit round 2 b). Only text: payload.context and payload.prompt are strings when present,
// and payload.messages is a list of { role: "user" | "assistant", content }, where content is a string or a list
// of { type: "text", text: string } blocks and nothing else. Anything else (an image, a document, a tool block, an
// unknown key that could carry a name past the redaction) is refused before any request is made (coach.js, 400).
// Answers null when it is acceptable, or the reason.
const isTextBlock = (b) => !!b && typeof b === "object" && !Array.isArray(b) && b.type === "text" && typeof b.text === "string"
  && Object.keys(b).every((k) => k === "type" || k === "text");
function invalidCoachPayload(payload) {
  if (payload == null) return null;
  if (typeof payload !== "object" || Array.isArray(payload)) return "payload";
  for (const k of Object.keys(payload)) if (!["context", "prompt", "messages"].includes(k)) return `payload.${k}`;
  if (payload.context !== undefined && typeof payload.context !== "string") return "context";
  if (payload.prompt !== undefined && typeof payload.prompt !== "string") return "prompt";
  if (payload.messages !== undefined) {
    if (!Array.isArray(payload.messages)) return "messages";
    for (const m of payload.messages) {
      if (!m || typeof m !== "object" || Array.isArray(m) || !["user", "assistant"].includes(m.role)) return "message";
      if (Object.keys(m).some((k) => k !== "role" && k !== "content")) return "message";
      const c = m.content;
      if (typeof c === "string") continue;
      if (!Array.isArray(c) || !c.length || !c.every(isTextBlock)) return "message.content";
    }
  }
  return null;
}

// The provider request with every text redacted: system (a string, or blocks of { type: "text", text }) and each
// message's content (a string, or text blocks). A block of any other kind is never sent: it throws, and coach.js
// sends nothing (the app's own payloads were already held to text only, above).
function redactProviderBody(body, names) {
  if (!body || typeof body !== "object") return body;
  const block = (b) => {
    if (!b || b.type !== "text" || typeof b.text !== "string") throw new Error("coach: a non-text block never goes to the provider");
    return { ...b, text: redactText(b.text, names) };
  };
  const blocks = (v) => (typeof v === "string" ? redactText(v, names)
    : Array.isArray(v) ? v.map(block)
    : (() => { throw new Error("coach: content must be text"); })());
  return {
    ...body,
    ...(body.system !== undefined ? { system: blocks(body.system) } : {}),
    ...(Array.isArray(body.messages) ? { messages: body.messages.map((m) => (m && typeof m === "object" ? { ...m, content: blocks(m.content) } : m)) } : {}),
  };
}

// The household's names, from the asker's side, read from the saved profile. Throws when it cannot be read: the
// coach then sends nothing (coach.js), rather than a request whose names were not checked.
async function coachNamesFor(admin, userId) {
  const mine = await membershipOf(admin, userId);
  let data = null;
  if (mine) {
    const { data: row, error } = await admin.from("household_data").select("data").eq("household_id", mine.household_id).maybeSingle();
    if (error) throw new Error(`household read: ${error.code || "error"}`);
    data = row && row.data;
  } else {
    const { data: row, error } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`user_data read: ${error.code || "error"}`);
    data = row && row.data;
  }
  const p = (data && data.core && data.core.appData && data.core.appData.profile) || {};
  // The profile is written from the owner's side: for the partner, their own name is partnerName.
  const asker = mine && mine.role === "partner" ? { ...p, name: p.partnerName, partnerName: p.name } : p;
  return householdNames(asker);
}

module.exports = { householdNames, redactNames, redactAccountNumbers, redactProviderBody, invalidCoachPayload, coachNamesFor };
