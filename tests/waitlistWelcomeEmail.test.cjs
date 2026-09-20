// tests/waitlistWelcomeEmail.test.cjs
// -----------------------------------------------------------------------------
// THE WAITLIST CONFIRMATION EMAIL. One short email, sent once, only to someone who was actually added
// to the list. The rules this pins, in the order they matter:
//
//   1. The email is sent ONLY after the insert succeeds, never before it, and never instead of it.
//   2. A duplicate signup sends nothing (both duplicate paths: the 409, and a non-ok body carrying
//      "duplicate key" / 23505). Someone who joined in March must not be emailed again in September.
//   3. With no RESEND_API_KEY configured, nothing is sent and nothing is logged. That is how deploy
//      previews, netlify dev and local runs stay silent instead of emailing real people.
//   4. A Resend failure never costs the signup: the row is already saved, so the response is still
//      joined:true. welcomed_at is stamped only when Resend accepted the message.
//   5. Nothing sensitive is logged: not the address, not the key, not the payload, not the response.
//   6. The key name never appears in src/ or dist/, and never with a VITE_ prefix anywhere.
//
// It runs the REAL netlify/functions/beta.js handler with global fetch stubbed, so it asserts what the
// function actually sends, in the order it sends it. No network, no Supabase, no Resend.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const BETA = path.join(REPO, "netlify", "functions", "beta.js");
const KEY_NAME = ["RESEND", "API", "KEY"].join("_"); // assembled so this file is not itself a hit in the scan
const KEY_SENTINEL = "re_TESTONLY_thisisnotarealkey";
const ADDRESS = "person@example.com";

// The approved copy. If a word changes in beta.js, these assertions must be updated deliberately.
const EXPECTED_PARAGRAPHS = [
  "Thanks for joining the Flourish waitlist.",
  "We'll email you when it's ready for you. No launch date yet, and we won't send anything else in the meantime.",
  "Questions or ideas? Just reply to this email.",
  "Amanda, founder of Flourish",
  "flourishmoney.app",
  "You're receiving this because you joined the waitlist at flourishmoney.app. If this wasn't you, reply and we'll remove you.",
];

// Run the real handler against a stubbed fetch. `insert` decides what Supabase's insert answers and
// `resend` what Resend answers; both default to success. Returns everything the function did.
async function run({ insert = { ok: true, status: 201, body: [{ id: 42 }] }, resend = { ok: true, status: 200 }, withKey = true, action = "join_waitlist", email = ADDRESS } = {}) {
  const calls = [];
  const logs = [];
  const realFetch = global.fetch;
  const realError = console.error, realLog = console.log, realWarn = console.warn;
  const capture = (...args) => logs.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));

  const prevKey = process.env[KEY_NAME];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  if (withKey) process.env[KEY_NAME] = KEY_SENTINEL; else delete process.env[KEY_NAME];

  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || "GET", headers: opts.headers || {}, body: opts.body, signal: opts.signal });
    if (u.includes("api.resend.com")) {
      if (resend.throws) throw new Error("network down");
      if (resend.hang) {
        // Never settles by itself: only the function's OWN AbortController can end this call. If the
        // function stops sending a signal, the safety net below fails the test after 9s instead of
        // hanging the gate forever.
        return new Promise((_resolve, reject) => {
          const abortErr = () => { const e = new Error("The operation was aborted"); e.name = "AbortError"; return e; };
          if (opts.signal) opts.signal.addEventListener("abort", () => reject(abortErr()));
          else setTimeout(() => reject(new Error("STUB SAFETY NET: the function sent no abort signal")), 9000);
        });
      }
      return { ok: resend.ok, status: resend.status, json: async () => ({}), text: async () => "" };
    }
    if (opts.method === "PATCH") return { ok: true, status: 204, json: async () => ({}), text: async () => "" };
    if (opts.method === "POST") {
      return {
        ok: insert.ok, status: insert.status,
        json: async () => insert.body,
        text: async () => (typeof insert.text === "string" ? insert.text : JSON.stringify(insert.body || {})),
      };
    }
    return { ok: true, status: 200, json: async () => ({ total: 0 }), text: async () => "" };
  };
  console.error = capture; console.log = capture; console.warn = capture;

  let res;
  try {
    delete require.cache[require.resolve(BETA)];
    const { handler } = require(BETA);
    res = await handler({
      httpMethod: "POST",
      headers: { origin: "https://flourishmoney.app" },
      body: JSON.stringify({ action, email, country: "CA", source: "landing" }),
    });
  } finally {
    global.fetch = realFetch;
    console.error = realError; console.log = realLog; console.warn = realWarn;
    if (prevKey === undefined) delete process.env[KEY_NAME]; else process.env[KEY_NAME] = prevKey;
  }

  const resendCalls = calls.filter(c => c.url.includes("api.resend.com"));
  return {
    res, calls, logs, resendCalls,
    body: JSON.parse(res.body || "{}"),
    payload: resendCalls.length ? JSON.parse(resendCalls[0].body) : null,
    patches: calls.filter(c => c.method === "PATCH"),
    order: calls.map(c => (c.url.includes("api.resend.com") ? "resend" : `${c.method} supabase`)),
  };
}

(async () => {
  const t = create();

  // ── 1. A real signup: insert first, then the email, then welcomed_at ────────────────────────
  {
    const r = await run();
    t.eq(r.order.join(" -> "), "POST supabase -> resend -> PATCH supabase",
      "1a the row is inserted BEFORE the email is sent, and welcomed_at is stamped after it");
    t.eq(r.resendCalls.length, 1, "1b exactly one email per signup");
    t.eq(JSON.stringify(r.body), JSON.stringify({ joined: true, alreadyJoined: false }), "1c the response is unchanged");
    t.eq(r.patches.length, 1, "1d welcomed_at is written once");
    t.ok(/\/rest\/v1\/waitlist\?id=eq\.42$/.test(r.patches[0].url), "1e …to the row the insert returned, by id");
    t.eq(JSON.parse(r.patches[0].body).welcomed_at !== undefined, true, "1f …setting welcomed_at");
    t.eq(Object.keys(JSON.parse(r.patches[0].body)).join(","), "welcomed_at", "1g …and nothing else on the row");
    t.eq(r.patches[0].headers.Prefer, "return=minimal", "1h the update asks for no row data back");
  }

  // ── 2. The message itself is the approved copy, sent to the person who joined ───────────────
  {
    const p = (await run()).payload;
    t.eq(p.from, "Flourish <hello@flourishmoney.app>", "2a From");
    t.eq(p.reply_to, "hello@flourishmoney.app", "2b Reply-To");
    t.eq(JSON.stringify(p.to), JSON.stringify([ADDRESS]), "2c addressed to the person who joined, and to nobody else");
    t.eq(p.subject, "You're on the Flourish waitlist", "2d Subject");
    t.eq(p.text, EXPECTED_PARAGRAPHS.join("\n\n"), "2e the plain-text body is the approved copy, word for word");
    for (const para of EXPECTED_PARAGRAPHS) t.ok(p.html.includes(para), `2f the HTML carries the same paragraph: "${para.slice(0, 40)}..."`);
    t.ok(/background-color:#F4F1EB/.test(p.html), "2g the HTML is on the app's cream background");
    t.ok(!/<img|background-image|url\(/i.test(p.html), "2h no images");
    t.ok(!/—|–/.test(p.text + p.html), "2i no em dashes anywhere in the email");
    t.ok(!/unsubscribe|launch (date|day) is|guarantee|free|beta/i.test(p.text), "2j no claim the copy does not make");
    // Removed on the owner's CASL decision (2026-09-19): the email stays a transactional confirmation of
    // the person's own request, so it carries no description of the product and nothing promotional.
    const REMOVED = "calm money coach";
    t.ok(!p.text.includes(REMOVED) && !p.html.includes(REMOVED), "2k the product-description sentence is gone from both bodies");
    t.eq(EXPECTED_PARAGRAPHS.length, 6, "2l six paragraphs: thanks, what happens next, reply, sign-off, domain, why-you-got-this");
  }

  // ── 3. Someone already on the list is not emailed again ────────────────────────────────────
  {
    const dup409 = await run({ insert: { ok: false, status: 409, body: {}, text: "" } });
    t.eq(dup409.resendCalls.length, 0, "3a a 409 duplicate sends no email");
    t.eq(JSON.stringify(dup409.body), JSON.stringify({ joined: true, alreadyJoined: true }), "3b …and still reports alreadyJoined");
    t.eq(dup409.patches.length, 0, "3c …and writes no welcomed_at");

    const dupBody = await run({ insert: { ok: false, status: 400, body: {}, text: '{"code":"23505","message":"duplicate key value violates unique constraint"}' } });
    t.eq(dupBody.resendCalls.length, 0, "3d the OTHER duplicate path (23505 in the body) also sends no email");
    t.eq(JSON.stringify(dupBody.body), JSON.stringify({ joined: true, alreadyJoined: true }), "3e …and reports alreadyJoined");
  }

  // ── 4. A failed insert never sends an email ────────────────────────────────────────────────
  {
    const r = await run({ insert: { ok: false, status: 500, body: {}, text: "permission denied for table waitlist" } });
    t.eq(r.resendCalls.length, 0, "4a no row, no email");
    t.eq(r.res.statusCode, 500, "4b the signup reports the failure, as before");
  }

  // ── 5. No key configured: silent, and the signup still works ───────────────────────────────
  {
    const r = await run({ withKey: false });
    t.eq(r.resendCalls.length, 0, "5a with no key, nothing is sent (previews and local runs email nobody)");
    t.eq(r.patches.length, 0, "5b …and welcomed_at is not stamped");
    t.eq(JSON.stringify(r.body), JSON.stringify({ joined: true, alreadyJoined: false }), "5c …and the signup still succeeds");
    t.eq(r.logs.join("|"), "", "5d …silently: nothing is logged at all");
  }

  // ── 6. Resend fails: the signup is unaffected, the log says only what it may ────────────────
  {
    const r = await run({ resend: { ok: false, status: 500 } });
    t.eq(JSON.stringify(r.body), JSON.stringify({ joined: true, alreadyJoined: false }), "6a a Resend failure still returns joined:true");
    t.eq(r.patches.length, 0, "6b …and welcomed_at is NOT stamped, so the row shows no confirmation was sent");
    t.eq(r.logs.length, 1, "6c exactly one log line");
    t.ok(/welcome email failed/.test(r.logs[0]), "6d …saying the welcome email failed");
    t.ok(/\b500\b/.test(r.logs[0]), "6e …with the Resend status code");

    const thrown = await run({ resend: { throws: true } });
    t.eq(JSON.stringify(thrown.body), JSON.stringify({ joined: true, alreadyJoined: false }), "6f a thrown fetch also still returns joined:true");
    t.ok(/welcome email failed/.test(thrown.logs.join("|")), "6g …and is logged the same way");
    t.ok(!/network down|stack|at /i.test(thrown.logs.join("|")), "6h …without the error text");
  }

  // ── 7. Nothing sensitive is logged, on any path ────────────────────────────────────────────
  {
    const runs = [await run(), await run({ resend: { ok: false, status: 422 } }), await run({ resend: { throws: true } }), await run({ insert: { ok: false, status: 409, body: {}, text: "" } })];
    const all = runs.map(r => r.logs.join("|")).join("|");
    t.ok(!all.includes(ADDRESS), "7a no log contains the email address");
    t.ok(!all.includes("example.com"), "7b …not even its domain");
    t.ok(!all.includes(KEY_SENTINEL), "7c no log contains the key value");
    t.ok(!/Bearer/i.test(all), "7d no log contains an Authorization header");
    t.ok(!all.includes("Thanks for joining"), "7e no log contains the message body");
    t.ok(!/test-service-role/.test(all), "7f no log contains the Supabase secret");
    // The key value must not leave the function anywhere except the Resend Authorization header.
    const sent = runs[0];
    const nonResend = sent.calls.filter(c => !c.url.includes("api.resend.com"));
    t.ok(!JSON.stringify(nonResend).includes(KEY_SENTINEL), "7g the key is sent to Resend and to nothing else");
    t.ok(!JSON.stringify(sent.res).includes(KEY_SENTINEL) && !JSON.stringify(sent.res).includes(ADDRESS), "7h the HTTP response carries neither the key nor the address");
  }

  // ── 8. Other actions are untouched ─────────────────────────────────────────────────────────
  {
    const r = await run({ action: "count" });
    t.eq(r.resendCalls.length, 0, "8a the count action sends no email");
  }

  // ── 9. The key name is server-side only ────────────────────────────────────────────────────
  {
    const walk = (dir, out = []) => {
      if (!fs.existsSync(dir)) return out;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else out.push(full);
      }
      return out;
    };
    const scan = (dir) => walk(path.join(REPO, dir)).filter(f => fs.statSync(f).size < 8e6 && fs.readFileSync(f, "utf8").includes(KEY_NAME)).map(f => path.relative(REPO, f));
    t.eq(scan("src").join(","), "", `9a ${KEY_NAME} never appears in src/`);
    const distDir = path.join(REPO, "dist");
    if (fs.existsSync(distDir)) t.eq(scan("dist").join(","), "", `9b ${KEY_NAME} never appears in the built bundle (dist/)`);
    else t.ok(true, "9b dist/ is not built here (it is gitignored); scanned when present");
    t.ok(fs.readFileSync(BETA, "utf8").includes(`process.env.${KEY_NAME}`), "9c …and the function does read it from process.env, so the scan is looking for the right name");
    const viteHits = ["src", "netlify", "tests"].flatMap(d => walk(path.join(REPO, d))).filter(f => /VITE_[A-Z_]*RESEND|RESEND[A-Z_]*VITE/.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(REPO, f));
    t.eq(viteHits.join(","), "", "9d no VITE_-prefixed Resend variable anywhere");
    const literalKey = ["src", "netlify"].flatMap(d => walk(path.join(REPO, d))).filter(f => /\bre_[A-Za-z0-9]{12,}/.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(REPO, f));
    t.eq(literalKey.join(","), "", "9e no Resend-shaped key literal is committed in src/ or netlify/");
  }

  // ── 10. The address is trimmed before it is validated, stored and emailed ──────────────────
  // Pre-existing bug: the regex rejects any whitespace and ran against the RAW input, so a trailing
  // space was a 400 rather than a signup. The browser trims before it posts, so this only ever bit
  // non-browser callers, but the row, the check and the email must all agree on one address anyway.
  {
    const insertedEmail = (r) => {
      const post = r.calls.find(c => c.method === "POST" && !c.url.includes("resend"));
      return post ? JSON.parse(post.body).email : "(no row inserted)";
    };
    const emailedTo = (r) => (r.payload ? JSON.stringify(r.payload.to) : "(no email sent)");
    for (const raw of [" person@example.com", "person@example.com ", "  Person@Example.com  ", "person@example.com\n", "\tPERSON@EXAMPLE.COM"]) {
      const shown = JSON.stringify(raw);
      const r = await run({ email: raw });
      t.eq(r.res.statusCode, 200, `10a ${shown} is accepted, not rejected as invalid`);
      t.eq(insertedEmail(r), ADDRESS, `10b ${shown} is stored trimmed and lowercased`);
      t.eq(emailedTo(r), JSON.stringify([ADDRESS]), `10c ${shown} is emailed at the trimmed address`);
    }
    // Still rejected: whitespace INSIDE the address, and anything that is not an address at all.
    for (const bad of ["per son@example.com", "person@exa mple.com", "notanemail", "person@example", "", "   ", 42, null]) {
      const shown = JSON.stringify(bad);
      const r = await run({ email: bad });
      t.eq(r.res.statusCode, 400, `10d ${shown} is still rejected`);
      t.eq(r.calls.length, 0, `10e ${shown} writes no row and sends no email`);
    }
  }

  // ── 11. A Resend call that never answers cannot take the signup with it ────────────────────
  // A Netlify function is killed at 10s. The row is already inserted by this point, so a hanging send
  // must not turn a successful signup into a failed request. The function sets its own 5s deadline.
  // This is the one slow assertion in the suite: it waits out that real deadline on purpose.
  {
    const started = Date.now();
    const r = await run({ resend: { hang: true } });
    const elapsed = Date.now() - started;
    t.eq(JSON.stringify(r.body), JSON.stringify({ joined: true, alreadyJoined: false }), "11a a Resend call that never answers still returns joined:true");
    t.ok(elapsed >= 4500, `11b …because the function's own deadline fired, not because the call failed instantly (took ${elapsed}ms)`);
    t.ok(elapsed < 8000, `11c …and it answers well inside the 10s Netlify limit (took ${elapsed}ms)`);
    t.ok(!!(r.calls.find(c => c.url.includes("api.resend.com")) || {}).signal, "11d the Resend request carries an abort signal, so a deadline can end it");
    t.eq(r.patches.length, 0, "11e welcomed_at is not stamped for a send that never completed");
    t.eq(r.logs.length, 1, "11f exactly one log line");
    t.ok(/welcome email failed/.test(r.logs[0]), "11g …saying the welcome email failed");
    t.ok(/timeout/.test(r.logs[0]), "11h …with \"timeout\" rather than a status code");
    t.ok(!r.logs[0].includes(ADDRESS) && !r.logs[0].includes(KEY_SENTINEL) && !/abort|operation/i.test(r.logs[0]), "11i …and nothing sensitive or internal");
  }

  t.summary("waitlistWelcomeEmail.test");
})();
