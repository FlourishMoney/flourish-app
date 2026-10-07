// tests/foundingOffer.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING OFFER ON THE LANDING PAGE (Amanda's decision, 2026-10-06).
//
//   1. The counter never shows a number it did not read. The endpoint answers a count it read or a
//      503, never a default; the page shows the endpoint's whole number 0 to 50 or no line at all.
//   2. Positions are unique and stop at 50, assigned inside the insert under one lock (migration 0014).
//   3. Test rows never count: not in the spots-left count, not in the trigger, not in the backfill.
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
const PRICE_LINE = "$79.99 a year plus tax, for as long as you stay subscribed. Paid and used on flourishmoney.app. Not yet available in the iPhone and Android apps.";
const REGULAR_LINE = "Regular price: $99.99 a year or $11.99 a month, plus tax.";
const JOIN_LINE = "Join the waitlist. The first 50 households on the waitlist get the founding price. Payments open October 26. Joining is free.";
const FULL_LINE = "Founding spots are full. Join the waitlist for launch news.";
const EMAIL_LINE = (n) => `You're founding household #${n} of 50. We'll email your link to the founding price when payments open on October 26.`;

// Run the real endpoint against a stubbed Supabase. `supabase` decides the answer to the count read.
async function callEndpoint({ supabase = { range: "0-36/37" }, env = true, method = "GET", now = 1e12, mod } = {}) {
  const calls = [], logs = [];
  const realFetch = global.fetch, realError = console.error;
  const prev = [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
  if (env) { process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY = "test-service-role"; }
  else { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; }
  global.fetch = async (url, o = {}) => {
    calls.push({ url: String(url), method: o.method || "GET", headers: o.headers || {} });
    if (supabase.throws) throw Object.assign(new Error("boom"), { name: supabase.throws });
    return {
      ok: !supabase.status || supabase.status < 300, status: supabase.status || 200,
      headers: { get: (h) => (h.toLowerCase() === "content-range" ? (supabase.range === undefined ? null : supabase.range) : null) },
      json: async () => { throw new Error("the endpoint must not read a body"); },
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
    // The endpoint: a count it read, or nothing.
    const ok = await callEndpoint();
    t.eq([ok.res.statusCode, JSON.stringify(ok.body)], [200, '{"spotsLeft":13}'], "1a 37 eligible rows read: 13 spots left, and the body is that one number");
    t.ok(/max-age=60/.test(ok.res.headers["Cache-Control"]) && /max-age=60/.test(ok.res.headers["Netlify-CDN-Cache-Control"]), "1b a good answer is cached for 60 s");
    t.eq(ok.calls.length, 1, "1c one read of Supabase");
    t.ok(ok.calls[0].method === "HEAD" && ok.calls[0].headers.Prefer === "count=exact", "1d …a HEAD with count=exact, so no row comes back at all");
    t.ok(/\/rest\/v1\/waitlist_founding_ledger\?select=position$/.test(ok.calls[0].url), "1e …of the founding numbers issued (the ledger, which is never freed)");
    t.eq(JSON.stringify((await callEndpoint({ supabase: { range: "*/64" } })).body), '{"spotsLeft":0}', "1f 64 eligible rows: 0 left, never below 0");
    const empty = await callEndpoint({ supabase: { range: "*/0" } });
    t.ok(empty.res.statusCode === 503 && JSON.stringify(empty.body) === '{"error":"unavailable"}' && empty.res.headers["Cache-Control"] === "no-store",
      "1g an empty ledger (start() has not run yet) is unavailable, never \"50 left\"");
    t.eq(JSON.stringify((await callEndpoint({ supabase: { range: "*/1" } })).body), '{"spotsLeft":49}', "1g2 one number issued: 49 left");
    const fails = {
      "no Supabase env": { env: false },
      "Supabase 400 (migration 0014 not applied: no is_test column)": { supabase: { status: 400 } },
      "Supabase 500": { supabase: { status: 500 } },
      "no Content-Range header": { supabase: { range: undefined } },
      "a Content-Range with no total": { supabase: { range: "0-0/*" } },
      "a timeout": { supabase: { throws: "AbortError" } },
      "a network failure": { supabase: { throws: "TypeError" } },
    };
    for (const [why, opts] of Object.entries(fails)) {
      const r = await callEndpoint(opts);
      t.ok(r.res.statusCode === 503 && JSON.stringify(r.body) === '{"error":"unavailable"}' && r.res.headers["Cache-Control"] === "no-store",
        `1h ${why}: 503 unavailable, no number, not cached`);
    }
    t.eq((await callEndpoint({ method: "POST" })).res.statusCode, 405, "1i only GET (and HEAD) are answered");

    // The cache: 60 s, and a failure never replaces a good answer with an invented one.
    const mod = fresh(FN);
    const a = await callEndpoint({ mod, now: 1e12, supabase: { range: "*/10" } });
    const b = await callEndpoint({ mod, now: 1e12 + 59_000, supabase: { range: "*/11" } });
    const c = await callEndpoint({ mod, now: 1e12 + 60_000, supabase: { status: 500 } });
    const d = await callEndpoint({ mod, now: 1e12 + 61_000, supabase: { range: "*/12" } });
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
      const digits = textOf(html).replace(/\$\d+\.\d{2}/g, "").replace(/first 50 households|October 26/g, "");
      t.ok(!/\d/.test(digits), "1p …and no other number appears in the block");
    }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer("), app.indexOf("function AuthScreen("));
    t.ok(/sharedFoundingSpots\(\)\.then\(n => \{ if \(live\) setSpotsLeft\(n\); \}\)/.test(comp) && /useState\(null\)/.test(comp) && /\{liveLine && <p/.test(comp),
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
    t.ok(insertBody.length > 50 && !/founding|is_test|created_at/.test(insertBody), "2m the signup insert sends no position, no is_test and no created_at");
    t.ok(/sendWelcomeEmail\(emailAddr, insertedRow && insertedRow\.id, insertedRow && insertedRow\.founding_position\)/.test(beta), "2n the welcome email gets the position the database returned for that row");
  }

  // ── 3. Test rows never count ──────────────────────────────────────────────────────────────────
  {
    const sql = stripSql(fs.readFileSync(MIG, "utf8"));
    const trig = sql.slice(sql.indexOf("function public.waitlist_assign_founding_position()"), sql.indexOf("$$;", sql.indexOf("function public.waitlist_assign_founding_position()")));
    t.ok(/new\.founding_position := null;\s+if new\.is_test then\s+return new;/.test(trig), "3a a test row never gets a number");
    t.ok(trig.indexOf("if new.is_test then") < trig.indexOf("insert into public.waitlist_founding_ledger"), "3b …and never enters the ledger, so it never uses up one of the 50");
    t.ok(/from public\.waitlist w\s+where not w\.is_test/.test(sql.slice(sql.indexOf("function public.waitlist_founding_start()"))), "3c …and the backfill leaves test rows out");
    const ep = fs.readFileSync(FN, "utf8");
    t.ok(/waitlist_founding_ledger\?select=position/.test(ep), "3d …and so does the spots-left count, which counts only numbers issued");
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
    t.eq([1, 7, 50].map(W.foundingWelcomeLine), [EMAIL_LINE(1), EMAIL_LINE(7), EMAIL_LINE(50)], "4c the welcome email's founding line, word for word");
    t.eq([0, 51, null, undefined, "7", 7.5].map(W.foundingWelcomeLine), [null, null, null, null, null, null], "4d …and no line for a row without a position from 1 to 50");
    let A = {};
    try { A = loadApp(["AuthScreen"]); } catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }
    if (A.AuthScreen) {
      const html = A.render(A.h(A.AuthScreen, { onAuth: () => {}, onTryDemo: () => {} }));
      const formAt = html.indexOf('class="fll-hero-form"'), consentAt = html.indexOf('id="fll-consent-hero"'), offerAt = html.indexOf('class="fll-founding"'), demoAt = html.indexOf('class="fll-hero-demo"');
      t.ok(formAt > 0 && consentAt > formAt && offerAt > consentAt && demoAt > offerAt, "4e the block comes right after the hero form and its consent line, before the demo column");
      const app4 = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
      t.ok(/grid-template-areas:"text" "form" "card" "founding" "demo"/.test(app4),
        "4e2 one column (phones): the block sits BELOW the $1,944 card, so the card's top stays in the first screen");
      const desk4 = app4.slice(app4.indexOf("@media(min-width:960px){"), app4.indexOf("@media(min-width:960px){") + 2500);
      t.ok(/grid-template-areas:"text card" "form card" "founding card" "demo card"/.test(desk4) && /\.fll-founding\{ justify-self:start; margin-top:-\$\{SPACE\.xl - SPACE\.lg\}px; \}/.test(desk4),
        "4e3 desktop: directly under the form, the same distance below the consent line as before");
      const block = textOf(html.slice(offerAt, demoAt));
      t.ok(block.includes(HEADING) && block.includes(PRICE_LINE) && block.includes(REGULAR_LINE) && block.includes(JOIN_LINE), "4f the rendered block reads the approved words");
      t.ok(block.indexOf(HEADING) < block.indexOf(PRICE_LINE) && block.indexOf(PRICE_LINE) < block.indexOf(REGULAR_LINE) && block.indexOf(REGULAR_LINE) < block.indexOf(JOIN_LINE),
        "4f2 …in the approved order: heading, founding price, regular price, how to get it");
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

  // ── 6. The block does not push the desktop hero card down ─────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer()"), app.indexOf("function AuthScreen("));
    t.ok(/grid\.style\.setProperty\("--fll-founding-h"/.test(comp) && /closest\("\.fll-hero-grid"\)/.test(comp),
      "6a the block gives the hero grid its own height as --fll-founding-h");
    t.ok(/el\.offsetHeight \+ \(parseFloat\(getComputedStyle\(el\)\.marginTop\)/.test(comp),
      "6b …measured with its top margin, the whole space it adds to the left column");
    t.ok(/new ResizeObserver\(measure\)/.test(comp) && /removeProperty\("--fll-founding-h"\)/.test(comp),
      "6c …re-measured when the live line appears, and removed when the block goes");
    const desk = app.slice(app.indexOf("@media(min-width:960px){"), app.indexOf("@media(min-width:960px){") + 2000);
    t.ok(/\.fll-hero-card\{[^}]*align-self:center;[^}]*margin-bottom:var\(--fll-founding-h, 0px\);/.test(desk),
      "6d the desktop card reserves that space below itself, so it centres where it would without the block");
  }

  // ── 7. Under 960px the block does not repeat the card's price or count (2026-10-07) ──────────
  {
    const c = O.foundingOfferCopy();
    t.eq([c.phoneHeading, c.phoneJoin], ["How founding spots work",
      "The first 50 households on the waitlist get the founding price. Payments open October 26. Joining is free."], "7a the phone heading and sentence, word for word");
    t.eq([c.heading, c.price, c.regular, c.join], [HEADING, PRICE_LINE, REGULAR_LINE, JOIN_LINE], "7b the desktop wording is unchanged");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const comp = app.slice(app.indexOf("function FoundingOffer()"), app.indexOf("function FoundingCard()"));
    t.ok(/<span className="fll-fo-desk">\{copy\.heading\}<\/span><span className="fll-fo-phone">\{copy\.phoneHeading\}<\/span>/.test(comp),
      "7c one heading, its desktop and phone words switched by CSS");
    t.ok(/<p className="fll-founding-p fll-fo-desk">\{copy\.price\}<\/p>\s+<p className="fll-founding-p fll-fo-phone">\{copy\.phoneJoin\}<\/p>\s+<p className="fll-founding-p">\{copy\.regular\}<\/p>\s+<p className="fll-founding-p fll-fo-desk">\{copy\.join\}<\/p>/.test(comp),
      "7d phones: how the spots work, then the regular price; desktop: price, regular, join, as before");
    t.ok(/className=\{`fll-founding-live\$\{spotsLeft > 0 \? " fll-fo-desk" : ""\}`\}/.test(comp),
      "7e the \"X of 50 founding spots left\" line is desktop only; \"spots are full\" shows at every width");
    const desk = app.slice(app.indexOf("@media(min-width:960px){"), app.indexOf("@media(min-width:960px){") + 3000);
    t.ok(/@media\(max-width:959px\)\{ \.fll-fo-desk\{ display:none; \} \}/.test(app) && /\.fll-fo-phone\{ display:none; \}/.test(desk),
      "7f under 960px the desktop words are hidden; from 960px the phone words are");
  }

  t.summary("foundingOffer.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
