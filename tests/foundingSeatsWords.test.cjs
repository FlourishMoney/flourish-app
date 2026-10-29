// tests/foundingSeatsWords.test.cjs
// -----------------------------------------------------------------------------
// THE WORDS TO COME FOR THE FOUNDING SEATS (2026-10-29: the first 50 who subscribe).
//
// docs/product/FOUNDING-SEATS-WORDS.md lists every [WORDS: id]: where it shows, the facts it must state, its limit.
//   1  the list and the code name the same ids, each once (the app's, the emails', the /get page's)
//   2  every placeholder is used where the list says, and a template with {n} is listed with {n}
//   3  no placeholder anywhere else in src/ or netlify/functions/ (the one file each), and none in a test-free form
//   4  once the words are in: a line replacing a placeholder fits its listed character limit
//   5  an email still holding a placeholder is never sent: the founding link email and the welcome refuse it
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const HOLD = /\[WORDS:\s*([a-z0-9-]+)/g;

(async () => {
  const t = create();
  const P = await import("../src/lib/pendingWords.js");
  const S = require("../netlify/functions/_lib/pendingWords.js");
  const doc = read("docs", "product", "FOUNDING-SEATS-WORDS.md");
  const rows = [...doc.matchAll(/^\| (\d+) \| ([a-z0-9-]+) \| (.*) \| (.*) \| (.*) \|$/gm)].map((m) => ({ n: Number(m[1]), id: m[2], where: m[3], facts: m[4], limit: m[5] }));
  const listed = rows.map((r) => r.id);
  const page = read("public", "get", "index.html");
  const pageIds = [...page.matchAll(HOLD)].map((m) => m[1]);
  const code = [...Object.keys(P.PENDING_WORDS), ...Object.keys(S.PENDING_WORDS), ...pageIds];

  // 1. Same ids.
  t.eq(rows.map((r) => r.n), rows.map((_, i) => i + 1), "1a the list is numbered 1 to N in order");
  t.eq(new Set(listed).size, listed.length, "1b each id is listed once");
  t.eq([...code].sort(), [...listed].sort(), "1c the list and the code name the same ids");
  for (const [k, v] of [...Object.entries(P.PENDING_WORDS), ...Object.entries(S.PENDING_WORDS)]) {
    t.ok(v.startsWith(`[WORDS: ${k}`) || !/\[WORDS:/.test(v), `1d ${k}: its placeholder names its own id (or its words are in)`);
  }
  t.ok(rows.every((r) => r.where.length > 15 && r.facts.length > 15 && r.limit.length > 3), "1e every row says where it shows, the facts, and the limit");

  // 2. Used where listed; {n}.
  const src = [...walk("src"), ...walk("netlify/functions")].filter((f) => /\.(js|jsx)$/.test(f));
  const all = src.map((f) => [f, read(f)]);
  for (const id of [...Object.keys(P.PENDING_WORDS), ...Object.keys(S.PENDING_WORDS)]) {
    const users = all.filter(([f, s]) => !/pendingWords\.js$/.test(f) && s.includes(`pendingWords("${id}"`)).map(([f]) => f);
    t.ok(users.length >= 1, `2a ${id} is used (${users.join(", ") || "nowhere"})`);
  }
  for (const [id, v] of Object.entries(P.PENDING_WORDS)) {
    const row = rows.find((r) => r.id === id);
    t.eq(/\{n\}/.test(v), !!row && /`\{n\}`/.test(row.facts + row.limit), `2b ${id}: carries {n} exactly when the list says so`);
  }
  t.ok(/data-words="get-website">\[WORDS: get-website\]<\/a>/.test(page), "2c the /get page's line is its placeholder");

  // 3. Nowhere else.
  const elsewhere = all.filter(([f, s]) => !/pendingWords\.js$/.test(f) && HOLD.test(s.replace(/^\s*\/\/.*$/gm, ""))).map(([f]) => f);
  HOLD.lastIndex = 0;
  t.eq(elsewhere, [], "3a no placeholder in src/ or netlify/functions/ outside the two pendingWords.js files");
  const publicHits = walk("public").filter((f) => /\.(html|js)$/.test(f) && /\[WORDS:\s*[a-z0-9-]+/.test(read(f)));
  t.eq(publicHits, [path.join("public", "get", "index.html")], "3b …and in public/, only the /get page");

  // 4. A line written in fits its limit.
  for (const r of rows) {
    const v = P.PENDING_WORDS[r.id] || S.PENDING_WORDS[r.id];
    const max = Number((/^(\d+) characters/.exec(r.limit) || [])[1]);
    if (!v || /\[WORDS:/.test(v) || !max) continue;
    t.ok(v.replace("{n}", "50").length <= max, `4a ${r.id}: ${v.length} characters, within ${max}`);
  }

  // 5. Never sent while a placeholder is in it.
  {
    const saved = { ...process.env };
    process.env.RESEND_API_KEY = "re_TESTONLY_notarealkey";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    const sent = [], logs = [];
    const realFetch = global.fetch, realErr = console.error;
    global.fetch = async (url) => { sent.push(String(url)); return { ok: true, status: 200, json: async () => ({ id: "x" }) }; };
    console.error = (...a) => logs.push(a.join(" "));
    try {
      const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
      const Wl = require("../netlify/functions/_lib/waitlistWelcome.js");
      const row = { id: "00000000-0000-4000-8000-000000000012", is_test: false, consent_version: "2026-10-06", founding_position: 12, unsubscribed_at: null, metadata: {} };
      t.ok(S.holdsPendingWords(E.foundingLinkEmailPayload("household@example.test", row)), "(the founding link email holds placeholders today)");
      t.eq(await E.sendFoundingLinkEmail("household@example.test", row), { sent: false, reason: "words_to_come" }, "5a the founding link email is not sent");
      t.eq(await Wl.sendWelcomeEmail("household@example.test", 12, 12), false, "5b the welcome email to a founding number is not sent");
      t.eq(sent.filter((u) => u.includes("api.resend.com")), [], "5c …nothing reaches Resend");
      t.ok(logs.some((l) => /words_to_come/.test(l)) && !logs.some((l) => l.includes("household@")), "5d …it is logged, without the address");
    } finally {
      global.fetch = realFetch; console.error = realErr;
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }

  t.summary("foundingSeatsWords.test");
})();
