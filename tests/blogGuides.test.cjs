// tests/blogGuides.test.cjs
// -----------------------------------------------------------------------------
// THE BLOG: THE FIRST THREE GUIDES, THE "Blog" LINKS AND /blog (2026-11-18).
// The three guides are Amanda's approved text of 2026-11-13, word for word (ChatGPT 100, Grok 100). Their words are
// pinned here by a fingerprint, so a changed word is a deliberate act: change the fingerprint with the approval.
//   1  the three guides: published, with the approved titles, descriptions and addresses
//   2  each page: its own title, og:type article, a real og:image, Article JSON-LD, the sample-data label on every screen
//      (guide C has no screen: its figures are all FCAC's, and a screen of sample debt broke that promise)
//   3  the index lists all three, newest first, and the sitemap has each
//   4  nothing a guide must not carry: an em dash, a working note, a trial, price or plan line
//   5  the website's menu and footer say "Blog" and go to /guides/
//   6  /blog and /blog/ go to /guides/ for good (301), ahead of the SPA fallback
//   7  a store build holds none of the guides' media
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { tempDir } = require("./_tmp.cjs");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

// Width and height from a JPEG's SOF marker, without a dependency (as tests/landingScreens.test.cjs).
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const GUIDES = [
  { slug: "canadian-benefit-payment-dates-december-2026-january-2027",
    title: "Canadian benefit payment dates for December 2026 and January 2027",
    seoTitle: "Canadian benefit payment dates: December 2026, January 2027",
    description: "Canadian benefit payment dates for December 2026 and January 2027, including federal benefits and selected provincial programs, with official sources.",
    words: "fd6cdd247559315f4a70a45318abf65cafd752134bf3a57813dda3f5c582d4b4", screens: ["/guide-media/watch-list.jpg"],
    says: ["Friday, December 11 Canada child benefit CRA", "Tuesday, December 22 Canada Pension Plan Service Canada", "Tuesday, January 5 Canada Groceries and Essentials Benefit CRA", "is 40 days.", "which is 36 days later."] },
  { slug: "minimum-payment-credit-card-canada",
    title: "What happens when you only pay the minimum on a Canadian credit card",
    seoTitle: "Paying only the minimum on a Canadian credit card",
    description: "How the minimum payment is set in Canada, what paying only the minimum does to time and interest, and the federal calculator that runs your numbers.",
    words: "f620c8279a5c68aa32253348ed16d4ef8294f95b54cbd8165995ed9e92a77c31", screens: [],
    says: ["1: only the minimum each month $2,000 $60 18% 3 years, 11 months $793 $2,793", "2: the minimum plus $100 each month $2,000 $160 18% 1 year, 2 months $231 $2,231", "since August 1, 2025, the credit card minimum payment for Quebec residents is 5%"] },
  { slug: "three-paycheque-month-biweekly-pay-canada",
    title: "How to plan a month with three paydays when you're paid every two weeks",
    seoTitle: "How to plan a month with three paydays",
    description: "If you're paid every two weeks, most years have two months with three paydays. Find yours for 2027 in one table, and see how they line up with your bills.",
    words: "1496958829d9f525ce948eb23022873df577f9df7a68bceecdc525d253c3e147", screens: ["/guide-media/watch-list.jpg", "/guide-media/today.jpg"],
    says: ["Friday, January 1 January, July, December (27 paydays)", "Thursday, January 14 July, December", "December 2026 has three paydays only if your first December payday is the 1st, 2nd or 3rd."] },
];

(async () => {
  const t = create();
  const G = await import("../scripts/build-guides.mjs");
  const real = G.readGuides(path.join(ROOT, "content", "guides"));
  const dist = tempDir("blog-guides");
  fs.writeFileSync(path.join(dist, "index.html"), "<html><head><title>x</title></head><body></body></html>");
  G.buildGuides(dist, { contentDir: path.join(ROOT, "content", "guides"), env: {} });
  const index = fs.readFileSync(path.join(dist, "guides", "index.html"), "utf8");
  const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");

  for (const want of GUIDES) {
    const g = real.find((x) => x.slug === want.slug);
    t.ok(!!g && g.status === "published", `1a ${want.slug} is published`);
    if (!g) continue;
    // ── 1. the approved words ──────────────────────────────────────────────────────────────────
    t.eq([g.title, g.seoTitle, g.description], [want.title, want.seoTitle, want.description], `1b ${want.slug}: the approved title and description; the tab title is within ${G.TITLE_MAX} characters`);
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify([g.title, g.description, g.howWeChecked, g.sources, g.body.filter((b) => b.type !== "screen")])).digest("hex");
    t.eq(fingerprint, want.words, `1c ${want.slug}: the approved text, word for word (approved 2026-11-13)`);
    t.eq([g.publishedAt, g.updatedAt >= g.publishedAt], ["2026-11-18", true], `1d ${want.slug}: published 2026-11-18`);

    // ── 2. the page ────────────────────────────────────────────────────────────────────────────
    const html = fs.readFileSync(path.join(dist, "guides", want.slug, "index.html"), "utf8");
    const url = `https://flourishmoney.app/guides/${want.slug}/`;
    t.ok(html.includes(`<title>${want.seoTitle}</title>`) && html.includes(`<h1>${want.title}</h1>`), `2a ${want.slug}: its own title and one H1`);
    t.ok(html.includes(`<link rel="canonical" href="${url}">`) && html.includes(`<meta property="og:url" content="${url}">`), `2b ${want.slug}: its own address`);
    t.ok(html.includes('<meta property="og:type" content="article">') && html.includes('<meta property="article:published_time" content="2026-11-18">') && html.includes('<meta property="article:author" content="flourish team">'), `2c ${want.slug}: og:type article, with its date and author (Rich Pins)`);
    const og = (html.match(/<meta property="og:image" content="https:\/\/flourishmoney\.app(\/[^"]+)">/) || [])[1];
    const ogFile = og ? path.join(ROOT, "public", og) : "";
    t.ok(!!og && og === `/guide-media/og-${want.slug}.jpg` && fs.existsSync(ogFile), `2d ${want.slug}: og:image is a file the site serves (${og})`);
    if (og && fs.existsSync(ogFile)) t.eq(jpegSize(ogFile), { width: 1200, height: 630 }, `2e ${want.slug}: …a 1200 x 630 JPEG`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    t.eq([ld["@type"], ld.headline, ld.url, ld.datePublished, ld.image, ld.author.name], ["Article", want.title, url, "2026-11-18", `https://flourishmoney.app${og}`, "flourish team"], `2f ${want.slug}: Article JSON-LD`);
    const figures = [...html.matchAll(/<figure><img src="([^"]+)"[^>]*><figcaption>([^<]*)<\/figcaption><\/figure>/g)];
    t.eq(figures.map((m) => m[1]), want.screens, `2g ${want.slug}: the screens its text names`);
    t.ok(figures.every((m) => m[2] === "Example, sample data"), `2h ${want.slug}: every screen says "Example, sample data"`);
    for (const m of figures) t.eq(jpegSize(path.join(ROOT, "public", m[1])), { width: 680, height: 1472 }, `2i ${m[1]} is served, 680 x 1472`);
    const text = textOf(html);
    for (const s of want.says) t.ok(text.includes(s), `2j ${want.slug} says: ${s}`);
    t.ok(text.includes("Not financial advice.") && text.includes("How we checked this") && text.includes("No financial professional reviewed this page.") && text.includes("Sources:"), `2k ${want.slug}: the no-advice line, the note and its sources`);
    t.ok((g.sources || []).length >= 3 && g.sources.every((s) => html.includes(`<a href="${s.url}">${s.url}</a>`)), `2l ${want.slug}: every source is a link`);

    // ── 4. what a guide must not carry ─────────────────────────────────────────────────────────
    t.ok(!/—/.test(html), `4a ${want.slug}: no em dash`);
    t.ok(!/APPROVED TEXT|Suggested URL|Pinterest|pin ideas|would go here|Meta description|\*\*/.test(html), `4b ${want.slug}: no working note, pin idea or stray markup`);
    t.ok(!/trial|days left|upgrade|founding|per month|\/mo\b|\$\d+(\.\d\d)? a (month|year)|subscribe/i.test(text), `4c ${want.slug}: no trial, price, plan or upgrade line`);
    t.ok(!/Flourish/.test(text), `4d ${want.slug}: flourish is lowercase`);
    t.ok(!/noindex/.test(html), `4e ${want.slug}: indexable`);
    // Amanda, 2026-11-18: guide C says every figure on it is FCAC's, so it shows no app screen (the sample debt came out).
    if (want.slug === "minimum-payment-credit-card-canada") t.ok(!/<img|<figure|<figcaption|guide-media\/do-payoff/.test(html) && !text.includes("Example, sample data") && text.includes("Every figure below is FCAC's, not ours."), "4f guide C carries no image and no sample figure: every figure on it is FCAC's");

    // ── 3. listed ──────────────────────────────────────────────────────────────────────────────
    t.ok(index.includes(`<li><a href="/guides/${want.slug}/">`), `3a the index lists ${want.slug}`);
    t.ok(sitemap.includes(`<url><loc>${url}</loc><lastmod>${g.updatedAt}</lastmod></url>`), `3b the sitemap has ${want.slug}`);
  }
  const published = real.filter((g) => g.status === "published");
  t.eq(published.length, 3, "3c three guides are published");
  const listed = [...index.matchAll(/<li><a href="\/guides\/([^"]+)\/">/g)].map((m) => m[1]);
  const dates = listed.map((s) => (real.find((g) => g.slug === s) || {}).updatedAt);
  t.ok(listed.length === 3 && dates.every((d, i) => i === 0 || dates[i - 1] >= d), "3d the index lists all three, newest first");
  t.ok(index.includes("<title>Guides | flourish</title>") && !index.includes("The first guides are on the way."), "3e the index is no longer empty");
  t.ok(!index.includes("template-test") && !sitemap.includes("template-test"), "3f the draft template is still listed nowhere");
  // A newer guide goes to the top.
  {
    const c = tempDir("blog-guides-order"), d = tempDir("blog-guides-order-dist");
    fs.writeFileSync(path.join(d, "index.html"), "<html><head></head><body></body></html>");
    for (const g of published) fs.writeFileSync(path.join(c, `${g.slug}.json`), JSON.stringify(g.slug.startsWith("three-") ? { ...g, updatedAt: "2026-12-01" } : g));
    G.buildGuides(d, { contentDir: c, env: {} });
    const first = (fs.readFileSync(path.join(d, "guides", "index.html"), "utf8").match(/<li><a href="\/guides\/([^"]+)\/">/) || [])[1];
    t.eq(first, "three-paycheque-month-biweekly-pay-canada", "3g a guide updated later is listed first");
  }

  // ── 5. the website's menu and footer ─────────────────────────────────────────────────────────
  const APP = read("src", "App.jsx");
  const nav = APP.slice(APP.indexOf('<div className="fll-nav">'), APP.indexOf('<div className="fll-nav">') + 500);
  t.ok(/<a className="fll-navlink" href="\/guides\/">Blog<\/a>\s*<button className="fll-login" onClick=\{goLogin\}>Log in<\/button>/.test(nav), '5a the menu: "Blog" goes to /guides/, beside Log in');
  const foot = APP.slice(APP.indexOf('<div className="fll-foot">'), APP.indexOf('<div className="fll-foot">') + 900);
  t.ok(/<a href="\/newsletter\/">Canadian money dates<\/a>\s*<a href="\/guides\/">Blog<\/a>/.test(foot), '5b the footer: "Blog" goes to /guides/');
  t.ok(/\.fll-nav\{ flex-wrap:wrap;/.test(APP) && /\.fll-navlink\{[^}]*min-height:44px;/.test(APP), "5c the menu wraps on a very narrow phone instead of being cut off, and Blog is a full-size tap target");
  // One row from 360 wide: the name (52 mark + 12 + the word, 179 in all), the nav's own 12 gap and 44 of padding leave 125 for the pair at 360.
  t.ok(/\.fll-nav-links\{[^}]*gap:8px;/.test(APP) && /\.fll-navlink\{[^}]*padding:0 4px;/.test(APP), "5d the pair is narrow enough to sit beside the name on a 360-wide phone (measured 2026-11-18: one row at 360, wraps at 320)");

  // ── 6. /blog ─────────────────────────────────────────────────────────────────────────────────
  const toml = read("netlify.toml");
  const spaAt = toml.indexOf('from   = "/*"');
  for (const from of ["/blog", "/blog/*"]) {
    const m = toml.match(new RegExp(`\\[\\[redirects\\]\\]\\s*\\n\\s*from\\s*=\\s*"${from.replace(/[/*]/g, "\\$&")}"\\s*\\n\\s*to\\s*=\\s*"/guides/"\\s*\\n\\s*status\\s*=\\s*301\\s*\\n\\s*force\\s*=\\s*true`));
    t.ok(!!m && m.index < spaAt && spaAt > 0, `6 ${from} goes to /guides/ with a 301, ahead of the SPA fallback`);
  }

  // ── 7. a store build ─────────────────────────────────────────────────────────────────────────
  const { LANDING_ONLY } = await import("../scripts/strip-landing-media.mjs");
  t.ok(LANDING_ONLY.includes("guide-media"), "7a a store build drops public/guide-media");
  const media = fs.readdirSync(path.join(ROOT, "public", "guide-media")).filter((f) => !f.startsWith(".")).sort();
  const used = [...new Set(published.flatMap((g) => [g.image, ...g.body.filter((b) => b.type === "screen").map((b) => b.src)]))].map((p) => p.replace("/guide-media/", "")).sort();
  t.eq(media, used, "7b public/guide-media holds exactly the images the guides use");
  t.ok(!/guide-media/.test(APP), "7c the app itself never loads them");

  t.summary("blogGuides.test");
})();
