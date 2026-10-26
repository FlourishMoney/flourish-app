// src/lib/coachPrivacy.js
// -----------------------------------------------------------------------------
// What leaves the device for the AI (audit 2026-10-26, B2).
//
// The AI disclosure says the coach is not given your name, email or full account numbers. The coach context
// carried the profile name, the partner's name and each child's name, and an uploaded statement went as text with
// the holder's name and full account number. Now every request to /api/coach goes through coachRequestBody:
//   - the household's names (profile, partner, children) become roles: "you", "partner", "child 1", "child 2"…,
//     wherever they appear (the context, the person's own messages, goals, account names), and an account or
//     card number in any of it (a transfer's description, say) keeps only its last 4 digits;
//   - statement text (redactStatementText) also loses email addresses and account and card numbers (a run of
//     7 or more digits, alone or in groups of 3 or more; amounts and dates are left alone), keeping the last 4.
//
// The names are the household's own (setCoachNames, kept current by App from the profile). A name the household
// never entered, such as a surname printed on a statement, is not known here; the account number still goes.
// PURE apart from that one register; no React, no storage.
// -----------------------------------------------------------------------------

// Names that are also everyday words: these are only replaced when written as a name (Capitalised or CAPITALS),
// so "you may" keeps its "may".
const COMMON_WORDS = new Set(["may", "will", "june", "april", "august", "grace", "hope", "faith", "joy", "rose", "mark", "bill", "sue",
  "pat", "art", "dawn", "ray", "rich", "sky", "summer", "autumn", "win", "chase", "page", "hunter", "april", "eve", "lane", "max",
  "an", "ed", "al", "jo", "bo", "di", "le", "la", "de", "you", "partner", "child"]);

const _letters = "\\p{L}\\p{N}";
const _esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The household's names as [{ text, role }], longest first, so a full name is replaced before its parts.
export function householdNames(profile) {
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

// Replace each of the household's names in `text` with its role.
export function redactNames(text, names) {
  let out = String(text == null ? "" : text);
  for (const n of names || []) {
    const lower = n.text.toLowerCase();
    const bound = (body, flags) => new RegExp(`(?<![${_letters}])(?:${body})(?![${_letters}])`, flags);
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
export function redactAccountNumbers(text) {
  return String(text == null ? "" : text).replace(ACCOUNT_RX, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 7 ? `••••${digits.slice(-4)}` : m;
  });
}

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Statement text for the parser: no email address, no full account number, none of the household's names.
export function redactStatementText(text, names = currentNames()) {
  return redactNames(redactAccountNumbers(String(text == null ? "" : text).replace(EMAIL_RX, "[email]")), names);
}

// Every string in a request body, with account numbers masked and names replaced. Returns a copy.
export function redactBody(value, names) {
  if (typeof value === "string") return redactNames(redactAccountNumbers(value), names);
  if (Array.isArray(value)) return value.map((v) => redactBody(v, names));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactBody(v, names);
    return out;
  }
  return value;
}

// The register App keeps current from the profile.
let _names = [];
export function setCoachNames(profile) { _names = householdNames(profile); }
export function currentNames() { return _names; }

// THE body of every request to /api/coach: JSON, with the household's names replaced by roles.
export function coachRequestBody(body, names = currentNames()) {
  return JSON.stringify(redactBody(body, names));
}
