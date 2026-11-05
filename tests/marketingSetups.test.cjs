// tests/marketingSetups.test.cjs
// -----------------------------------------------------------------------------
// THE ONE-TIME MARKETING SETUPS (2026-11-04).
//   1  guides: every tag a guide promises; a draft is noindex and listed nowhere; a guide can't publish without its checks
//   2  the two verification tags come from the environment, and the secrets scanner is told to leave them alone
//   3  src and cr: only plain words survive; the Play referrer; organic installs read as direct
//   4  the newsletter: consent, double opt-in, instant one-click unsubscribe, the sender in every email, never the waitlist
//   5  tester codes and the day 30 questions: the server decides, nothing is tied to a rating
//   6  the wiring in the app and at signup
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

// A stand-in for the Supabase client's query builder, over plain rows.
function fakeAdmin(tables = {}) {
  const calls = [];
  const admin = {
    calls,
    tables,
    from(table) {
      calls.push(table);
      tables[table] = tables[table] || [];
      const rows = tables[table];
      const q = { filters: [], op: "select", patch: null };
      const match = () => rows.filter((r) => q.filters.every((f) => f(r)));
      const run = () => {
        if (q.op === "update") { const m = match(); m.forEach((r) => Object.assign(r, q.patch)); return { data: m, error: null }; }
        if (q.op === "insert") { const row = { id: `00000000-0000-0000-0000-00000000000${rows.length + 1}`, ...q.patch }; rows.push(row); return { data: row, error: null }; }
        return { data: match(), error: null };
      };
      const b = {
        select: () => b, limit: () => b,
        eq: (k, v) => { q.filters.push((r) => r[k] === v); return b; },
        is: (k, v) => { q.filters.push((r) => (r[k] ?? null) === v); return b; },
        update: (patch) => { q.op = "update"; q.patch = patch; return b; },
        insert: (patch) => { q.op = "insert"; q.patch = patch; return b; },
        upsert: (list) => { list.forEach((r) => rows.push(r)); return Promise.resolve({ error: null }); },
        maybeSingle: () => { const m = run(); return Promise.resolve({ data: (Array.isArray(m.data) ? m.data[0] : m.data) || null, error: null }); },
        single: () => Promise.resolve(run()),
        then: (ok, no) => Promise.resolve(run()).then(ok, no),
      };
      return b;
    },
  };
  return admin;
}

(async () => {
  const t = create();
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "test-only-secret";
  const G = await import("../scripts/build-guides.mjs");

  // ── 1. Guides ──────────────────────────────────────────────────────────────────────────────
  {
    const good = { slug: "a-guide", status: "published", title: "A guide", seoTitle: "A guide | flourish", description: "What it covers.", publishedAt: "2026-11-01", updatedAt: "2026-11-02",
      image: "/app-screens/hero-card.jpg", howWeChecked: "We read the source.", body: [{ type: "p", html: 'See <a href="https://www.canada.ca/">Canada.ca</a>.' }, { type: "screen", src: "/app-screens/home.jpg", alt: "Today", width: 680, height: 1474 }] };
    const html = G.renderGuide(G.checkGuide(good));
    t.ok(/<h1>A guide<\/h1>/.test(html), "1a one H1");
    t.ok(html.includes("<title>A guide | flourish</title>") && html.includes('<meta name="description" content="What it covers.">'), "1b title and meta description");
    t.ok(html.includes('<link rel="canonical" href="https://flourishmoney.app/guides/a-guide/">'), "1c canonical");
    t.ok(html.includes("Last updated November 2, 2026") && html.includes("flourish team"), "1d last updated, and the flourish team as author and reviewer");
    t.ok(html.includes("How we checked this") && html.includes("We read the source."), "1e the note");
    t.ok(html.includes('<a href="https://www.canada.ca/">'), "1f the source link is inline");
    t.ok(html.includes("<figcaption>Example, sample data</figcaption>"), "1g an app screen carries the label");
    for (const tag of ['property="og:type" content="article"', 'property="og:title"', 'property="og:description"', 'property="og:image" content="https://flourishmoney.app/app-screens/hero-card.jpg"', 'property="article:published_time" content="2026-11-01"', 'property="article:author" content="flourish team"']) t.ok(html.includes(tag), `1h Rich Pin: ${tag}`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    t.eq([ld["@type"], ld.headline, ld.datePublished, ld.dateModified, ld.author.name], ["Article", "A guide", "2026-11-01", "2026-11-02", "flourish team"], "1i JSON-LD Article");
    t.ok(!html.includes("noindex"), "1j a published guide is indexable");
    t.ok(!/<script(?! type="application\/ld\+json")/.test(html), "1k no script runs on a guide page");
    t.ok(!/—/.test(html), "1l no em dash");

    const refuse = (patch, why) => { let threw = false; try { G.checkGuide({ ...good, ...patch }); } catch { threw = true; } t.ok(threw, `1m refused: ${why}`); };
    refuse({ howWeChecked: "" }, "no How we checked this");
    refuse({ seoTitle: "x".repeat(61) }, "a title too long");
    refuse({ description: "x".repeat(161) }, "a description too long");
    refuse({ body: [{ type: "p", html: "No source." }] }, "published with no source link");
    refuse({ updatedAt: "soon" }, "no real date");
    refuse({ slug: "Bad Slug" }, "a bad slug");

    const dist = tempDir("guides");
    fs.writeFileSync(path.join(dist, "index.html"), "<html><head><title>x</title></head><body></body></html>");
    const content = tempDir("guides-content");
    fs.writeFileSync(path.join(content, "a-guide.json"), JSON.stringify(good));
    fs.copyFileSync(path.join(ROOT, "content", "guides", "template-test.json"), path.join(content, "template-test.json"));
    G.buildGuides(dist, { contentDir: content, env: {} });
    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    const index = fs.readFileSync(path.join(dist, "guides", "index.html"), "utf8");
    const draft = fs.readFileSync(path.join(dist, "guides", "template-test", "index.html"), "utf8");
    t.ok(sitemap.includes("https://flourishmoney.app/guides/</loc>") && sitemap.includes("/guides/a-guide/</loc>"), "1n the sitemap has /guides and each published guide");
    t.ok(!sitemap.includes("template-test") && !index.includes("template-test"), "1o a draft is in neither the sitemap nor the index");
    t.ok(draft.includes('<meta name="robots" content="noindex">') && draft.includes("Draft, not published."), "1p a draft says noindex");
    t.ok(draft.includes('property="og:type" content="article"') && draft.includes("application/ld+json"), "1q …and carries the same tags, so the template can be tested");
    const robots = fs.readFileSync(path.join(dist, "robots.txt"), "utf8");
    t.ok(/^Allow: \/$/m.test(robots) && !/Disallow: \/guides/.test(robots) && robots.includes("Sitemap: https://flourishmoney.app/sitemap.xml"), "1r robots.txt allows the guides, so a draft's noindex can be read");
    const real = G.readGuides(path.join(ROOT, "content", "guides"));
    t.eq(real.filter((g) => g.status === "published").length, 0, "1s no guide is published yet");
    t.eq(real.filter((g) => g.status === "draft").length, 1, "1t one draft");
    t.ok(/"build": "vite build && node scripts\/build-guides\.mjs"/.test(read("package.json")), "1u the web build makes them");
    t.ok(!/build:native[^\n]*build-guides/.test(read("package.json")), "1v a store build does not");
  }

  // ── 2. Verification tags ───────────────────────────────────────────────────────────────────
  {
    t.eq(G.verificationTags({}), [], "2a unset: no tag");
    t.eq(G.verificationTags({ PINTEREST_DOMAIN_VERIFY: "abc123", GOOGLE_SITE_VERIFICATION: " x_Y-z " }), ['<meta name="p:domain_verify" content="abc123" />', '<meta name="google-site-verification" content="x_Y-z" />'], "2b each from its own variable");
    let threw = false; try { G.verificationTags({ PINTEREST_DOMAIN_VERIFY: '"><script>' }); } catch { threw = true; }
    t.ok(threw, "2c a value that isn't a token stops the build instead of reaching the page");
    t.ok(G.addTagsToHead("<head></head>", ["<meta>"]).indexOf("<meta>") < G.addTagsToHead("<head></head>", ["<meta>"]).indexOf("</head>"), "2d the tag goes in the head");
    const omit = read("netlify.toml").match(/SECRETS_SCAN_OMIT_KEYS = "([^"]*)"/)[1].split(",");
    t.ok(omit.includes("PLAID_ENV") && omit.includes("PINTEREST_DOMAIN_VERIFY") && omit.includes("GOOGLE_SITE_VERIFICATION"), "2e Netlify's scanner won't fail a build over them");
  }

  // ── 3. src and cr ──────────────────────────────────────────────────────────────────────────
  {
    const A = require("../netlify/functions/_lib/attribution");
    t.eq(A.cleanAttribution({ src: " IG ", cr: "reel_7" }), { src: "ig", cr: "reel_7" }, "3a plain words, lowercased");
    t.eq(A.cleanAttribution({ src: "someone@example.ca", cr: "x".repeat(41) }), { src: "direct", cr: "none" }, "3b anything else is dropped");
    t.eq(A.cleanAttribution(null), { src: "direct", cr: "none" }, "3c nothing at all is direct");
    t.eq([A.platformFromUserAgent("iPhone"), A.platformFromUserAgent("Linux; Android 15"), A.platformFromUserAgent("Macintosh")], ["ios", "android", "other"], "3d the platform only");
    t.eq([A.accountPlatform({ headers: { origin: "capacitor://localhost" } }), A.accountPlatform({ headers: { origin: "https://localhost" } }), A.accountPlatform({ headers: {} })], ["ios", "android", "web"], "3e the account's platform");
    let sent = null;
    const ok = await A.bumpAttributionCount({ supabaseUrl: "https://x", secretKey: "k", name: "store_click", attribution: { src: "ig", cr: "a1" }, platform: "ios", fetchImpl: async (u, o) => { sent = [u, JSON.parse(o.body)]; return { ok: true }; } });
    t.eq([ok, sent], [true, ["https://x/rest/v1/rpc/bump_attribution_count", { p_event: "store_click", p_src: "ig", p_cr: "a1", p_platform: "ios" }]], "3f the count holds an event, src, cr and platform, nothing more");
    t.eq(await A.bumpAttributionCount({ supabaseUrl: "https://x", secretKey: "k", name: "install", attribution: {}, platform: "ios", fetchImpl: async () => { throw new Error("down"); } }), false, "3g a failure never throws");
    const fnSrc = read("netlify", "functions", "attribution.js");
    t.ok(!/connection-ip|forwarded-for/.test(fnSrc + read("netlify", "functions", "_lib", "attribution.js")), "3h no IP is read");

    const C = await import("../src/lib/attribution.js");
    t.eq(C.parseInstallReferrer("utm_source=ig&utm_campaign=reel_7"), { src: "ig", cr: "reel_7" }, "3i Play's referrer gives src and cr");
    t.eq(C.parseInstallReferrer("utm_source=founding&utm_medium=social&utm_campaign=founding"), { src: "founding", cr: "founding" }, "3j an older /get link reads too");
    t.eq(C.parseInstallReferrer("utm_source=google-play&utm_medium=organic"), null, "3k an ordinary Play install is not a campaign");
    t.eq(C.parseInstallReferrer(""), null, "3l nothing is nothing");
    const store = new Map();
    const st = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
    C.captureAttribution("?src=IG&cr=reel_7", st);
    t.eq(JSON.parse(store.get(C.WEB_KEY)), { src: "ig", cr: "reel_7" }, "3m the website keeps them for the session");
    C.captureAttribution("?other=1", st);
    t.eq(JSON.parse(store.get(C.WEB_KEY)), { src: "ig", cr: "reel_7" }, "3n a later page without them doesn't clear them");
    t.ok(!C.REFERRER_KEY.startsWith("flourish_"), "3o the install's record survives sign-out's flourish_ wipe");

    const java = read("android", "app", "src", "main", "java", "com", "flourishmoney", "app", "FlourishInstallReferrerPlugin.java");
    t.ok(/InstallReferrerClient/.test(java) && /@CapacitorPlugin\(name = "FlourishInstallReferrer"\)/.test(java), "3p the Android plugin");
    t.ok(/registerPlugin\(FlourishInstallReferrerPlugin\.class\)/.test(read("android", "app", "src", "main", "java", "com", "flourishmoney", "app", "MainActivity.java")), "3q …is registered");
    t.ok(/com\.android\.installreferrer:installreferrer:/.test(read("android", "app", "build.gradle")), "3r …with Google's library");
  }

  // ── 4. The newsletter ──────────────────────────────────────────────────────────────────────
  {
    process.env.RESEND_API_KEY = "test";
    const N = require("../netlify/functions/_lib/newsletter");
    const fn = require("../netlify/functions/newsletter")._test;
    const memory = new Map();
    const store = { get: async (k) => memory.get(k) ?? null, setJSON: async (k, v) => { memory.set(k, v); } };
    let clock = new Date("2026-11-04T12:00:00Z");
    const mail = [];
    const admin = fakeAdmin();
    const deps = { admin: () => admin, store: () => store, send: async (p, key) => { mail.push({ p, key }); return true; }, now: () => clock };
    const post = (body, headers = { "x-nf-client-connection-ip": `10.0.0.${mail.length + memory.size}`, "user-agent": "Mozilla/5.0 (iPhone) Version/18 Mobile Safari/604.1" }) => fn.route({ httpMethod: "POST", headers, queryStringParameters: {}, body: JSON.stringify(body) }, deps);
    const good = { email: " Reader@Example.ca ", consent: true, version: N.CONSENT_VERSION, source: "site_newsletter" };

    const status = JSON.parse((await fn.route({ httpMethod: "GET", headers: {}, queryStringParameters: {} }, deps)).body);
    t.eq([status.open, status.version, status.wording], [true, N.CONSENT_VERSION, N.CONSENT_VERSIONS[N.CONSENT_VERSION]], "4a the form gets the wording from the server");
    t.ok(/GrowSmart Inc\. \(flourish\)/.test(status.wording) && /unsubscribe/i.test(status.wording), "4b the wording names the sender and says they can leave");
    t.ok(!/—/.test(status.wording), "4b2 no em dash");
    t.eq((await post({ ...good, consent: false })).statusCode, 400, "4c no tick, no sign-up");
    t.eq((await post({ ...good, consent: "true" })).statusCode, 400, "4d consent must be a real true");
    t.eq((await post({ ...good, version: "2020-01-01" })).statusCode, 400, "4e an old wording is refused");
    t.eq((await post({ ...good, source: "nowhere" })).statusCode, 400, "4f an unknown source is refused");
    t.eq((admin.tables.newsletter_subscribers || []).length, 0, "4g …and none of those stored anything");

    t.eq((await post(good)).statusCode, 200, "4h a real sign-up");
    const rows = admin.tables.newsletter_subscribers;
    const row = rows[0];
    t.eq([rows.length, row.email, row.consent, row.consent_wording, row.source, row.ua_family, row.confirmed_at ?? null], [1, "reader@example.ca", true, N.CONSENT_VERSIONS[N.CONSENT_VERSION], "site_newsletter", "safari", null], "4i stores the address, consent, exact wording, source and browser family, and is not yet confirmed");
    t.ok(!JSON.stringify(row).includes("10.0.0") && !JSON.stringify(row).includes("Mozilla"), "4j no IP and no user agent");
    t.ok(row.consented_at === clock.toISOString(), "4k the timestamp");
    t.eq(mail.length, 1, "4l one confirmation email");
    const email = mail[0].p;
    t.ok(email.text.includes(N.SENDER_LINE) && email.html.includes("GrowSmart Inc. (flourish)"), "4m the sender's identity and mailing address, in both parts");
    t.ok(/do=unsubscribe/.test(email.text) && /do=unsubscribe/.test(email.html), "4n a one-click unsubscribe");
    t.eq(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click", "4o the mailbox's own one-click");
    t.ok(!email.text.includes("reader@example.ca") && !/reader/.test(email.headers["List-Unsubscribe"]), "4p no address in a link");
    t.eq(N.newsletterEmail({ to: "a@b.ca", rowId: "bad id!", subject: "s", paragraphs: ["p"] }), null, "4q no unsubscribe link, no email");

    t.eq([(await post(good)).statusCode, mail.length], [200, 1], "4r asking again at once sends no second email, with the same answer");
    const q = (url) => Object.fromEntries(new URL(url).searchParams);
    const confirmUrl = email.text.match(/https:\S*do=confirm\S*/)[0], unsubUrl = email.text.match(/https:\S*do=unsubscribe\S*/)[0];
    const link = (method, url) => fn.route({ httpMethod: method, headers: {}, queryStringParameters: q(url), body: "" }, deps);
    t.eq([(await link("GET", confirmUrl)).statusCode, row.confirmed_at ?? null], [200, null], "4s opening the link changes nothing (mail scanners)");
    t.eq((await link("POST", confirmUrl.replace(/t=.*/, "t=forged"))).statusCode, 400, "4t a forged link does nothing");
    t.eq([(await link("POST", confirmUrl)).statusCode, row.confirmed_at], [200, clock.toISOString()], "4u the button confirms");
    t.eq([(await post(good)).statusCode, mail.length], [200, 1], "4v a confirmed address gets no email, with the same answer");

    t.eq([(await link("GET", unsubUrl)).statusCode, row.unsubscribed_at ?? null], [200, null], "4w unsubscribe: opening the link changes nothing");
    t.eq((await link("POST", unsubUrl.replace(/t=.*/, "t=forged"))).statusCode, 400, "4x a forged one does nothing");
    t.eq([(await link("POST", unsubUrl)).statusCode, row.unsubscribed_at], [200, clock.toISOString()], "4y the POST takes effect at once");
    clock = new Date(clock.getTime() + 60000);
    t.eq((await link("POST", confirmUrl)).statusCode, 400, "4z an old confirm link can't undo an unsubscribe");
    t.ok(row.unsubscribed_at, "4z2 …still unsubscribed");
    clock = new Date(clock.getTime() + 8 * 24 * 3600 * 1000);
    t.eq((await link("POST", confirmUrl)).statusCode, 410, "4z3 a confirm link expires after 7 days");

    await post(good);
    t.eq([mail.length, row.confirmed_at, !!row.unsubscribed_at], [2, null, true], "4z4 back after unsubscribing: a new confirmation, and off the list until it is confirmed");

    const src = read("netlify", "functions", "newsletter.js") + read("netlify", "functions", "_lib", "newsletter.js") + read("supabase", "migrations", "0037_newsletter.sql").replace(/^--.*$/gm, "");
    t.ok(!/from\("waitlist"\)|public\.waitlist|insert into/i.test(src), "4z5 no waitlist row can reach this list, and the migration adds no rows");
    t.ok(admin.calls.every((c) => c === "newsletter_subscribers"), "4z6 only its own table is touched");
    t.eq(N.uaFamily("Mozilla/5.0 (Windows) Chrome/131 Safari/537 Edg/131"), "edge", "4z7 Edge is Edge");
    t.eq(N.uaFamily("anything", true), "flourish_app", "4z8 the store apps");
    const page = read("public", "newsletter", "index.html");
    t.ok(/<input id="consent"[^>]*type="checkbox">/.test(page) && !/checked/.test(page), "4z9 the website's box starts unticked");
    const app = read("src", "App.jsx");
    t.ok(/const \[ticked,setTicked\]=useState\(false\)/.test(app), "4z10 the app's too");
    t.ok(/\{!data\?\.demo&&<NewsletterCard\/>\}/.test(app), "4z11 the form is in Settings");
    delete process.env.RESEND_API_KEY;
  }

  // ── 5. Tester codes and day 30 ─────────────────────────────────────────────────────────────
  {
    const T = require("../netlify/functions/_lib/testers");
    const fn = require("../netlify/functions/tester")._test;
    const five = [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, text: `Question ${n}?` }));
    t.ok([0, 5].includes(T.QUESTIONS.length), "5a the wording file holds nothing yet, or the five");
    t.eq([T.cleanTesterCode(" fm-test1 "), T.cleanTesterCode("a"), T.cleanTesterCode("bad code!")], ["FM-TEST1", null, null], "5b a code is a plain word");
    const marked = "2026-10-01T12:00:00Z";
    const at = (s) => new Date(s);
    t.eq(T.isDue({ marked_at: marked }, five, at("2026-10-31T11:59:00Z")), false, "5c day 29 asks nothing");
    t.eq(T.isDue({ marked_at: marked }, five, at("2026-10-31T12:00:00Z")), true, "5d day 30 asks");
    t.eq(T.isDue({ marked_at: marked, answered_at: "2026-11-01T00:00:00Z" }, five, at("2026-12-01T00:00:00Z")), false, "5e answered is done");
    t.eq(T.isDue({ marked_at: marked }, [], at("2026-12-01T00:00:00Z")), false, "5f no wording yet, no question");
    t.eq(T.isDue(null, five, at("2026-12-01T00:00:00Z")), false, "5g not a tester, no question");
    t.eq(T.answerRows("u", { q1: " yes ", q2: "", nope: "x" }, five, at(marked)), [{ user_id: "u", question_id: "q1", question_wording: "Question 1?", answer: "yes", answered_at: at(marked).toISOString() }], "5h saved with the wording shown; empty and unknown answers are left out");

    const admin = fakeAdmin({ tester_accounts: [{ user_id: "u1", code: "FM-TEST1", marked_at: marked, answered_at: null }], tester_answers: [], tester_codes: [] });
    let now = at("2026-11-02T00:00:00Z");
    const deps = { admin: () => admin, user: async (e) => ({ user_id: e.who || null }), questions: five, now: () => now };
    const call = (body, who = "u1") => fn.route({ httpMethod: "POST", headers: {}, who, body: JSON.stringify(body) }, deps);
    t.eq(JSON.parse((await fn.route({ httpMethod: "GET", headers: {} }, deps)).body), { enabled: false }, "5i no live code: no sign-up field");
    t.eq((await call({ action: "status" }, null)).statusCode, 401, "5j signed in only");
    t.eq(JSON.parse((await call({ action: "status" }, "stranger")).body), { due: false }, "5k someone else's account: nothing");
    const s = JSON.parse((await call({ action: "status" })).body);
    t.eq([s.due, s.questions.length], [true, 5], "5l a tester on day 30 gets the five");
    t.eq((await call({ action: "answer", answers: {} })).statusCode, 400, "5m no answers, nothing saved");
    t.eq((await call({ action: "answer", answers: { q1: "Good", q2: "Fine" } })).statusCode, 200, "5n answers are saved");
    t.eq([admin.tables.tester_answers.length, !!admin.tables.tester_accounts[0].answered_at], [2, true], "5o …to the account");
    t.eq(JSON.parse((await call({ action: "status" })).body), { due: false }, "5p and it isn't asked again");
    t.eq((await call({ action: "answer", answers: { q1: "Again" } })).statusCode, 409, "5q nor can it be answered again");

    const app = read("src", "App.jsx");
    const card = app.slice(app.indexOf("function TesterQuestionsCard"), app.indexOf("// The app shows this only when /api/household answers"));
    t.ok(card.length > 500 && !/rate|review|reward|store|stars/i.test(card.replace(/\/\/.*$/gm, "").replace(/restore/g, "")), "5r the card says nothing of ratings or rewards");
    const sql = read("supabase", "migrations", "0038_testers.sql");
    t.ok(!/^insert/im.test(sql), "5s the migration adds no code: Amanda chooses them");
  }

  // ── 6. The wiring ──────────────────────────────────────────────────────────────────────────
  {
    const beta = read("netlify", "functions", "beta.js");
    t.ok(/recordAccountAttribution\(admin, newAccountId, body\.attribution, accountPlatform\(event\)\)/.test(beta), "6a src and cr go on a new account");
    t.ok(/!isTestEmail\(email\)\) await recordAccountAttribution/.test(beta), "6b never Flourish's own test addresses");
    t.ok(beta.indexOf("tester_code_invalid") < beta.indexOf("createUser({"), "6c a wrong tester code is refused before an account exists");
    const toml = read("netlify.toml");
    for (const r of ["attribution", "newsletter", "tester"]) t.ok(toml.indexOf(`from   = "/api/${r}"`) > 0 && toml.indexOf(`from   = "/api/${r}"`) < toml.indexOf('from   = "/*"'), `6d /api/${r} comes before the app's fallback`);
    const act = read("netlify", "functions", "activation.js");
    t.ok(/metric === "safe_view" \|\| metric === "first_number_shown"\) await markActivated/.test(act), "6e the first number marks an account activated");
    t.ok(/newsletter_subscribers"\)\.delete\(\)/.test(read("netlify", "functions", "plaid.js")), "6f deleting an account removes its address from the list");
    const { LANDING_ONLY } = await import("../scripts/strip-landing-media.mjs");
    t.ok(LANDING_ONLY.includes("newsletter"), "6g the website's sign-up page stays out of a store build");
  }

  t.summary("MARKETING SETUPS");
})();
