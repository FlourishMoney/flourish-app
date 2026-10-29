// tests/foundingOffer.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING OFFER ON THE LANDING PAGE (Amanda's decision, 2026-10-06).
//
//   1. The counter never shows a number it did not read. The endpoint answers a count it read or a
//      503, never a default; the page shows the endpoint's whole number 0 to 50 or no line at all.
//   2. Positions are unique and stop at 50, assigned inside the insert under one lock (migration 0014).
//   3. Test rows never count: not in the spots-left count, not in the trigger, not in the backfill.
//      Since 0017 (2026-10-14): a test address (getgrowsmart.com, flourishmoney.app) is a test row from
//      the moment it joins; a test row's number is void, never reissued, never counted; spots left is 50
//      less the REAL holders, so numbers can run past 50 while exactly 50 households hold one (section 8).
//   4. The copy matches the approved words exactly, on the page and in the welcome email, and the
//      block sits directly under the hero's waitlist form.
//   5. No price on a store app: the block renders nothing natively and asks nothing.
//
// The SQL is checked here by its text, because CI has no Postgres. It was also run for real against the
// Supabase Postgres 17.6.1.167 image (60 concurrent signups, a test row, the backfill, the grants); the
// results are in the PR.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { loadApp, textOf, describe, REPO } = require("./_renderApp.cjs");

const FN = path.join(REPO, "netlify", "functions", "founding.js");
const LIB = path.join(REPO, "netlify", "functions", "_lib", "foundingWaitlist.js");
const MIG = path.join(REPO, "supabase", "migrations", "0014_waitlist_founding.sql");
const GRANTS = path.join(REPO, "supabase", "migrations", "0015_waitlist_founding_grants.sql");
const fresh = (p) => { delete require.cache[require.resolve(p)]; return require(p); };
const stripSql = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");

const HEADING = "Founding price for the first 50 households";
const PRICE_LINE = "$79.99 a year plus tax, for as long as you stay subscribed. Paid on flourishmoney.app, and it works in the iPhone and Android apps too.";
const REGULAR_LINE = "Standard price for everyone else: $99.99 a year or $11.99 a month, plus tax.";
const JOIN_LINE = "Join the waitlist. The first 50 households on the waitlist get the founding price. Payments open October 26. Joining is free.";
const FULL_LINE = "Founding spots are full. Join the waitlist for launch news.";
// 2026-10-29 (the first 50 who subscribe): the welcome email's founding line no longer names a number; its words are to
// come (docs/product/FOUNDING-SEATS-WORDS.md row 21). It was "You're founding household #N of 50. We'll email your link…".
const EMAIL_LINE = () => "[WORDS: welcome-founding-line]";

// Run the real endpoint against a stubbed Supabase. `supabase` decides the answer to the seat count
// (0032's founding_seats_taken, a bare number): seats, or a status, a thrown error, or a body that is not a count.
async function callEndpoint({ supabase = { seats: 37 }, env = true, method = "GET", now = 1e12, mod } = {}) {
  const calls = [], logs = [];
  const realFetch = global.fetch, realError = console.error;
  const prev = [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
  if (env) { process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY = "test-service-role"; }
  else { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; }
  global.fetch = async (url, o = {}) => {
    calls.push({ url: String(url), method: o.method || "GET", headers: o.headers || {}, body: o.body });
    if (supabase.throws) throw Object.assign(new Error("boom"), { name: supabase.throws });
    const status = supabase.status;
    return {
      ok: !status || status < 300, status: status || 200,
      headers: { get: () => null },
      json: async () => { if ("json" in supabase) { if (supabase.json instanceof Error) throw supabase.json; return supabase.json; } return supabase.seats; },
    };
  };
  console.error = (...a) => logs.push(a.join(" "));
  let res;
  try {
    const m = mod || fresh(FN);
    res = await m._test.handler({ httpMethod: method, headers: { origin: "https://flourishmoney.app" } }, {}, now);
  } finally {
    global.fetch = realFetch; console.error = realError;
    [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY] = prev;
    if (prev[0] === undefined) delete process.env.SUPABASE_URL;
    if (prev[1] === undefined) delete process.env.SUPABASE_SECRET_KEY;
  }
  let body = null; try { body = JSON.parse(res.body); } catch {}
  return { res, body, calls, logs };
}

(async () => {
  const t = create();
  const W = require(LIB);
  const O = await import("../src/lib/foundingOffer.js");

  // ── 1. The counter never shows a number it did not read ───────────────────────────────────────
  {
    // The endpoint: a count it read, or nothing; and (billing day, 2026-10-15) whether signup is open, so the
    // landing learns both from this one call.
    delete process.env.OPEN_SIGNUP;
    const ok = await callEndpoint();
    t.eq([ok.res.statusCode, JSON.stringify(ok.body)], [200, '{"spotsLeft":13,"openSignup":false}'], "1a 37 founding seats held: 13 spots left, the one number, and that signup is shut");
    t.ok(/max-age=60/.test(ok.res.headers["Cache-Control"]) && /max-age=60/.test(ok.res.headers["Netlify-CDN-Cache-Control"]), "1b a good answer is cached for 60 s");
    t.eq(ok.calls.length, 1, "1c one read of Supabase");
    t.ok(ok.calls[0].method === "POST" && ok.calls[0].body === "{}" && ok.calls[0].headers.apikey === "test-service-role", "1d …one call with the service role and no input, so no row comes back at all");
    t.ok(/\/rest\/v1\/rpc\/founding_seats_taken$/.test(ok.calls[0].url), "1e …of the founding seats held (0032): households whose founding payment succeeded, less refunds");
    t.eq(JSON.stringify((await callEndpoint({ supabase: { seats: 64 } })).body), '{"spotsLeft":0,"openSignup":false}', "1f 64 seats held (a store race past 50): 0 left, never below 0");
    t.eq(JSON.stringify((await callEndpoint({ supabase: { seats: 0 } })).body), '{"spotsLeft":50,"openSignup":false}', "1g no seat held yet: 50 left");
    t.eq(JSON.stringify((await callEndpoint({ supabase: { seats: 1 } })).body), '{"spotsLeft":49,"openSignup":false}', "1g2 one seat held: 49 left");
    process.env.OPEN_SIGNUP = "true";
    t.eq(JSON.stringify((await callEndpoint()).body), '{"spotsLeft":13,"openSignup":true}', "1g3 signup open: the answer says so");
    t.eq(JSON.stringify((await callEndpoint({ env: false })).body), '{"error":"unavailable","openSignup":true}', "1g4 …even when the count cannot be read");
    process.env.OPEN_SIGNUP = "TRUE";
    t.eq((await callEndpoint()).body.openSignup, false, "1g5 only exactly \"true\" is open");
    delete process.env.OPEN_SIGNUP;
    const fails = {
      "no Supabase env": { env: false },
      "Supabase 404 (0032 not applied: no founding_seats_taken)": { supabase: { status: 404 } },
      "Supabase 400": { supabase: { status: 400 } },
      "Supabase 500": { supabase: { status: 500 } },
      "a body that is not a count": { supabase: { json: "12" } },
      "a negative count": { supabase: { json: -1 } },
      "a fraction": { supabase: { json: 3.5 } },
      "unreadable JSON": { supabase: { json: new Error("not json") } },
      "a timeout": { supabase: { throws: "AbortError" } },
      "a network failure": { supabase: { throws: "TypeError" } },
    };
    for (const [why, opts] of Object.entries(fails)) {
      const r = await callEndpoint(opts);
      t.ok(r.res.statusCode === 503 && JSON.stringify(r.body) === '{"error":"unavailable","openSignup":false}' && r.res.headers["Cache-Control"] === "no-store",
        `1h ${why}: 503 unavailable, no number, not cached`);
    }
    t.eq((await callEndpoint({ method: "POST" })).res.statusCode, 405, "1i only GET (and HEAD) are answered");

    // The cache: 60 s, and a failure never replaces a good answer with an invented one.
    const mod = fresh(FN);
    const a = await callEndpoint({ mod, now: 1e12, supabase: { seats: 10 } });
    const b = await callEndpoint({ mod, now: 1e12 + 59_000, supabase: { seats: 11 } });
    const c = await callEndpoint({ mod, now: 1e12 + 60_000, supabase: { status: 500 } });
    const d = await callEndpoint({ mod, now: 1e12 + 61_000, supabase: { seats: 12 } });
    t.eq([a.body.spotsLeft, b.body.spotsLeft, b.calls.length], [40, 40, 0], "1j within 60 s the cached answer is sent without a new read");
    t.eq([c.res.statusCode, c.calls.length, d.body.spotsLeft], [503, 1, 38], "1k after 60 s it reads again; a failed read is a 503, not the old figure, and the next good read is fresh");

    // The page: only a whole number 0 to 50 that came from the endpoint makes a line.
    const bodies = [[{ spotsLeft: 12 }, 12], [{ spotsLeft: 0 }, 0], [{ spotsLeft: 50 }, 50], [{ spotsLeft: "12" }, null], [{ spotsLeft: 12.5 }, null],
      [{ spotsLeft: -1 }, null], [{ spotsLeft: 51 }, null], [{ spotsLeft: null }, null], [{}, null], [null, null], [{ error: "unavailable" }, null]];
    t.eq(bodies.map(([b]) => O.spotsLeftFrom(b)), bodies.map(([, n]) => n), "1l the page accepts only a whole number from 0 to 50 in spotsLeft");
    t.eq([O.foundingLiveLine(12), O.foundingLiveLine(1), O.foundingLiveLine(0), O.foundingLiveLine(null), O.foundingLiveLine(undefined), O.foundingLiveLine(51)],
      ["12 of 50 founding spots left", "1 of 50 founding spots left", FULL_LINE, null, null, null], "1m the live line for each, and no line when there is no number");
    const res = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });
    const reads = await Promise.all([
      O.fetchFoundingSpots(res(200, { spotsLeft: 7 })),
      O.fetchFoundingSpots(res(503, { spotsLeft: 7 })),
      O.fetchFoundingSpots(res(200, { error: "unavailable" })),
      O.fetchFoundingSpots(async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } })),
      O.fetchFoundingSpots(async () => { throw new Error("offline"); }),
      O.fetchFoundingSpots(null),
    ]);
    t.eq(reads, [7, null, null, null, null, null], "1n a read is the number on a 200 with a valid body, and null on a non-200, a bad body, unreadable JSON, offline, or no fetch");

    // Rendered: before the endpoint has answered (and server-side, where it never does) there is no line.
    let A = {};
    try { A = loadApp(["AuthScreen", "FoundingOffer"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.FoundingOffer) {
      const html = A.render(A.h(A.FoundingOffer, {}));
      t.ok(!/founding spots left|spots are full/i.test(html) && !/data-founding-live/.test(html), "1o until the endpoint answers, no live line is drawn");
      const digits = textOf(html).replace(/\$\d+\.\d{2}/g, "").replace(/first 50 households|October 26/gi, "");
      t.ok(!/\d/.test(digits), "1p …and no other number appears in the block");
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer("), app.indexOf("function AuthScreen("));
    t.ok(/sharedFoundingSpots\(\)\.then\(n => \{ if \(live\) setSpotsLeft\(n\); \}\)/.test(comp) && /useState\(null\)/.test(comp) && /\{!launched && liveLine && <p/.test(comp),
      "1q the component starts with no number, sets only what the read returned, and draws the line only when there is one");
    t.ok(!/setSpotsLeft\((?!n\))/.test(comp), "1r …and sets spotsLeft nowhere else");
  }

  // ── 2. Positions are unique and stop at 50, inside the insert ─────────────────────────────────
  {
    const raw = fs.readFileSync(MIG, "utf8");
    const sql = stripSql(raw);
    t.ok(/add column if not exists founding_position integer/.test(sql) && /add column if not exists is_test boolean not null default false/.test(sql), "2a the two columns, safe to run twice");
    t.ok(/check \(founding_position is null or \(founding_position between 1 and 50\)\)/.test(sql), "2b a position is 1 to 50 or null, enforced by the database");
    t.ok(/create unique index if not exists waitlist_founding_position_key\s+on public\.waitlist \(founding_position\) where founding_position is not null/.test(sql), "2c no two rows can hold the same position");
    const trig = sql.slice(sql.indexOf("function public.waitlist_assign_founding_position()"), sql.indexOf("$$;", sql.indexOf("function public.waitlist_assign_founding_position()")));
    t.ok(/before insert on public\.waitlist\s+for each row execute function public\.waitlist_assign_founding_position\(\)/.test(sql), "2d the position is set BEFORE INSERT, in the insert's own transaction");
    const lockAt = trig.indexOf("pg_advisory_xact_lock("), countAt = trig.indexOf("select count(*) into issued from public.waitlist_founding_ledger"), pickAt = trig.indexOf("values (issued + 1, k)");
    t.ok(lockAt > 0 && countAt > lockAt && pickAt > countAt, "2e under a transaction-scoped lock, taken before the count and the pick, so a second signup waits for the first to commit");
    t.ok(/if issued >= 50 then\s+return new;/.test(trig) && /new\.founding_position := null;/.test(trig), "2f once 50 numbers have been issued, a new row gets null");
    t.ok(/insert into public\.waitlist_founding_ledger \(position, email_key\) values \(issued \+ 1, k\);\s+new\.founding_position := issued \+ 1;/.test(trig),
      "2g otherwise the next number, recorded in the ledger: a number is issued once and never reissued");
    t.ok(/create table if not exists public\.waitlist_founding_ledger/.test(sql) && !/delete from public\.waitlist_founding_ledger/.test(sql),
      "2g2 the ledger is only ever added to");
    t.ok(/select l\.position into prior from public\.waitlist_founding_ledger l where l\.email_key = k;/.test(trig),
      "2g3 a household that comes back gets its old number, never a new one");
    t.ok(/new\.created_at := clock_timestamp\(\);/.test(trig) && trig.indexOf("clock_timestamp") > lockAt, "2h created_at is the moment the row takes the lock, so position order is created_at order");
    t.ok(/new\.founding_position := /.test(trig) && !/new\.founding_position\s*:=\s*new\./.test(trig), "2i a position the caller sent is always overwritten, never kept");
    const start = sql.slice(sql.indexOf("function public.waitlist_founding_start()"));
    t.ok(/row_number\(\) over \(order by w\.created_at, w\.id\)/.test(start) && /where n <= 50/.test(start)
      && /insert into public\.waitlist_founding_ledger \(position, email_key\)/.test(start) && /enable trigger waitlist_founding_position/.test(start),
      "2j the backfill numbers existing rows 1 to 50 in created_at order, records them in the ledger, then switches the trigger on");
    const guardAt = start.indexOf("raise exception 'waitlist_founding_start() has already run"), firstWrite = start.indexOf("insert into public.waitlist_founding_ledger");
    t.ok(guardAt > 0 && guardAt < firstWrite && /tgenabled <> 'D'/.test(start) && /exists \(select 1 from public\.waitlist_founding_ledger\)/.test(start),
      "2j2 start() runs once: if the trigger is on or any number is issued, it raises before writing anything");
    t.ok(/if not exists \(select 1 from pg_trigger where tgname = 'waitlist_founding_position'/.test(sql) && !/drop trigger/.test(sql),
      "2k running 0014 again never switches an enabled trigger back off");
    t.ok(!/\bdrop\s+(table|column)|\bdelete\s+from|\btruncate\b/i.test(sql), "2l nothing is dropped or deleted");
    // beta.js never sends a position, and passes on the one the database returned.
    const beta = fs.readFileSync(path.join(REPO, "netlify", "functions", "beta.js"), "utf8");
    const insertBody = beta.slice(beta.indexOf("body: JSON.stringify({\n          email: emailAddr"), beta.indexOf("signal: insertController.signal"));
    // 2026-10-14: is_test may be sent, and only as true for a test address (section 8 runs the handler).
    t.ok(insertBody.length > 50 && !/founding|created_at/.test(insertBody) && /\.\.\.\(isTestEmail\(emailAddr\) \? \{ is_test: true \} : \{\}\)/.test(insertBody)
      && !/is_test: false/.test(insertBody), "2m the signup insert sends no position and no created_at, and sends is_test only as true, for a test address");
    t.ok(/sendWelcomeEmail\(emailAddr, insertedRow && insertedRow\.id, welcomePositionFor\(\{ email: emailAddr, \.\.\.\(insertedRow \|\| \{\}\) \}\)\)/.test(beta), "2n the welcome email gets the number the database returned for that row, unless it is a test row");
  }

  // ── 3. Test rows never count ──────────────────────────────────────────────────────────────────
  {
    const sql = stripSql(fs.readFileSync(MIG, "utf8"));
    const trig = sql.slice(sql.indexOf("function public.waitlist_assign_founding_position()"), sql.indexOf("$$;", sql.indexOf("function public.waitlist_assign_founding_position()")));
    t.ok(/new\.founding_position := null;\s+if new\.is_test then\s+return new;/.test(trig), "3a a test row never gets a number");
    t.ok(trig.indexOf("if new.is_test then") < trig.indexOf("insert into public.waitlist_founding_ledger"), "3b …and never enters the ledger, so it never uses up one of the 50");
    t.ok(/from public\.waitlist w\s+where not w\.is_test/.test(sql.slice(sql.indexOf("function public.waitlist_founding_start()"))), "3c …and the backfill leaves test rows out");
    const ep = fs.readFileSync(FN, "utf8");
    t.ok(/rpc\/founding_seats_taken/.test(ep) && !/waitlist_founding_ledger/.test(ep), "3d the spots-left count counts founding seats, never waitlist rows (2026-10-29)");
    t.eq([W.spotsLeftFromCount(0), W.spotsLeftFromCount(37), W.spotsLeftFromCount(50), W.spotsLeftFromCount(51), W.spotsLeftFromCount(-1), W.spotsLeftFromCount(3.5), W.spotsLeftFromCount(null)],
      [50, 13, 0, 0, null, null, null], "3e spots left is max(0, 50 - eligible rows), and null for anything that is not a count");
    const raw = fs.readFileSync(MIG, "utf8") + fs.readFileSync(GRANTS, "utf8");
    t.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(raw.replace(/<that row id>/g, "")), "3f no address is written into either migration: the test row is marked by its id, in the SQL editor");
  }

  // ── 4. The copy, exactly, and where it sits ───────────────────────────────────────────────────
  {
    const c = O.foundingOfferCopy();
    t.eq([c.heading, c.price, c.regular, c.join], [HEADING, PRICE_LINE, REGULAR_LINE, JOIN_LINE], "4a the heading and all three lines are the approved words");
    const pricing = fs.readFileSync(path.join(REPO, "src", "lib", "foundingOffer.js"), "utf8");
    t.ok(!/\d+\.\d{2}/.test(pricing), "4b …with every price read from pricing.js, none typed in the block");
    t.eq([1, 7, 50].map(W.foundingWelcomeLine), [EMAIL_LINE(1), EMAIL_LINE(7), EMAIL_LINE(50)], "4c the welcome email's founding line, one line for every founding number (words to come)");
    t.eq([0, -1, null, undefined, "7", 7.5].map(W.foundingWelcomeLine), [null, null, null, null, null, null], "4d …and no line for a row without a founding number");
    // Amanda, 2026-10-14: never a number above 50. A number past 50 (issued after test numbers were
    // voided, 0017) is still one of the first 50 real households, and is told exactly that.
    const PAST_50 = EMAIL_LINE();
    t.eq([51, 53, 62].map(W.foundingWelcomeLine), [PAST_50, PAST_50, PAST_50], "4d2 a number above 50: the same line");
    t.ok([51, 53, 62].every((n) => !W.foundingWelcomeLine(n).includes(String(n))), "4d3 …and the number itself is never shown");
    t.eq(W.foundingWelcomeLine(50), EMAIL_LINE(50), "4d4 #50: the same line");
    let A = {};
    try { A = loadApp(["AuthScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.AuthScreen) {
      const html = A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} }));
      // Before any answer the landing is the trial-first page (2026-10-22): the block follows the hero's column (the
      // main button, its lines and the badges) and holds the founding list form and its consent line.
      const formAt = html.indexOf('class="fll-hero-form"'), offerAt = html.indexOf('class="fll-founding"'), consentAt = html.indexOf('id="fll-consent-hero"'), demoAt = html.indexOf('class="fll-hero-demo"');
      t.ok(formAt > 0 && offerAt > formAt && consentAt > offerAt && demoAt > consentAt, "4e the block comes right after the hero's column, holds the form and its consent line, and comes before the demo column");
      const app4 = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
      // The trial-first landing (approved Oct 22): on a phone, the $1,944 card comes straight after the subline, then the
      // main button and its lines, then this block.
      t.ok(/grid-template-areas:"text" "card" "form" "founding" "demo"/.test(app4),
        "4e2 one column (phones): header text, the $1,944 card, the main button and its lines, then the block");
      const desk4 = app4.slice(app4.indexOf("@media(min-width:960px){"), app4.indexOf("@media(min-width:960px){") + 2500);
      t.ok(/grid-template-areas:"text card" "form card" "founding card" "demo card"/.test(desk4) && /\.fll-founding\{ justify-self:start; \}/.test(desk4),
        "4e3 desktop: in the left column, under the main button and its lines");
      const block = textOf(html.slice(offerAt, demoAt));
      t.ok(block.includes(HEADING) && block.includes(PRICE_LINE) && block.includes(REGULAR_LINE) && !block.includes(JOIN_LINE) && !/Join the waitlist|Payments open October 26/.test(block),
        "4f the rendered block reads the approved words of the trial-first page (no join line, nothing about the waitlist)");
      t.ok(block.indexOf(HEADING) < block.indexOf(PRICE_LINE) && block.indexOf(PRICE_LINE) < block.indexOf(REGULAR_LINE),
        "4f2 …in the approved order: heading, founding price, regular price");
      t.eq((html.match(/class="fll-founding"/g) || []).length, 1, "4g one block, in the hero only");
      t.ok(!/[—–]/.test(HEADING + PRICE_LINE + REGULAR_LINE + JOIN_LINE + FULL_LINE + EMAIL_LINE(1)), "4h no em or en dashes in any of it");
    }
  }

  // ── 5. No price on a store app ────────────────────────────────────────────────────────────────
  {
    let A = {};
    try { A = loadApp(["AuthScreen", "FoundingOffer"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    const real = globalThis.Capacitor;
    const setPlatform = (p) => Object.defineProperty(globalThis, "Capacitor", { value: { ...real, getPlatform: () => p, isNativePlatform: () => p !== "web" }, configurable: true, writable: true });
    const as = (p, fn) => { setPlatform(p); try { return fn(); } finally { setPlatform("web"); } };
    if (A.FoundingOffer && A.AuthScreen) {
      for (const p of ["ios", "android"]) {
        t.eq(as(p, () => A.render(A.h(A.FoundingOffer, {}))), "", `5a on ${p} the block renders nothing`);
        const auth = as(p, () => textOf(A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} }))));
        t.ok(!/\$\d|Founding price|founding spots/i.test(auth), `5b …and the ${p} sign-in screen carries no price and no founding line`);
      }
      t.ok(as("web", () => textOf(A.render(A.h(A.FoundingOffer, {})))).includes("$79.99"), "5c on the web the same render does show the price, so the native check is not blind");
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer("), app.indexOf("function AuthScreen("));
    t.ok(/useEffect\(\(\) => \{\s*if \(isNativeApp\(\)\) return undefined;/.test(comp), "5d a store app never calls /api/founding");
  }

  // ── 6. Desktop: the card on the right, top-aligned; the block in the left column (approved Oct 22) ───────
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer("), app.indexOf("function FoundingListLine("));
    t.ok(!/--fll-founding-h/.test(app), "6a no space is reserved under the card any more (the block is in the left column, not beside the card)");
    const desk = app.slice(app.indexOf("@media(min-width:960px){"), app.indexOf("@media(min-width:960px){") + 2000);
    t.ok(/\.fll-hero-card\{[^}]*justify-self:end; align-self:start; margin-bottom:0; \}/.test(desk), "6b from 960px the card sits on the right, its top level with the headline");
    const wide = app.slice(app.indexOf("@media(min-width:1024px){"), app.indexOf("@media(min-width:1024px){") + 1500);
    t.ok(/grid-template-areas:"text card" "form card" "founding card" "demo demo"/.test(wide) && /\.fll-founding\{ justify-self:start; \}/.test(wide),
      "6c from 1024px too: text, the main button's column and the block on the left, the card on the right, the videos below");
    t.ok(/\{children\}\s*<\/section>/.test(comp), "6d the founding list form goes inside the block, after its lines");
  }

  // ── 7. Under 960px the block does not repeat the card's price or count (2026-10-07) ──────────
  {
    const c = O.foundingOfferCopy();
    t.eq([c.phoneHeading, c.phoneJoin], ["How founding spots work",
      "The first 50 households on the waitlist get the founding price. Payments open October 26. Joining is free."], "7a the phone heading and sentence, word for word");
    t.eq([c.heading, c.price, c.regular, c.join], [HEADING, PRICE_LINE, REGULAR_LINE, JOIN_LINE], "7b the desktop wording is unchanged");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer("), app.indexOf("function FoundingCard("));
    t.ok(/<span className="fll-fo-desk">\{copy\.heading\}<\/span><span className="fll-fo-phone">\{copy\.phoneHeading\}<\/span>/.test(comp),
      "7c one heading, its desktop and phone words switched by CSS");
    t.ok(/<p className="fll-founding-p fll-fo-desk">\{copy\.price\}<\/p>\s+\{!launched && <p className="fll-founding-p fll-fo-phone">\{copy\.phoneJoin\}<\/p>\}\s+<p className="fll-founding-p">\{copy\.regular\}<\/p>\s+\{!launched && <p className="fll-founding-p fll-fo-desk">\{copy\.join\}<\/p>\}/.test(comp),
      "7d phones: how the spots work, then the regular price; desktop: price, regular, join (the how and the join only before the launch)");
    // After the launch (Oct 22): the box drops what the page already says. Rendered, both ways.
    let R = {};
    try { R = loadApp(["FoundingOffer"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (R.FoundingOffer) {
      const before = R.render(R.h(R.FoundingOffer, {})), after = R.render(R.h(R.FoundingOffer, { launched: true }));
      t.ok(/fll-fo-phone">How founding spots work</.test(before) && before.includes(JOIN_LINE.replace(/'/g, "&#x27;")), "7e before the launch: the box exactly as it was (how the spots work, the join line)");
      const tA = textOf(after);
      t.ok(!/How founding spots work/.test(tA) && !tA.includes("The first 50 households on the waitlist get the founding price. Joining is free.") && !/data-founding-live/.test(after),
        "7f after the launch: no \"How founding spots work\", no join line, no count line in the box");
      t.ok(tA.includes(HEADING) && tA.includes(PRICE_LINE) && tA.includes(REGULAR_LINE) && /<h2 class="fll-founding-h fll-fo-desk" id="fll-founding-h">/.test(after),
        "7g …and still the desktop heading, the founding price with \"Paid on flourishmoney.app, and it works in the iPhone and Android apps too.\", and the standard price");
    }
    t.ok(/className=\{`fll-founding-live\$\{spotsLeft > 0 \? " fll-fo-desk" : ""\}`\}/.test(comp),
      "7e the \"X of 50 founding spots left\" line is desktop only; \"spots are full\" shows at every width");
    const desk = app.slice(app.indexOf("@media(min-width:960px){"), app.indexOf("@media(min-width:960px){") + 3000);
    t.ok(/@media\(max-width:959px\)\{ \.fll-fo-desk\{ display:none; \} \}/.test(app) && /\.fll-fo-phone\{ display:none; \}/.test(desk),
      "7f under 960px the desktop words are hidden; from 960px the phone words are");
  }

  // ── 8. Test sign-ups never hold a founding number (0017, 2026-10-14; since 2026-10-20 in 0025) ─────
  // 0025 replaces 0017 (PR #69) and 0021 (PR #83): one issuing rule, founding_issue_for_key, for the waitlist
  // trigger and for confirmed accounts. tests/foundingLedger.sql.test.cjs runs it in a real Postgres.
  {
    const raw = fs.readFileSync(path.join(REPO, "supabase", "migrations", "0025_founding_ledger.sql"), "utf8");
    const sql = stripSql(raw);
    const body = (name) => { const i = sql.indexOf(`function public.${name}(`); return i < 0 ? "" : sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 2)); };
    const ins = body("waitlist_assign_founding_position"), upd = body("waitlist_void_founding_on_test"), issue = body("founding_issue_for_key");
    t.ok(/add column if not exists void_at timestamptz/.test(sql) && /void_reason in \('test', 'beta_founder'\)/.test(sql), "8a the ledger can mark a number void, and says why (a test, a beta founder)");
    // Rejoin of a test-domain email stays test; a test row never reaches the issuing rule.
    const domAt = ins.indexOf("if public.waitlist_is_test_email(new.email) then\n    new.is_test := true;"), testAt = ins.indexOf("if new.is_test then\n    return new;"), issueAt = ins.indexOf("public.founding_issue_for_key(k, 'waitlist', null)");
    t.ok(domAt > 0 && testAt > domAt && issueAt > testAt, "8b a join from a test address is stored as a test row before anything else, and gets no number (a rejoin too)");
    t.ok(!/insert into public\.waitlist_founding_ledger/.test(ins) && /insert into public\.waitlist_founding_ledger \(position, email_key, source, user_id\)/.test(issue),
      "8b2 the waitlist trigger issues through the one rule; only founding_issue_for_key writes the ledger");
    // Void numbers never reissue: the next number is past the highest ever issued, and a voided household rejoining gets nothing back.
    t.ok(/select coalesce\(max\(position\), 0\) \+ 1 into next_position from public\.waitlist_founding_ledger;/.test(issue),
      "8c a new number is always past the highest ever issued, so a void number is never issued again");
    t.ok(/if prior_void is not null then\s+return null;/.test(issue), "8d a household whose number was voided does not get it back, by rejoining or by an account");
    // 50 real holders, not the highest number.
    t.ok(/select count\(\*\) into holders from public\.waitlist_founding_ledger where void_at is null;\s+if holders >= 50 then\s+return null;/.test(issue),
      "8e numbers stop when 50 REAL households hold one: the 51st real household gets none, from either side");
    const lockAt = issue.indexOf("pg_advisory_xact_lock(hashtext('public.waitlist.founding_position'))");
    t.ok(lockAt > 0 && lockAt < issue.indexOf("into holders") && /pg_advisory_xact_lock\(hashtext\('public\.waitlist\.founding_position'\)\)/.test(upd)
      && ins.indexOf("pg_advisory_xact_lock") > testAt, "8f the count and the pick run under 0014's lock, and so does voiding, so simultaneous arrivals cannot pass 50");
    t.ok(/if public\.founding_is_beta_founder_key\(p_key\) then\s+return null;/.test(issue), "8f2 a beta founder's address never takes a number: beta founders are outside the 50");
    t.ok(/if new\.is_test and not old\.is_test then/.test(upd) && /set void_at = now\(\), void_reason = 'test'\s+where void_at is null\s+and \(position = old\.founding_position or email_key = public\.waitlist_email_key\(new\.email\)\);/.test(upd)
      && /new\.founding_position := null;/.test(upd), "8g marking a row as a test row voids its number, and any number its address holds, and clears the row");
    t.ok(/before update of is_test on public\.waitlist/.test(sql), "8h …whenever is_test is set, not only by this migration");
    t.ok(/check \(position >= 1\)/.test(sql) && /check \(founding_position is null or founding_position >= 1\)/.test(sql), "8i numbers may run past 50 (the cap is the count of real holders)");
    // The data change: the two domains, test rows still holding a number, beta founders. Nothing deleted, no address named.
    const updates = sql.match(/update public\.waitlist\s[\s\S]*?;/g) || [];
    t.eq(updates.length, 3, "8j three data changes in the waitlist");
    t.ok(/set is_test = true\s+where public\.waitlist_is_test_email\(email\) and not is_test;/.test(updates[0] || "")
      && /set founding_position = null where is_test and founding_position is not null;/.test(updates[1] || "")
      && /set founding_position = null\s+where w\.founding_position is not null and public\.founding_is_beta_founder_key/.test(updates[2] || ""),
      "8k …every row at a test domain becomes a test row; test rows and beta founders' rows give up their numbers");
    t.ok(/insert into public\.founding_0025_cleared \(waitlist_id, founding_position, reason\)\s+select w\.id, w\.founding_position, 'test'/.test(sql)
      && /insert into public\.founding_0025_cleared \(waitlist_id, founding_position, reason\)\s+select w\.id, w\.founding_position, 'beta_founder'/.test(sql),
      "8k2 …and each cleared position is kept first, for the rollback");
    t.ok(!/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column)\b/i.test(sql), "8l nothing is deleted: void numbers stay in the ledger");
    t.ok(!/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw), "8m no email address is written in the migration");
    // One list of test domains, in SQL and in JS.
    const C = require(path.join(REPO, "netlify", "functions", "_lib", "foundingCohort.js"));
    const sqlDomains = (/\(getgrowsmart\\\.com\|flourishmoney\\\.app\)/.exec(sql) || [""])[0];
    t.ok(sqlDomains && C.TEST_EMAIL_DOMAINS.join() === "getgrowsmart.com,flourishmoney.app", "8n the database and the functions hold the same two test domains");
    const fullPattern = raw.split(`'@([a-z0-9-]+\\.)*(getgrowsmart\\.com|flourishmoney\\.app)$'`).length - 1;
    const anyPattern = (raw.match(/\(getgrowsmart\\\.com\|flourishmoney\\\.app\)\$'/g) || []).length;
    t.ok(fullPattern >= 3 && fullPattern === anyPattern, `8o the function and the dry run use the very same pattern, subdomains included, every time (${fullPattern})`);
    for (const f of ["waitlist_is_test_email(text)", "waitlist_assign_founding_position()", "waitlist_void_founding_on_test()", "founding_issue_for_account(uuid, text)",
      "waitlist_founding_number_for_email(text)", "waitlist_founding_position_for_email(text)"]) {
      const e = f.replace(/[()]/g, "\\$&");
      t.ok(new RegExp(`revoke all on function public\\.${e} from public, anon, authenticated;`).test(sql) && new RegExp(`grant execute on function public\\.${e} to service_role;`).test(sql), `8p explicit grants: ${f}, service role only`);
    }
    for (const f of ["founding_is_beta_founder_key(text)", "founding_issue_for_key(text, text, uuid)", "founding_on_account_confirmed()", "founding_accounts_start()"]) {
      const e = f.replace(/[()]/g, "\\$&");
      t.ok(new RegExp(`revoke all on function public\\.${e} from public, anon, authenticated;`).test(sql) && !new RegExp(`grant execute on function public\\.${e}`).test(sql), `8p2 ${f}: nobody calls it directly`);
    }
    // Spots left = 50 - founding seats held (2026-10-29; the ledger is no longer counted).
    const ok = await callEndpoint({ supabase: { seats: 24 } });
    t.eq(JSON.stringify(ok.body), '{"spotsLeft":26,"openSignup":false}', "8q 24 seats held: 26 spots left (with main's openSignup flag)");
    t.ok(/rpc\/founding_seats_taken$/.test(ok.calls[0].url) && ok.calls.length === 1, "8r …counted once, from the seats");
    // Before 0032 runs there is no count to read: 503, and the landing shows no number. 0032 runs before the deploy.
    const pre = await callEndpoint({ supabase: { status: 404 } });
    t.eq([pre.res.statusCode, pre.calls.length], [503, 1], "8s before 0032: no number, never a guess and never the ledger's count");
    // Step 11b (2026-10-14): the twelve numbers Amanda confirmed were her test sign-ups, rows deleted by her.
    const PROD_TEST_NUMBERS = "16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28";
    const listed = (sql.match(/update public\.waitlist_founding_ledger l set void_at = now\(\), void_reason = 'test'\s+where l\.position in [\s\S]*?;/g) || []);
    t.eq(listed.length, 1, "8t one ledger update voids by number: the confirmed test numbers");
    const s9 = listed[0] || "";
    t.ok(s9.includes(`where l.position in (${PROD_TEST_NUMBERS})`), "8u …exactly 16 to 21 and 23 to 28, by number (22 is a real household)");
    t.ok(/and not exists \(select 1 from public\.waitlist w where w\.founding_position = l\.position\)/.test(s9)
      && /and not exists \(select 1 from public\.waitlist w where not w\.is_test and public\.waitlist_email_key\(w\.email\) = l\.email_key\)/.test(s9)
      && /and l\.user_id is null/.test(s9) && /and l\.issued_at < timestamptz '2026-10-14 00:00:00\+00'/.test(s9),
      "8v …only a number issued before 2026-10-14 that no waitlist row holds, no household's row has the address of and no account is recorded against");
    t.ok(/and l\.void_at is null/.test(s9), "8w …and only numbers not already void, so a second run changes nothing");
    t.ok(raw.includes("Amanda confirmed 2026-10-14: these twelve numbers went to her own test sign-ups"), "8x …commented as Amanda confirmed it");
    const dry = raw.slice(raw.indexOf("READ-ONLY DRY RUN"), raw.indexOf("READ-ONLY CHECK AFTERWARDS"));
    const after = raw.slice(raw.indexOf("READ-ONLY CHECK AFTERWARDS"), raw.indexOf("A TEST ACCOUNT FOUND LATER"));
    t.ok(["issued_now", "spots_left_now", "void_test_rows", "void_confirmed_orphans", "void_beta_founders", "issued_since_oct_14", "real_holders_after_voids", "accounts_to_number", "accounts_numbered", "spots_left_after"]
      .every((c) => dry.includes(` as ${c}`)) && dry.includes(`(${PROD_TEST_NUMBERS})`),
      "8y the dry run shows what it will void and why, how many were issued since Oct 14, the accounts it will number, and spots_left_after");
    t.ok(["issued", "real_holders", "spots_left", "void_test", "void_beta_founders", "from_accounts", "next_number", "accounts_take_seats"].every((c) => after.includes(` as ${c}`)), "8z …and the check afterwards");
    t.ok(/spots_left must equal the dry run's spots_left_after/.test(after), "8z2 the check says its spots_left must equal the dry run's spots_left_after (tests/foundingLedger.sql.test.cjs proves it does)");
    const dryOut = dry.slice(dry.indexOf("--   select (select count(*) from ledger)"));
    const afterOut = after.slice(after.indexOf("--   select count(*)"), after.indexOf("from public.waitlist_founding_ledger;"));
    t.ok(dryOut.length > 50 && afterOut.length > 50 && !/email/i.test(dryOut.replace(/email_key|email_confirmation|email_confirmed_at|u\.email/g, "")) && !/email/i.test(afterOut),
      "8z3 neither query returns an address: their output columns are numbers and true/false");
  }

  t.summary("foundingOffer.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
