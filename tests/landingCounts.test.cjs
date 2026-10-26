// tests/landingCounts.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING'S OWN COUNTS (the trial-first landing, approved Oct 22), and its link-preview tags kept out of
// the store apps.
//
//   1  the server's helper: four events, a device kind from the browser's own description, and a body that
//      holds only the event, a known src (or "direct") and the device: no email, no IP, no user agent;
//   2  beta.js: the page may send only landing_view and main_tap; account_created and founding_join are counted
//      by the server where they happen; the account carries the visit's src;
//   3  the page: one landing_view per browser session, main_tap on the main button, the src with the signup;
//   4  migration 0027: counts only, service role only, and the report's count-only lines;
//   5  a native build drops the landing's link-preview tags (they name the website), and the check refuses one
//      that kept them.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const L = require("../netlify/functions/_lib/landingCounts");
  const C = require("../netlify/functions/_lib/waitlistConsent");

  // ── 1. the server's helper ─────────────────────────────────────────────────────────────────────
  t.eq([...L.COUNT_EVENTS], ["landing_view", "main_tap", "account_created", "founding_join"], "1a the four counts");
  t.eq([...L.CLIENT_COUNT_EVENTS], ["landing_view", "main_tap"], "1b …of which the page may send two");
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const TAB = "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  t.eq([IPHONE, PIXEL, IPAD, TAB, MAC, "", undefined].map(L.deviceFrom), ["phone", "phone", "tablet", "tablet", "desktop", "desktop", "desktop"],
    "1c the device kind: phone, tablet or desktop, and nothing else");

  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const event = { headers: { "User-Agent": IPHONE, "x-nf-client-connection-ip": "203.0.113.9" } };
  const ok = await L.bumpLandingCount({ supabaseUrl: "https://sb.test", secretKey: "sk-test", event, name: "main_tap", src: "IG", fetchImpl });
  const body = JSON.parse(calls[0].init.body);
  t.ok(ok === true && calls[0].url === "https://sb.test/rest/v1/rpc/bump_landing_count", "1d one call, to bump_landing_count");
  t.eq(body, { p_event: "main_tap", p_src: "ig", p_device: "phone" }, "1e the body: the event, the known src and the device, nothing else");
  t.ok(!/203\.0\.113\.9|iPhone|Mozilla|@/.test(calls[0].init.body), "1f …no IP, no user agent, no email");
  calls.length = 0;
  await L.bumpLandingCount({ supabaseUrl: "https://sb.test", secretKey: "sk-test", event, name: "landing_view", src: "<script>", fetchImpl });
  t.eq(JSON.parse(calls[0].init.body).p_src, "direct", "1g an unknown src is counted as direct, never stored as sent");
  calls.length = 0;
  t.eq(await L.bumpLandingCount({ supabaseUrl: "https://sb.test", secretKey: "sk-test", event, name: "anything", src: "", fetchImpl }), false, "1h an event not on the list is not sent");
  t.eq(calls.length, 0, "1h2 …nothing was called");
  const down = await L.bumpLandingCount({ supabaseUrl: "https://sb.test", secretKey: "sk-test", event, name: "main_tap", src: "", fetchImpl: async () => { throw new Error("down"); } });
  const missing = await L.bumpLandingCount({ supabaseUrl: "https://sb.test", secretKey: "sk-test", event, name: "main_tap", src: "", fetchImpl: async () => ({ ok: false, status: 404 }) });
  t.eq([down, missing], [false, false], "1i a database that is down, or 0027 not yet run: the count is dropped, never thrown");

  // ── 2. beta.js ───────────────────────────────────────────────────────────────────────────────
  const beta = read("netlify", "functions", "beta.js");
  t.ok(/if \(action === "landing_count"\) \{\s*if \(CLIENT_COUNT_EVENTS\.includes\(body\.event\)\) \{\s*await bumpLandingCount\(\{ supabaseUrl, secretKey, event, name: body\.event, src: body\.src \}\);\s*\}\s*return \{ statusCode: 200, headers: CORS, body: JSON\.stringify\(\{ ok: true \}\) \};/.test(beta),
    "2a the page's count: only landing_view or main_tap, and the same answer either way");
  t.ok(/console\.log\(`\[beta:signup\] signup_completed source=\$\{gate\.source\}`\);\s*\/\/[^\n]*\n\s*await bumpLandingCount\(\{ supabaseUrl, secretKey, event, name: "account_created", src: body\.src \}\);/.test(beta),
    "2b account_created, counted once the account exists");
  t.ok(/if \(foundingForm\) await bumpLandingCount\(\{ supabaseUrl, secretKey, event, name: "founding_join", src \}\);/.test(beta)
    && beta.indexOf('name: "founding_join"') > beta.indexOf("if (foundingForm && insertedRow && !isFoundingPosition("),
    "2c founding_join, counted for a new founding list row (after the spots-just-filled answer, so a row with no number is not counted)");
  t.ok(/signup_src: waitlistSourceFor\(body\.src\)/.test(beta), "2d the account carries the visit's src (a known one or \"direct\")");
  t.eq(C.waitlistSourceFor("Press"), "press", "2e …through the same src rule the waitlist uses");

  // ── 3. the page ──────────────────────────────────────────────────────────────────────────────
  const P = await import("../src/lib/landingCounts.js");
  const sent = [];
  const pageFetch = (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({ ok: true }); };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) };
  P.countLandingViewOnce({ fetchImpl: pageFetch }, storage);
  P.countLandingViewOnce({ fetchImpl: pageFetch }, storage);
  t.eq(sent.map(s => s.body.event), ["landing_view"], "3a one landing_view per browser session");
  P.countLanding("main_tap", { fetchImpl: pageFetch });
  P.countLanding("account_created", { fetchImpl: pageFetch });
  t.eq(sent.map(s => [s.url, s.body.action, s.body.event]), [["/api/beta", "landing_count", "landing_view"], ["/api/beta", "landing_count", "main_tap"]],
    "3b main_tap is sent; the server's own counts cannot be sent by the page");
  t.eq(Object.keys(sent[1].body).sort(), ["action", "event", "src"], "3c the page sends the event and the src, nothing else");
  const app = read("src", "App.jsx");
  t.ok(/useEffect\(\(\) => \{ if \(!isNativeApp\(\)\) countLandingViewOnce\(\{ base: API_BASE \}\); \}, \[\]\);/.test(app), "3d the landing counts its view, on the web only");
  t.ok(/body: JSON\.stringify\(\{ action: "signup", email, password, code: betaCode, src: currentWaitlistSrc\(\) \}\)/.test(app), "3e the signup carries the visit's src");
  t.ok(!/googletagmanager|google-analytics|gtag\(|fbq\(|plausible\.io|clarity\.ms|hotjar|segment\.com|mixpanel/i.test(app + read("index.html")), "3f no third-party tracker in the app or the page");
  // 2026-10-26: cookieless website analytics (Plausible) on the public pages only, and only through one module
  // (tests/webAnalytics*). No other file in src names it, and nothing else is added.
  const libs = fs.readdirSync(path.join(REPO, "src", "lib")).filter((f) => f.endsWith(".js"));
  t.eq(libs.filter((f) => /plausible\.io/.test(read("src", "lib", f))), ["webAnalytics.js"], "3f2 plausible.io is named only in src/lib/webAnalytics.js");
  t.ok(libs.every((f) => !/googletagmanager|google-analytics|gtag\(|fbq\(|clarity\.ms|hotjar|segment\.com|mixpanel/i.test(read("src", "lib", f))), "3f3 …and no other tracker anywhere in src/lib");

  // ── 4. migration 0027 ────────────────────────────────────────────────────────────────────────
  const m = read("supabase", "migrations", "0027_landing_counts.sql");
  const cols = ((m.match(/create table if not exists public\.landing_counts \(([\s\S]*?)\n\);/) || [])[1] || "").split("\n").map(l => (l.trim().match(/^([a-z_]+)\s/) || [])[1]).filter(c => c && c !== "primary");
  t.eq(cols, ["day", "src", "device", "event", "n", "updated_at"], "4a the table holds a day, a src, a device, an event and a count: no email, IP, user agent or account");
  t.ok(m.includes(`check (src in ('${["direct", ...C.WAITLIST_SRCS].join("','")}'))`), "4b its srcs are the waitlist's, plus direct (one list)");
  t.ok(/alter table public\.landing_counts enable row level security;/.test(m) && /revoke all on table public\.landing_counts from anon, authenticated;/.test(m)
    && /grant execute on function public\.bump_landing_count\(text, text, text\) to service_role;/.test(m) && /revoke all on function public\.bump_landing_count\(text, text, text\) from anon;/.test(m),
    "4c service role only: no browser reads or writes a count");
  t.ok(/create or replace function public\.landing_source_counts\(p_from date, p_to date\)\s*returns table \(day date, source text, device text, event text, count integer\)/.test(m)
    && /grant execute on function public\.landing_source_counts\(date, date\) to service_role;/.test(m), "4d the source report's count-only lines, beside 0018's");
  const launch = read("docs", "ops", "LAUNCH-DAY.md");
  t.ok(/landing_source_counts/.test(launch), "4e the runbook says how to read them");

  // ── 5. the store apps ────────────────────────────────────────────────────────────────────────
  const S = await import("../scripts/strip-landing-media.mjs");
  const html = read("index.html");
  t.ok(/<!-- LANDING-META[\s\S]*og:image[\s\S]*<!-- \/LANDING-META -->/.test(html), "5a the link-preview tags sit between the LANDING-META markers");
  const stripped = S.stripLandingMeta(html);
  t.ok(!/flourishmoney\.app|og:image|og:description|twitter:card|name="description"|LANDING-META/.test(stripped) && /<title>/.test(stripped) && /<div id="root">/.test(stripped),
    "5b a native build's index.html keeps the page and loses every tag that names the website");
  const check = read("scripts", "check-native-build.mjs");
  t.ok(/includes\("LANDING-META"\)/.test(check), "5c the native artifact check refuses an index.html that kept them");

  t.summary("landingCounts.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
