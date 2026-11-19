// tests/seoPages.test.cjs
// -----------------------------------------------------------------------------
// THE WEBSITE READABLE WITHOUT A SCRIPT: SEARCH ENGINES AND AI TOOLS (scripts/build-seo.mjs, 2026-11-19).
// Amanda: the home page's raw HTML had 42 characters of text, no page had JSON-LD but the guides, and /llms.txt answered
// with the app shell. Change no approved words; only expose what is already on the pages.
//   1  the home page: the landing's own words in the HTML, rendered from AuthScreen, following TRIAL_PLAN_FIRST
//   2  every other address gets the app shell exactly as vite writes it (netlify.toml's SPA fallback is app.html)
//   3  JSON-LD: Organization and two SoftwareApplications on the home page and /get/ (no price, no rating), FAQPage on
//      /support from the list the page shows, Article on each guide with its dates, all checked by Google's rules for
//      each type and against schema.org's properties
//   4  /llms.txt: what flourish is, who it is for, what it does, the guides and the store pages; every fact from a page
//   5  robots.txt lets the search and AI crawlers read every public page; the sitemap lists every public page
//   6  a store app does not change: build:native never runs this, and App.jsx is not edited for it
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const SITE = "https://flourishmoney.app";
const APP_STORE = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
const PLAY = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";
const TPF_ON = { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-18T18:55:00Z" };
const BOTS = ["Bingbot", "OAI-SearchBot", "GPTBot", "PerplexityBot", "Google-Extended"];

const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodesOf = (ld) => ld.flatMap((b) => (b["@graph"] ? b["@graph"] : [b]));
const typed = (nodes, type) => nodes.filter((n) => n["@type"] === type);
const deep = (o, f) => { if (o && typeof o === "object") { f(o); Object.values(o).forEach((v) => deep(v, f)); } };

// ── A local structured-data check: schema.org's properties for each type used, and Google's rules for the rich result
// of each type (developers.google.com/search/docs/appearance/structured-data: Article, Organization, FAQPage,
// Software App). It answers a list of problems; an empty list means valid.
const THING = ["@id", "@type", "@context", "name", "url", "description", "image", "sameAs", "mainEntityOfPage"];
const CREATIVE = [...THING, "author", "publisher", "datePublished", "dateModified", "headline", "inLanguage", "offers", "aggregateRating", "review"];
const PROPS = {
  Organization: [...THING, "logo", "email", "address", "areaServed", "telephone", "parentOrganization"],
  SoftwareApplication: [...CREATIVE, "operatingSystem", "applicationCategory", "downloadUrl", "softwareVersion"],
  Article: CREATIVE,
  FAQPage: [...CREATIVE, "mainEntity"],
  Question: [...THING, "acceptedAnswer"],
  Answer: [...THING, "text"],
  PostalAddress: [...THING, "addressCountry", "addressRegion", "addressLocality", "postalCode", "streetAddress", "postOfficeBoxNumber"],
  Country: THING,
  ImageObject: [...THING, "contentUrl"],
};
const GOOGLE_APP_CATEGORIES = ["GameApplication", "SocialNetworkingApplication", "TravelApplication", "ShoppingApplication", "SportsApplication", "LifestyleApplication", "BusinessApplication", "DesignApplication", "DeveloperApplication", "DriverApplication", "EducationalApplication", "HealthApplication", "FinanceApplication", "SecurityApplication", "BrowserApplication", "CommunicationApplication", "DesktopEnhancementApplication", "EntertainmentApplication", "MultimediaApplication", "HomeApplication", "UtilitiesApplication", "ReferenceApplication"];
const absolute = (u) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);
const isoDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(d);
function checkLd(blocks, visibleText) {
  const problems = [];
  for (const b of blocks) if (b["@context"] !== "https://schema.org") problems.push("a block without @context https://schema.org");
  const ids = new Set();
  deep(blocks, (n) => { if (n["@id"] && n["@type"]) ids.add(n["@id"]); });
  deep(blocks, (n) => {
    if (Array.isArray(n) || n["@graph"]) return;
    const type = n["@type"];
    if (!type) { if (n["@id"] && Object.keys(n).length === 1) return; if (!n["@id"]) problems.push(`a node with no @type: ${JSON.stringify(n).slice(0, 80)}`); return; }
    const allowed = PROPS[type];
    if (!allowed) { problems.push(`a type this check does not know: ${type}`); return; }
    for (const k of Object.keys(n)) if (!allowed.includes(k)) problems.push(`${type}.${k} is not a schema.org property of ${type}`);
    if (type === "Organization") {
      // Google: a name; a logo is an absolute url (or an ImageObject with one). The node that describes the
      // organization in full (the one with sameAs) also needs its url and logo.
      if (!n.name) problems.push("Organization: a name");
      const logo = n.logo && typeof n.logo === "object" ? n.logo.url : n.logo;
      if (n.logo !== undefined && !absolute(logo)) problems.push("Organization: an absolute logo url");
      if (n.sameAs && (!absolute(n.url) || !absolute(logo))) problems.push("Organization: the full description needs an absolute url and logo");
    }
    if (type === "SoftwareApplication") {
      if (!n.name || !n.operatingSystem) problems.push("SoftwareApplication: name and operatingSystem");
      if (!GOOGLE_APP_CATEGORIES.includes(n.applicationCategory)) problems.push(`SoftwareApplication: applicationCategory ${n.applicationCategory} is not one Google lists`);
      if (!absolute(n.url)) problems.push("SoftwareApplication: an absolute url");
    }
    if (type === "Article") {
      if (!n.headline || n.headline.length > 110) problems.push("Article: a headline of at most 110 characters");
      const img = Array.isArray(n.image) ? n.image : [n.image];
      if (!img.length || !img.every(absolute)) problems.push("Article: absolute image urls");
      if (!isoDate(n.datePublished) || (n.dateModified && !isoDate(n.dateModified))) problems.push("Article: ISO 8601 dates");
      if (!n.author || !n.author.name) problems.push("Article: an author with a name");
      if (!n.publisher || !n.publisher.name) problems.push("Article: a publisher with a name");
    }
    if (type === "FAQPage") {
      if (!Array.isArray(n.mainEntity) || !n.mainEntity.length) problems.push("FAQPage: mainEntity, a list of Questions");
      for (const q of n.mainEntity || []) {
        if (q["@type"] !== "Question" || !q.name || !q.acceptedAnswer || q.acceptedAnswer["@type"] !== "Answer" || !q.acceptedAnswer.text) problems.push("FAQPage: each Question needs a name and an Answer with text");
        else if (visibleText !== undefined && (!visibleText.includes(q.name) || !visibleText.includes(q.acceptedAnswer.text))) problems.push(`FAQPage: "${q.name}" and its answer must be on the page`);
      }
    }
    for (const k of ["publisher", "author"]) if (n[k] && n[k]["@id"] && !n[k].name && !ids.has(n[k]["@id"]) && !n[k]["@type"]) problems.push(`${type}.${k} points at ${n[k]["@id"]}, which is not described on the page`);
  });
  return problems;
}

(async () => {
  const t = create();
  const SEO = await import(path.join(ROOT, "scripts", "build-seo.mjs"));
  const G = await import(path.join(ROOT, "scripts", "build-guides.mjs"));
  const { renderPages } = await import(path.join(ROOT, "scripts", "prerender-pages.mjs"));
  const { textOf } = SEO;

  // The website as `npm run build` makes it (vite build, then build-guides, which runs build-seo), with the switch on.
  const env = { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder", ...TPF_ON };
  const dist = tempDir("seo-pages");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], { cwd: ROOT, stdio: "inherit", env });
  const shell = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  G.buildGuides(dist, { contentDir: path.join(ROOT, "content", "guides"), env });
  const shellTagged = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const published = G.readGuides(path.join(ROOT, "content", "guides")).filter((g) => g.status === "published").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const result = SEO.buildSeo(dist, { env, published });
  const file = (...p) => fs.readFileSync(path.join(dist, ...p), "utf8");
  const home = file("index.html"), support = file("support.html"), app = file("app.html");

  // ── 1. The home page ──────────────────────────────────────────────────────────────────────────
  const homeText = textOf(home);
  t.ok(textOf(shell).length < 100, `1a before: the shell's text is the title alone (${textOf(shell).length} characters)`);
  t.ok(homeText.length > 2000, `1b after: the home page's HTML holds ${homeText.length} characters of text`);
  for (const said of ["Know what's safe to spend until payday.", "flourish accounts for bills due before payday, your minimum debt payments, a buffer and a savings amount, then shows what's safe to spend.",
    "Every bill and payday, up to 90 days ahead", "A 15-minute weekly money meeting", "Why flourish", "Built in Canada", "flourish is operated by GrowSmart Inc."]) {
    t.ok(homeText.includes(said), `1c the HTML says "${said.slice(0, 60)}"`);
  }
  t.ok(home.includes('<div id="root"><div data-prerender="">') && !/<div data-prerender="">[\s\S]*<script/.test(home.split("</head>")[1].split('<script type="module"')[0]), "1d the words sit in #root, in the copy, with no script of their own");
  t.ok(home.includes(SEO.PRERENDER_STYLE) && /@media \(scripting: enabled\)/.test(SEO.PRERENDER_STYLE), "1e a browser that runs scripts hides the copy until React replaces it (what a visitor sees does not change)");
  t.ok(home.includes(`<link rel="canonical" href="${SITE}/" />`), "1f the home page names its address");
  t.eq(result.tpfOn, true, "1h the switch was read from this build's env");
  t.ok(homeText.includes("Get started") && homeText.includes("Eligible new subscribers get 14 days free") && !homeText.includes("Try flourish free for 14 days"), "1i switch on: the landing's switch-on words, as a visitor sees them");
  const off = renderPages({ tpfOn: false, env });
  t.ok(textOf(off.home).includes("Try flourish free for 14 days") && !textOf(off.home).includes("Choose a plan to get started."), "1j switch off: today's words (the same component, the other state)");
  t.ok(!/[—]/.test(homeText) || textOf(shell).includes("—"), "1k the copy adds no em dash of its own");

  // ── 2. Every other address: the app shell as vite wrote it ─────────────────────────────────────
  t.eq(app, shellTagged, "2a dist/app.html is vite's index.html with only the verification tags (none here), nothing else");
  t.ok(!app.includes("data-prerender") && !app.includes("application/ld+json"), "2b …with none of the landing's words and no JSON-LD");
  const toml = read("netlify.toml");
  const redirects = [...toml.matchAll(/\[\[redirects\]\]\s*\n\s*from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"\s*\n\s*status\s*=\s*(\d+)/g)].map((m) => ({ from: m[1], to: m[2], status: +m[3] }));
  const last = redirects[redirects.length - 1];
  t.eq([last.from, last.to, last.status], ["/*", "/app.html", 200], "2c netlify.toml's SPA fallback, the last rule, serves app.html");
  t.ok(!redirects.some((r) => r.to === "/index.html"), "2d no rule serves the home page's file at another address");
  t.ok(fs.existsSync(path.join(dist, "assets")) && app.includes('<script type="module" crossorigin src="/assets/'), "2e app.html loads the same bundle");

  // ── 3. JSON-LD ────────────────────────────────────────────────────────────────────────────────
  const homeLd = ldOf(home), homeNodes = nodesOf(homeLd);
  const [org] = typed(homeNodes, "Organization");
  t.eq(org && [org.name, org.url, org.address.addressCountry, org.areaServed.name, org.sameAs], ["flourish Money", `${SITE}/`, "CA", "Canada", [APP_STORE, PLAY]], "3a Organization: flourish Money, Canada, sameAs both store pages");
  const appsLd = typed(homeNodes, "SoftwareApplication");
  t.eq(appsLd.map((a) => [a.operatingSystem, a.url, a.applicationCategory]), [["iOS", APP_STORE, "FinanceApplication"], ["Android", PLAY, "FinanceApplication"]], "3b SoftwareApplication for iOS and Android, each at its store page");
  const banned = [];
  deep(homeLd, (n) => { for (const k of ["offers", "price", "aggregateRating", "review", "ratingValue"]) if (k in n) banned.push(k); });
  t.eq(banned, [], "3c no price and no rating anywhere");
  t.ok(appsLd.every((a) => homeText.includes(a.description)), "3d the apps' description is the home page's own line");
  t.eq(checkLd(homeLd), [], "3e the home page's JSON-LD passes the structured-data check");
  const getHtml = file("get", "index.html");
  t.eq(nodesOf(ldOf(getHtml)).map((n) => n["@type"]), ["Organization", "SoftwareApplication", "SoftwareApplication"], "3f /get/ carries the same three");
  t.eq(getHtml.replace(/<script type="application\/ld\+json">[^\n]*\n/, ""), read("public", "get", "index.html"), "3g …and otherwise is the page as it was, word for word");
  t.eq(checkLd(ldOf(getHtml)), [], "3h /get/'s JSON-LD passes the check");
  const supportText = textOf(support);
  const faqLd = typed(nodesOf(ldOf(support)), "FAQPage");
  const shownQs = [...support.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => textOf(m[1]));
  t.ok(shownQs.length >= 8, `3i /support shows ${shownQs.length} questions in its HTML`);
  t.eq(faqLd.length === 1 && faqLd[0].mainEntity.map((q) => q.name), shownQs, "3j FAQPage: exactly the questions /support shows, in its order");
  t.eq(checkLd(ldOf(support), supportText), [], "3k …each with the answer the page shows, and the check passes");
  t.ok(supportText.includes("Questions and answers") && supportText.includes("What makes Flourish different"), "3l /support's words are in its HTML");
  t.ok(support.includes(`<link rel="canonical" href="${SITE}/support" />`), "3m /support names its address");
  t.eq(typed(homeNodes, "FAQPage").length + typed(nodesOf(ldOf(getHtml)), "FAQPage").length, 0, "3n no FAQPage where the page shows no questions (the home page, /get/)");
  for (const g of published) {
    const html = file("guides", g.slug, "index.html");
    const ld = ldOf(html);
    const [a] = typed(nodesOf(ld), "Article");
    t.eq(a && [a.datePublished, a.dateModified, a.publisher.name, a.publisher["@id"]], [g.publishedAt, g.updatedAt, "flourish Money", `${SITE}/#organization`], `3o ${g.slug}: Article with its dates, published by the Organization`);
    t.eq(checkLd(ld), [], `3p ${g.slug}: its JSON-LD passes the check`);
  }
  t.ok(checkLd([{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Not on the page?", acceptedAnswer: { "@type": "Answer", text: "No." } }] }], supportText).length === 1
    && checkLd([{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "x", operatingSystem: "iOS", applicationCategory: "Money", url: SITE, rating: 5 }]).length === 2, "3q the check itself fails what it should (a question not on the page, an unknown property and category)");

  // ── 4. /llms.txt ──────────────────────────────────────────────────────────────────────────────
  const llms = file("llms.txt");
  t.ok(llms.startsWith("# flourish Money\n\n> ") && llms.includes("Who it's for: Canadian households."), "4a it says what flourish is and who it is for");
  for (const said of ["what's safe to spend", "Every bill and payday", "money meeting"]) t.ok(llms.includes(said), `4b it says what it does: ${said}`);
  t.ok(llms.includes(`(${APP_STORE})`) && llms.includes(`(${PLAY})`), "4c it links both store pages");
  for (const g of published) t.ok(llms.includes(`[${g.title}](${SITE}/guides/${g.slug}/)`), `4d it links the guide ${g.slug}`);
  t.ok(!/—/.test(llms), "4e no em dash");
  t.ok(!/browser|home screen|web app|sign up on the website/i.test(llms), "4f it promotes no web app: the way in is the stores");
  const pages = { home: homeText, support: supportText, homeMeta: "A Canadian money app where safe to spend is built around your paydays." };
  t.throws(() => SEO.buildLlms({ pages: { ...pages, home: homeText.replace("Every bill and payday", "Each bill") }, guides: [] }), "4g a fact that is not on its page stops the build");
  const factLines = llms.split("\n").filter((l) => l.startsWith("- ") && !l.startsWith("- [") && !l.startsWith("- Contact"));
  t.ok(factLines.length >= 9 && factLines.every((l) => { const said = l.replace(/^- [^:]+: /, "").replace(/^- /, ""); return [homeText, supportText].some((p) => p.includes(said) || p.includes(said.replace(/\.$/, ""))); }), "4h every fact line is word for word from the home page or /support");

  // ── 5. robots.txt and the sitemap ───────────────────────────────────────────────────────────────
  const robots = file("robots.txt");
  const groups = robots.split(/\n\s*\n/).map((g) => g.trim().split("\n")).filter((l) => /^User-agent:/i.test(l[0]));
  const rulesFor = (bot) => (groups.find((g) => g[0].split(":")[1].trim().toLowerCase() === bot.toLowerCase()) || groups.find((g) => g[0].endsWith("*"))).slice(1);
  // RFC 9309: the longest matching rule wins; Allow wins a tie.
  const allowed = (bot, p) => {
    let best = null;
    for (const line of rulesFor(bot)) { const [k, v] = line.split(/:\s*/); const kind = k.toLowerCase(); if ((kind === "allow" || kind === "disallow") && p.startsWith(v) && (!best || v.length > best.v.length || (v.length === best.v.length && kind === "allow"))) best = { kind, v }; }
    return !best || best.kind === "allow";
  };
  const PUBLIC = ["/", "/guides/", ...published.map((g) => `/guides/${g.slug}/`), "/support", "/privacy", "/terms", "/newsletter/", "/get/", "/llms.txt"];
  for (const bot of [...BOTS, "SomeOtherBot"]) {
    t.ok(PUBLIC.every((p) => allowed(bot, p)) && !allowed(bot, "/api/beta"), `5a ${bot} may read every public page (and not /api/)`);
  }
  t.eq(BOTS.filter((b) => !groups.some((g) => g[0] === `User-agent: ${b}`)), [], "5b each of the five is named");
  const sitemap = file("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, ""));
  t.eq(locs.slice().sort(), PUBLIC.filter((p) => p !== "/get/" && p !== "/llms.txt").sort(), "5c the sitemap lists every public page (/get/ says noindex, so it is left out)");
  const served = (p) => { const f = p.endsWith("/") ? path.join(dist, p, "index.html") : fs.existsSync(path.join(dist, `${p}.html`)) ? path.join(dist, `${p}.html`) : path.join(dist, "app.html"); return fs.readFileSync(f, "utf8"); };
  t.eq(locs.filter((p) => /name="robots" content="noindex"/.test(served(p))), [], "5d no page the sitemap lists says noindex");
  t.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), "5e robots.txt points at the sitemap");

  // ── 6. A store app does not change ──────────────────────────────────────────────────────────────
  const pkg = JSON.parse(read("package.json")).scripts;
  t.eq(pkg.build, "vite build && node scripts/build-guides.mjs", "6a the web build is the same command (build-guides runs build-seo)");
  t.ok(!/build-guides|build-seo|prerender/.test(pkg["build:native"]), "6b build:native runs none of it");
  t.ok(!/export\s*\{\s*AuthScreen|export function AuthScreen|export function SupportPage/.test(read("src", "App.jsx")), "6c App.jsx is not edited to export the screens (the SSR build adds that to its own copy)");
  t.ok(read("index.html").includes('<div id="root"></div>') && !read("index.html").includes("prerender"), "6d index.html, which a store app bundles, is unchanged");
  t.ok(!fs.readdirSync(path.join(ROOT, "public")).some((f) => /llms|prerender|support\.html/.test(f)), "6e nothing new in public/, which a store app copies");

  t.summary("SEO PAGES (prerender, JSON-LD, llms.txt, robots, sitemap)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
