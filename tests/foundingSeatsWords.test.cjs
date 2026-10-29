// tests/foundingSeatsWords.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING WORDS (the first 50 who subscribe; approved 2026-10-29, ChatGPT and Grok agreed).
//
// docs/product/FOUNDING-SEATS-WORDS.md lists every line: its id, where it shows, the approved line, its limit.
//   1  the list and the code name the same ids, each once (the app's, the emails', the /get page's, and A, C, D)
//   2  every line in the code is the approved line, word for word, and within its limit; a template keeps its {n}
//   3  no "[WORDS: id]" placeholder is left anywhere the app, the site or the functions are built from
//   4  the founding list form is gone from the landing (rows 11 to 16), and its consent version was not touched
//   5  the emails go out with their words; one still holding a placeholder never would
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const HOLD = /\[WORDS:\s*[a-z0-9-]+/;

(async () => {
  const t = create();
  const P = await import("../src/lib/pendingWords.js");
  const O = await import("../src/lib/foundingOffer.js");
  const V = await import("../src/lib/billingVisibility.js");
  const S = require("../netlify/functions/_lib/pendingWords.js");
  const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
  const doc = read("docs", "product", "FOUNDING-SEATS-WORDS.md");
  const rows = [...doc.matchAll(/^\| (\d+|[A-Z]) \| ([a-z0-9-]+) \| (.*) \| (.*) \| (\d+) characters \| (.*) \|$/gm)]
    .map((m) => ({ n: m[1], id: m[2], where: m[3], line: m[4], limit: Number(m[5]) }));
  const line = Object.fromEntries(rows.map((r) => [r.id, r.line]));
  const page = read("public", "get", "index.html");
  const ACD = ["landing-founding-heading", "web-founding-row-label", "landing-where-line"];

  // 1. Same ids.
  t.eq(rows.length, 23, "1a the list has 23 lines: rows 1 to 10 and 17 to 26, and A, C, D");
  t.eq(rows.map((r) => r.n), [..."1 2 3 4 5 6 7 8 9 10 17 18 19 20 21 22 23 24 25 26".split(" "), "A", "C", "D"], "1b …numbered as approved (11 to 16 went with the form)");
  t.eq(new Set(rows.map((r) => r.id)).size, rows.length, "1c each id once");
  t.eq([...Object.keys(P.PENDING_WORDS), ...Object.keys(S.PENDING_WORDS), "get-website", ...ACD].sort(), rows.map((r) => r.id).sort(), "1d the list and the code name the same ids");

  // 2. Word for word, within the limit.
  for (const [id, v] of [...Object.entries(P.PENDING_WORDS), ...Object.entries(S.PENDING_WORDS)]) t.eq(v, line[id], `2a ${id}: the approved line, word for word`);
  t.ok(page.includes(`data-words="get-website">${line["get-website"]}</a>`), "2b get-website: the /get page's line, word for word");
  t.eq(O.foundingOfferCopy().heading, line["landing-founding-heading"], "2c A: the price box heading");
  t.eq(V.foundingLabel(50), line["web-founding-row-label"], "2d C: the website's Founding Annual row, with the server's cohort size (50)");
  const D = line["landing-where-line"];
  t.ok(O.foundingOfferCopy().price.endsWith(` ${D}`) && O.foundingCardParts(7).small.endsWith(` ${D}`) && E.LANDING_PRICE_SENTENCE.endsWith(` ${D}`),
    "2e D: the landing's price line, the card's small print, and the email's copy of the landing sentence");
  t.eq(O.foundingCardParts(7).eyebrow, "FOUNDING PRICE · FIRST 50 HOUSEHOLDS", "2f the eyebrow is unchanged");
  for (const r of rows) t.ok(r.line.length <= r.limit, `2g ${r.id}: ${r.line.length} characters, within ${r.limit}`);
  t.eq(["trial-confirm-body", "founding-list-line"].map((id) => /\{n\}/.test(line[id])), [true, true], "2h the two counted lines carry {n}");
  t.eq(P.pendingWords("founding-list-line", 35), line["founding-list-line"].replace("{n}", "35"), "2i …and the live count goes in its place");

  // 3. No placeholder left.
  const built = [...walk("src"), ...walk("netlify"), ...walk("public"), "index.html"].filter((f) => /\.(js|jsx|mjs|cjs|html|json)$/.test(f));
  t.eq(built.filter((f) => HOLD.test(read(f))), [], "3a no [WORDS: placeholder in src/, netlify/, public/ or index.html");
  const { execFileSync } = require("child_process");
  let guard = 0;
  try { execFileSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), "src", "netlify/functions", "public"], { cwd: REPO, stdio: "pipe" }); } catch (e) { guard = e.status; }
  t.eq(guard, 0, "3b the production build's guard finds none");

  // 4. The founding list form is gone.
  const APP = read("src", "App.jsx");
  t.ok(!/<WaitlistForm [^>]*\bfounding\b/.test(APP) && !/function WaitlistForm\(\{[^}]*founding/.test(APP), "4a no founding list form on the landing, and the form has no founding mode");
  t.ok(!/FOUNDING_SPOT_CONSENT/.test(APP), "4b the app no longer shows the founding spot consent line");
  const C = require("../netlify/functions/_lib/waitlistConsent.js");
  t.eq(C.FOUNDING_SPOT_CONSENT_VERSION, "2026-10-22", "4c no new consent version: the founding spot version on record is unchanged (rows that hold it keep it)");

  // 5. The emails.
  {
    const saved = { ...process.env };
    process.env.RESEND_API_KEY = "re_TESTONLY_notarealkey";
    process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
    const sent = [], logs = [];
    const realFetch = global.fetch, realErr = console.error;
    global.fetch = async (url, o = {}) => { sent.push({ url: String(url), body: o.body }); return { ok: true, status: 200, json: async () => ({ id: "x" }) }; };
    console.error = (...a) => logs.push(a.join(" "));
    try {
      const Wl = require("../netlify/functions/_lib/waitlistWelcome.js");
      const row = { id: "00000000-0000-4000-8000-000000000012", is_test: false, consent_version: "2026-10-06", founding_position: 12, unsubscribed_at: null, metadata: {} };
      const r = await E.sendFoundingLinkEmail("household@example.test", row);
      const body = sent.length ? JSON.parse(sent[0].body) : {};
      t.ok(r.sent !== false && body.subject === line["founding-email-subject"] && body.text.includes(line["founding-email-position"]) && body.text.includes(line["founding-email-store-steps"]),
        "5a the founding link email goes out with its approved subject, lead line and steps");
      t.eq(await Wl.sendWelcomeEmail("household@example.test", 12, 12), true, "5b the welcome to an old founding number goes out");
      t.ok(JSON.parse(sent[1].body).text.split("\n\n")[1] === line["welcome-founding-line"], "5c …with the approved founding line second");
      t.eq([S.holdsPendingWords({ text: "[WORDS: x]" }), S.holdsPendingWords(body)], [true, false], "5d a send would still refuse an email holding a placeholder");
    } finally {
      global.fetch = realFetch; console.error = realErr;
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }

  t.summary("foundingSeatsWords.test");
})();
