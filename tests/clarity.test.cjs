// tests/clarity.test.cjs
// -----------------------------------------------------------------------------
// MICROSOFT CLARITY ON THE WEBSITE'S PUBLIC PAGES ONLY (Amanda, 2026-11-06). Each section fails if Clarity shows up where
// it must not:
//   1  the edge (netlify/edge-functions/clarity-gate.js): never Quebec, an EEA country, the UK or Switzerland, a place it
//      cannot name, or before CLARITY_ENABLED; it logs nothing, keeps nothing and sends no geo value back
//   2  the app's pages (src/lib/webClarity.js): never a signed-in screen, the sign-in form, /support, a reset link, a
//      store app, or an address with a query string or hash; only at the addresses /, /demo, /privacy and /terms, never
//      /app, /signup, /login or an unknown address that shows the landing; only after the page is interactive and the
//      edge says yes; stopped for the rest of the visit as soon as anything else shows
//   3  the static pages (public/clarity/loader.js): /get and the guide addresses, under the same rules, and nowhere else
//   4  a store build: compiled out, stripped, and refused by the artifact check (the real store build: nativeLandingMedia 2f)
//   5  the CSP, the wiring, and the privacy policy's bullet (website only, from the policy's new date)
// (The built site in a real browser: tests/clarity.browser.)
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const TAG = "https://www.clarity.ms/tag/z9lh2hoxvh";
// The two approved lines (ChatGPT and Grok, 2026-11-06; claude/CLARITY-WORDS-APPROVED-2026-11-06.md), word for word.
const POLICY_LINE = "Microsoft Clarity: on our public website pages only, we use Microsoft Clarity heatmaps and session recordings to understand how visitors use a page, such as where they tap and how far they scroll, so we can improve those pages. Clarity is not used in the flourish app, on sign-in or sign-up pages, at checkout, or on any page shown while you are signed in, and it does not load for visitors in Quebec, the European Economic Area, the United Kingdom or Switzerland. We use Clarity's Strict masking setting, which masks all text on the page, and we have turned off Clarity cookies, so Clarity does not use those cookies to link page views into multi-page sessions. Clarity receives interaction and technical information, including information used for IP-based location and information about the visitor's browser and device. Microsoft's privacy statement applies to Microsoft's handling of that information.";
const NOTICE_LINE = "• On our public website pages we now use Microsoft Clarity heatmaps and session recordings to understand taps, scrolling and other page interactions. Page content is masked, Clarity cookies are off, and Clarity doesn't load for visitors in Quebec, the European Economic Area, the United Kingdom or Switzerland. It isn't used in the flourish app, on sign-in or sign-up pages, at checkout, or on any signed-in page.";

function loadLib(native = false) {
  const esbuild = require(path.join(REPO, "node_modules", "esbuild"));
  const build = (entry) => {
    const { outputFiles } = esbuild.buildSync({
      entryPoints: [path.join(REPO, "src", "lib", entry)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "error",
      define: { "import.meta.env.VITE_NATIVE_BUILD": JSON.stringify(native ? "true" : "") }, minify: native,
    });
    const m = { exports: {} };
    new Function("module", "exports", "require", outputFiles[0].text)(m, m.exports, require);
    return { mod: m.exports, text: outputFiles[0].text };
  };
  return { C: build("webClarity.js"), A: build("webAnalytics.js").mod };
}

// A browser stand-in: the scripts the page adds, the edge asked, and what window.clarity is called with.
function fakeWindow({ path: p = "/", search = "", hash = "", native = false, ready = "complete", gate = { load: true }, gateFails = false } = {}) {
  const added = [], asked = [], listeners = {}, idles = [];
  const win = {
    location: { origin: "https://flourishmoney.app", pathname: p, search, hash },
    Capacitor: native ? { getPlatform: () => "ios" } : undefined,
    document: { readyState: ready, createElement: (tag) => ({ tag }), head: { appendChild: (el) => added.push(el) } },
    addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); },
    requestIdleCallback: (fn) => idles.push(fn),
    setTimeout: (fn) => idles.push(fn),
    fetch: async (url, opts) => {
      asked.push([url, opts]);
      if (gateFails) throw new Error("offline");
      return { ok: true, json: async () => gate };
    },
  };
  const settle = async () => { for (let i = 0; i < 6; i++) { while (idles.length) await idles.shift()(); await new Promise((r) => setImmediate(r)); } };
  const fire = async (n) => { for (const fn of listeners[n] || []) fn(); await settle(); };
  const calls = () => (win.clarity && win.clarity.q ? win.clarity.q.map((a) => [...a]) : []);
  return { win, added, asked, settle, fire, calls, idles };
}

(async () => {
  const t = create();
  const savedConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };

  // ── 1. The edge ─────────────────────────────────────────────────────────────────────────────────
  {
    const G = await import(path.join(REPO, "netlify", "edge-functions", "clarity-gate.js"));
    const A = (country, subdivision, enabled = true) => G.clarityAllowed({ enabled, country, subdivision });
    const EU27 = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
    const blocked = [...EU27, "IS", "LI", "NO", "GB", "CH"];
    t.eq(blocked.filter((c) => A(c, "")), [], "1a never for an EEA country (the 27 EU countries, Iceland, Liechtenstein, Norway), the UK or Switzerland");
    t.eq([A("fr", ""), A(" gb ", ""), A("GP", ""), A("RE", ""), A("AX", "")], [false, false, false, false, false], "1b …whatever the case or spacing, and the EU's outermost regions and Åland too");
    t.eq([A("CA", "QC"), A("CA", "qc"), A("CA", ""), A("CA", undefined)], [false, false, false, false], "1c never for Quebec, or a Canadian visitor whose province cannot be named");
    t.eq([A("CA", "ON"), A("CA", "BC"), A("CA", "NB"), A("US", "NY"), A("US", "")], [true, true, true, true, true], "1d elsewhere in Canada, and in the US, yes");
    t.eq([A("", ""), A(undefined, undefined), A("??", ""), A("CA", "ON", false), G.clarityAllowed()], [false, false, false, false, false], "1e a place it cannot name, or CLARITY_ENABLED off: no");

    const logged = [];
    for (const k of Object.keys(savedConsole)) console[k] = (...a) => logged.push(a);
    const call = async (flag, geo) => {
      globalThis.Netlify = { env: { get: (k) => (k === "CLARITY_ENABLED" ? flag : undefined) } };
      const r = await G.default(new Request("https://flourishmoney.app/api/clarity-gate", { headers: { "x-nf-client-connection-ip": "203.0.113.9" } }), { geo, ip: "203.0.113.9" });
      return { status: r.status, body: await r.text(), cache: r.headers.get("cache-control"), cookie: r.headers.get("set-cookie"), headers: [...r.headers.keys()].sort() };
    };
    const on = await call("true", { country: { code: "CA", name: "Canada" }, subdivision: { code: "ON", name: "Ontario" }, city: "Belleville" });
    const qc = await call("true", { country: { code: "CA" }, subdivision: { code: "QC" } });
    const de = await call("true", { country: { code: "DE" }, subdivision: { code: "BE" } });
    const gb = await call("true", { country: { code: "GB" } });
    const ch = await call("true", { country: { code: "CH" } });
    const none = await call("true", undefined);
    const off = await call(undefined, { country: { code: "CA" }, subdivision: { code: "ON" } });
    const loose = await call("TRUE", { country: { code: "US" } });
    for (const k of Object.keys(savedConsole)) console[k] = savedConsole[k];
    t.eq([on.body, qc.body, de.body, gb.body, ch.body, none.body, off.body, loose.body],
      ['{"load":true}', '{"load":false}', '{"load":false}', '{"load":false}', '{"load":false}', '{"load":false}', '{"load":false}', '{"load":false}'],
      "1f the handler: Ontario yes; Quebec, Germany, the UK, Switzerland, no geo, the flag unset or not exactly \"true\": no");
    t.ok([on, qc].every((r) => r.status === 200 && r.cache === "private, no-store" && r.cookie === null), "1g never cached (private, no-store), and no cookie");
    t.eq(on.headers, ["cache-control", "content-type", "x-robots-tag"], "1h it sends no geo value back: the body is the answer alone, and no other header");
    t.eq(logged, [], "1i nothing is logged: no IP address and no answer");
    const src = read("netlify", "edge-functions", "clarity-gate.js");
    t.ok(!/console\.|getStore|@netlify\/blobs|fetch\(|context\.ip|x-nf-client|cookies/.test(src.replace(/\/\/.*$/gm, "")), "1j its code holds no console call, store, fetch, IP read or cookie");
    t.eq(G.config, { path: "/api/clarity-gate" }, "1k it answers /api/clarity-gate");
    delete globalThis.Netlify;
  }

  // ── 2. The app's pages ──────────────────────────────────────────────────────────────────────────
  const { C: { mod: C }, A } = loadLib();
  {
    const P = (o, authForm = false) => C.clarityPage(A.analyticsPage({ authLoading: false, ...o }), { authForm });
    t.eq([P({}), P({ demo: true }), P({ screen: "privacy" }), P({ screen: "terms" })], ["/", "/demo", "/privacy", "/terms"], "2a signed out on the web: the landing, the demo, privacy and terms");
    t.eq([P({ signedIn: true }), P({ signedIn: true, screen: "privacy" }), P({ signedIn: true, screen: "terms" }), P({ signedIn: true, demo: true })], [null, null, null, null],
      "2b never a signed-in screen (Today, onboarding, checkout, and privacy or terms once signed in)");
    t.eq([P({}, true), P({ screen: "support" }), P({ screen: "confirmed" }), P({ screen: "delete-account" }), P({ recovery: true }), P({ native: true }), C.clarityPage(A.analyticsPage({ authLoading: true }))],
      [null, null, null, null, null, null, null], "2c never the sign-in or sign-up form, /support, /confirmed, /delete-account, a reset link, a store app, or before sign-in is known");

    // Loads once, after the page is interactive, when the edge says yes.
    C._resetClarity();
    let f = fakeWindow({ ready: "loading" });
    C.setClarityPage("/", f.win);
    await f.settle();
    t.eq([f.asked.length, f.added.length], [0, 0], "2d nothing before the page has loaded: not even the edge is asked");
    await f.fire("load");
    t.eq([f.asked.map(([u, o]) => [u, o.credentials, o.cache]), f.added.map((s) => [s.src, s.async])], [[["/api/clarity-gate", "omit", "no-store"]], [[TAG, true]]],
      "2e after the load event and an idle moment: the edge is asked (no cookies, no cache), then the tag, once, async");
    C.setClarityPage("/demo", f.win); C.setClarityPage("/privacy", f.win);
    await f.settle();
    t.eq([f.asked.length, f.added.length, C._clarityState()], [1, 1, "loaded"], "2f moving between public pages loads nothing more");

    // Signing in stops it, for good.
    C.setClarityPage(null, f.win);
    t.eq(f.calls().slice(-1), [["stop"]], "2g signing in (no public page showing): clarity(\"stop\")");
    C.setClarityPage("/", f.win);
    await f.settle();
    t.eq([f.added.length, f.asked.length, C._clarityState()], [1, 1, "stopped"], "2h …and it is not started again in that visit, even back on the landing");

    // The sign-in form stops it.
    C._resetClarity();
    f = fakeWindow();
    C.setClarityPage("/", f.win); await f.settle();
    C.setClarityAuthForm(true, f.win);
    t.eq([f.added.length, f.calls().slice(-1)], [1, [["stop"]]], "2i opening the sign-in or sign-up form stops it");
    C.setClarityAuthForm(false, f.win); await f.settle();
    t.eq([f.added.length, C._clarityState()], [1, "stopped"], "2j …for the rest of the visit");

    // Opening the form (or signing in) before it has loaded: never loaded.
    C._resetClarity();
    f = fakeWindow({ ready: "loading" });
    C.setClarityPage("/", f.win);
    C.setClarityAuthForm(true, f.win);
    await f.fire("load");
    t.eq([f.asked.length, f.added.length], [0, 0], "2k the form opened before the page was interactive: nothing is asked or loaded");

    // The edge says no, fails, or the address carries something.
    const cases = [
      [{ gate: { load: false } }, "the edge says no"],
      [{ gate: { load: "true" } }, "the edge's answer is not exactly true"],
      [{ gateFails: true }, "the edge cannot be reached"],
    ];
    for (const [o, why] of cases) {
      C._resetClarity(); f = fakeWindow(o);
      C.setClarityPage("/", f.win); await f.settle();
      t.eq([f.asked.length, f.added.length], [1, 0], `2l ${why}: no tag`);
    }
    for (const [o, why] of [[{ search: "?email=a%40b.c" }, "a query string"], [{ hash: "#access_token=x" }, "a hash"], [{ native: true }, "a store app (Capacitor)"]]) {
      C._resetClarity(); f = fakeWindow(o);
      C.setClarityPage("/", f.win); await f.settle();
      t.eq([f.asked.length, f.added.length], [0, 0], `2m ${why}: the edge is not even asked`);
    }

    // The address itself (Amanda, 2026-11-07): every unknown address serves the app, which shows the signed-out landing,
    // so the page showing is not enough. Only the four addresses of the app's public pages record.
    for (const p of ["/app", "/app/", "/signup", "/login", "/no-such-page", "/settings", "/support", "/confirmed", "/checkout", "/demo/x", "/privacy/x", "/index.html", "/Privacy", "//", ""]) {
      C._resetClarity(); f = fakeWindow({ path: p });
      C.setClarityPage("/", f.win); await f.settle();
      t.eq([f.asked.length, f.added.length], [0, 0], `2n the landing showing at ${JSON.stringify(p)}: the edge is not even asked, no tag`);
    }
    for (const p of ["/", "/demo", "/privacy", "/terms", "/demo/", "/privacy/", "/terms/"]) {
      C._resetClarity(); f = fakeWindow({ path: p });
      C.setClarityPage("/", f.win); await f.settle();
      t.eq([f.asked.length, f.added.length], [1, 1], `2o the address ${p}: the edge, then the tag`);
    }
    t.eq([C.clarityAddress("/"), C.clarityAddress("/privacy/"), C.clarityAddress("/app"), C.clarityAddress("/signup"), C.clarityAddress(undefined)], [true, true, false, false, false],
      "2p clarityAddress: the four addresses (one trailing slash allowed), nothing else");
    // Loaded at the landing, then the address changes to one that may not be recorded: stopped for good.
    C._resetClarity(); f = fakeWindow({ path: "/" });
    C.setClarityPage("/", f.win); await f.settle();
    f.win.location.pathname = "/app";
    C.setClarityPage("/", f.win); await f.settle();
    t.eq([f.added.length, f.calls().slice(-1), C._clarityState()], [1, [["stop"]], "stopped"], "2q the address becomes /app while the landing still shows: clarity(\"stop\"), for the rest of the visit");
    C._resetClarity();
  }

  // ── 3. The static pages ─────────────────────────────────────────────────────────────────────────
  {
    const loader = read("public", "clarity", "loader.js");
    const runLoader = async (o) => { const f = fakeWindow(o); f.win.window = f.win; vm.runInNewContext(loader, f.win); await f.settle(); return f; };
    for (const p of ["/get", "/get/", "/guides/", "/guides/what-is-safe-to-spend/"]) {
      const f = await runLoader({ path: p });
      t.eq([f.asked.map(([u]) => u), f.added.map((s) => s.src)], [["/api/clarity-gate"], [TAG]], `3a ${p}: after the page is interactive, the edge, then the tag`);
    }
    for (const p of ["/", "/app", "/signup", "/login", "/no-such-page", "/privacy", "/terms", "/support", "/newsletter/", "/checkout", "/confirmed", "/getting-started", "/get/x", "/guidesx", "/guides/x/y/", "/guides/X/"]) {
      const f = await runLoader({ path: p });
      t.eq([f.asked.length, f.added.length], [0, 0], `3b ${p}: the static loader does nothing (the app's pages decide for themselves)`);
    }
    const before = fakeWindow({ path: "/get", ready: "loading" }); before.win.window = before.win; vm.runInNewContext(loader, before.win); await before.settle();
    t.eq(before.asked.length, 0, "3c nothing before the load event");
    await before.fire("load");
    t.eq(before.added.length, 1, "3d …then the tag");
    for (const [o, why] of [[{ path: "/get", search: "?ref=founding" }, "a query string"], [{ path: "/guides/x/", hash: "#top" }, "a hash"], [{ path: "/get", native: true }, "a store app"]]) {
      const f = await runLoader(o);
      t.eq([f.asked.length, f.added.length], [0, 0], `3e ${why}: nothing asked, nothing loaded`);
    }
    for (const [o, why] of [[{ path: "/get", gate: { load: false } }, "the edge says no"], [{ path: "/get", gateFails: true }, "the edge cannot be reached"]]) {
      const f = await runLoader(o);
      t.eq(f.added.length, 0, `3f ${why}: no tag`);
    }
    t.ok(read("public", "get", "index.html").includes('<script src="/clarity/loader.js" defer></script>'), "3g /get carries the loader");
    t.ok(!read("public", "newsletter", "index.html").includes("clarity"), "3h the newsletter sign-up page does not (an email form, not one of the five)");
    const G = await import(path.join(REPO, "scripts", "build-guides.mjs"));
    t.ok(G.CLARITY_LOADER === '<script src="/clarity/loader.js" defer></script>' && read("scripts", "build-guides.mjs").includes("    CLARITY_LOADER,\n    \"</head>\","), "3i every guide page carries it, in its head");
    t.eq([(loader.match(/clarity\.ms\/tag\/z9lh2hoxvh/g) || []).length, (read("src", "lib", "webClarity.js").match(/clarity\.ms\/tag\/z9lh2hoxvh/g) || []).length], [1, 1], "3j the app and the static pages load the same project's tag");
  }

  // ── 4. A store build ───────────────────────────────────────────────────────────────────────────
  {
    const { C: { mod: N, text } } = loadLib(true);
    t.ok(!/clarity\.ms/.test(text) && N.CLARITY_TAG_SRC === "", "4a compiled with VITE_NATIVE_BUILD=true (as build:native does), the module holds no Clarity address");
    const f = fakeWindow();
    N._resetClarity(); N.setClarityPage("/", f.win); await f.settle();
    t.eq([f.asked.length, f.added.length], [0, 0], "4b …and loads nothing, whatever page it is told");
    const { LANDING_ONLY } = await import(path.join(REPO, "scripts", "strip-landing-media.mjs"));
    t.ok(LANDING_ONLY.includes("clarity"), "4c build:native strips dist/clarity (the static pages' loader)");
    // The artifact check, run for real on a store dist/ that would carry Clarity in a file outside the bundle.
    const dir = tempDir("clarity-native");
    const ENV = { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder-key" };
    fs.mkdirSync(path.join(dir, "dist", "assets"), { recursive: true });
    fs.mkdirSync(path.join(dir, "dist", "extra"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist", "index.html"), "<!doctype html><title>x</title>");
    fs.writeFileSync(path.join(dir, "dist", "assets", "a.js"), 'const u="https://placeholder.invalid",k="placeholder-key";');
    const check = () => spawnSync(process.execPath, [path.join(REPO, "scripts", "check-native-build.mjs"), "--artifact"], { cwd: dir, env: ENV, encoding: "utf8" });
    const clean = check();
    fs.writeFileSync(path.join(dir, "dist", "extra", "page.html"), `<script src="${TAG}"></script>`);
    const dirty = check();
    t.ok(clean.status === 0 && dirty.status !== 0 && /mentions clarity\.ms \(dist\/extra\/page\.html\)/.test(dirty.stderr + dirty.stdout),
      "4d check-native-build --artifact refuses a store dist/ with clarity.ms in any file, and names it (a clean one passes)");
  }

  // ── 5. The CSP, the wiring, the policy ─────────────────────────────────────────────────────────
  {
    const toml = read("netlify.toml");
    const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1] || "";
    const dir = (n) => (csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(n + " ")) || "");
    t.ok(/ https:\/\/www\.clarity\.ms https:\/\/scripts\.clarity\.ms(;| |$)/.test(dir("script-src") + ";") && / https:\/\/\*\.clarity\.ms /.test(dir("connect-src") + " "),
      "5a the CSP allows Clarity's tag and script, and its uploads");
    t.ok(!/clarity/.test(dir("img-src")) && !/clarity/.test(dir("frame-src")) && (csp.match(/clarity/g) || []).length === 3, "5b …and nothing more: no image (Microsoft's cookie sync), no frame");
    const app = read("src", "App.jsx");
    t.ok(app.includes("const _clarityPage = clarityPage(_analyticsPage);\n  useEffect(()=>{ setClarityPage(_clarityPage); },[_clarityPage]);"), "5c App: Clarity's page is the analytics page (signed out, web, a public screen), narrowed");
    t.ok(app.includes("useEffect(() => { setClarityAuthForm(showAuth); }, [showAuth]);"), "5d the landing tells it when the sign-in or sign-up form is open");
    t.ok(!/clarity\.ms/.test(app), "5e the app itself names no Clarity address (only lib/webClarity.js, compiled out of a store build)");

    const W = await import(path.join(REPO, "src", "lib", "privacyLaunchWords.js"));
    t.eq(W.MICROSOFT_PRIVACY_URL, "https://privacy.microsoft.com/privacystatement", "5f the link is Microsoft's privacy statement");
    t.eq(W.microsoftLinkParts("Read Microsoft's privacy statement for more."), ["Read ", "Microsoft's privacy statement", " for more."], "5g \"Microsoft's privacy statement\" becomes the link");
    t.ok(app.includes("{!native&&launched&&(()=>{ const [before,link,after]=microsoftLinkParts(PW.clarity);") && app.includes("<a href={MICROSOFT_PRIVACY_URL} target=\"_blank\" rel=\"noopener noreferrer\""),
      "5h the Clarity bullet shows on the website only, and only from the policy's new date (the same single update)");
    const analyticsAt = app.indexOf("<strong style={{color:C.cream}}>Website analytics</strong>");
    const clarityAt = app.indexOf("<strong style={{color:C.cream}}>Microsoft Clarity</strong>");
    const nextAt = app.indexOf("We do not share your data with advertisers", analyticsAt);
    t.ok(analyticsAt > 0 && clarityAt > analyticsAt && clarityAt < nextAt && !app.slice(analyticsAt + 8, clarityAt).includes("<strong"), "5i …directly after the analytics bullet, in section 6");
    t.ok(W.POLICY_WORDS.analytics.endsWith("We do not store an IP address, cookie or other identifier with those counts."), "5j the \"those counts\" sentence is as it was");
    const notice = require(path.join(REPO, "netlify", "functions", "_lib", "policyNotice.js"));
    const text = notice.noticeText("November 12, 2026");
    t.eq([(text.match(/^• /gm) || []).length, text.split("\n\n").filter((x) => x.startsWith("Hi,")).length], [7, 1], "5k the launch notice: one new bullet (seven), and still one email");
    t.eq("Microsoft Clarity: " + W.POLICY_WORDS.clarity, POLICY_LINE, "5l the policy's Clarity bullet: the approved line, word for word (its label in bold)");
    t.eq(W.microsoftLinkParts(W.POLICY_WORDS.clarity)[1], "Microsoft's privacy statement", "5m …with \"Microsoft's privacy statement\" as the link");
    const paras = text.split("\n\n");
    const linksAt = paras.findIndex((x) => x.startsWith("• Our own links can carry a short code"));
    t.eq([paras.filter((x) => x === NOTICE_LINE).length, paras[linksAt + 1]], [1, NOTICE_LINE], "5n the launch notice's Clarity bullet: the approved line, word for word, once, after the bullet about our own counts");
    const r = spawnSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), path.join(REPO, "src", "lib", "privacyLaunchWords.js"), path.join(REPO, "netlify", "functions")], { encoding: "utf8" });
    // netlify/functions now also holds the plan-name placeholders (_lib/planWords.js, 2026-11-10), refused on their own:
    // what this asks is that none of the check's findings is Clarity's.
    const found = [...(r.stderr || "").matchAll(/\[WORDS: ([a-z0-9-]+)\]\s+in (\S+)/g)].map((m) => [m[1], m[2]]);
    t.eq(found.filter(([id, f]) => !(id.startsWith("plan-server-") && f.endsWith("planWords.js"))), [], "5o no Clarity placeholder is left: the production build's words check finds none of Clarity's");
    const rc = spawnSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), path.join(REPO, "src", "lib", "privacyLaunchWords.js"), path.join(REPO, "netlify", "functions", "_lib", "policyNotice.js")], { encoding: "utf8" });
    t.eq(rc.status, 0, "5o2 …and the Clarity words and the launch notice pass it outright");
  }

  t.summary("clarity.test");
  setImmediate(() => process.exit(process.exitCode || 0));
})();
