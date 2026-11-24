// tests/aiPages.test.cjs
// -----------------------------------------------------------------------------
// THE AI VISIBILITY PAGES (scripts/ai-pages.mjs, 2026-11-24). Five plain pages that read without a script, built after
// vite as the guides are: /best-budgeting-apps-canada, /compare/ynab, /compare/monarch, /compare/waypoint and /press.
// Their words are the approved round 4 (docs/product/AI-VISIBILITY-WORDS.md), word for word.
//   1  every approved line is on its page, in order, with [date] as the go-live day (AI_PAGES_DATE)
//   2  each page: its own title, description and canonical address, a visible "Last updated", the store pages, no
//      noindex, no em dash; JSON-LD is FAQPage only, on the one page with questions, matching its FAQ headings
//   3  the comparisons are real tables, row for row, with the approved line under each table
//   4  /press: its downloads are the repo's existing art (no new art), 3 to 5 screenshots
//   5  the sitemap lists all five; an unknown address still gets the app shell (netlify.toml unchanged)
//   6  the home page's footer links all five; llms.txt gains "Where to use it", "Pricing" and "Compare"
//   7  a store app holds none of it
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const SITE = "https://flourishmoney.app";
const APP_STORE = "https://apps.apple.com/ca/app/flourish-money-handled/id6792967778";
const PLAY = "https://play.google.com/store/apps/details?id=com.flourishmoney.app";
const PATHS = ["/best-budgeting-apps-canada", "/compare/ynab", "/compare/monarch", "/compare/waypoint", "/press"];

// The approved words, from the record (the text between the ``` fences), cut into each page's lines.
function approvedWords() {
  const doc = read("docs", "product", "AI-VISIBILITY-WORDS.md");
  const body = doc.slice(doc.indexOf("```text\n") + 8, doc.lastIndexOf("```"));
  const lines = body.split("\n");
  const at = (pred, from = 0) => { for (let i = from; i < lines.length; i++) if (pred(lines[i])) return i; return -1; };
  const between = (a, b) => lines.slice(a + 1, b).filter((l) => l.trim());
  const best = at((l) => l.startsWith("3. New page /best-budgeting-apps-canada"));
  const cmp = at((l) => l.startsWith("4. Comparison pages"));
  const ynab = at((l) => l === "/compare/ynab"), monarch = at((l) => l === "/compare/monarch"), waypoint = at((l) => l === "/compare/waypoint");
  const visible = at((l) => l.startsWith("Visible line on all three pages"));
  const press = at((l) => l.startsWith("5. New page /press")), llms = at((l) => l.startsWith("6. llms.txt additions"));
  if ([best, cmp, ynab, monarch, waypoint, visible, press, llms].some((i) => i < 0)) throw new Error("the words record is not in the expected shape");
  return {
    "/best-budgeting-apps-canada": between(best, cmp),
    "/compare/ynab": between(ynab, monarch),
    "/compare/monarch": between(monarch, waypoint),
    "/compare/waypoint": between(waypoint, visible),
    "/press": between(press, llms),
    visibleLine: lines[visible].replace(/^Visible line on all three pages, under the table: "/, "").replace(/"$/, ""),
    llms: between(llms, lines.length),
  };
}

(async () => {
  const t = create();
  const A = await import("../scripts/ai-pages.mjs");
  const G = await import("../scripts/build-guides.mjs");
  const SEO = await import("../scripts/build-seo.mjs");
  const { textOf } = SEO;
  const W = approvedWords();

  // ── 0. The date ─────────────────────────────────────────────────────────────────────────────
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(A.AI_PAGES_DATE) && A.AI_PAGES_DATE >= "2026-11-24", `0a AI_PAGES_DATE is a day, on or after the words were approved (${A.AI_PAGES_DATE})`);
  const DATE = G.readableDate(A.AI_PAGES_DATE);
  t.ok(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(DATE), `0b shown as a date a person reads (${DATE})`);
  const fill = (s) => s.replace("[date it goes live]", DATE).replace(/\[date\]/g, DATE);

  // The site as `npm run build` makes it, past vite: build-guides writes the pages, the sitemap and robots.txt.
  const dist = tempDir("ai-pages");
  fs.writeFileSync(path.join(dist, "index.html"), "<html><head><title>x</title></head><body></body></html>");
  G.buildGuides(dist, { contentDir: path.join(ROOT, "content", "guides"), env: {} });
  const page = (p) => { const f = path.join(dist, `${p.slice(1)}.html`); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; };

  t.eq(A.AI_PAGES.map((p) => p.path), PATHS, "0c five pages, at the five addresses");
  const titles = new Set(), descriptions = new Set();
  for (const p of PATHS) {
    const html = page(p);
    t.ok(html.length > 1000, `1a ${p} is built (dist${p}.html)`);
    if (!html) continue;
    const text = textOf(html);

    // ── 1. The approved words, in order ───────────────────────────────────────────────────────
    let from = 0;
    const missing = [];
    for (const raw of W[p]) {
      if (/\|/.test(raw)) continue;                                     // a table row: section 3
      if (raw.startsWith("Sources: ")) {                                 // a list of links: each one is a link
        for (const u of raw.slice(9).split(" ; ")) if (!html.includes(`<a href="${u}">${u}</a>`)) missing.push(`link ${u}`);
        if (!text.includes("Sources:")) missing.push("Sources:");
        continue;
      }
      const said = fill(raw.replace(/^Title: /, ""));
      const i = text.indexOf(said, from);
      if (i < 0) missing.push(text.includes(said) ? `(out of order) ${said.slice(0, 70)}` : said.slice(0, 90));
      else from = i + said.length;
    }
    t.eq(missing, [], `1b ${p}: every approved line, word for word and in order`);
    if (p.startsWith("/compare/")) {
      const i = text.indexOf(W.visibleLine), tableEnd = textOf(html.slice(0, html.indexOf("</table>"))).length;
      t.ok(i >= tableEnd && i < text.indexOf("Our take:"), `1c ${p}: the approved line about the phone apps, under the table`);
    }

    // ── 2. The page ───────────────────────────────────────────────────────────────────────────
    const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || "";
    const description = (html.match(/<meta name="description" content="([^"]+)">/) || [])[1] || "";
    const h1 = textOf((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || "");
    t.ok(title && !titles.has(title) && title.length <= 60 && title.includes(h1.replace(/ \| flourish$/, "")), `2a ${p}: its own title, within 60 characters, naming the page (${title})`);
    titles.add(title);
    t.ok(description && !descriptions.has(description) && text.includes(description.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")), `2b ${p}: its own description, an approved line from the page`);
    descriptions.add(description);
    t.eq((html.match(/<h1>/g) || []).length, 1, `2c ${p}: one H1`);
    t.ok(html.includes(`<link rel="canonical" href="${SITE}${p}">`) && html.includes(`<meta property="og:url" content="${SITE}${p}">`), `2d ${p}: its canonical address`);
    t.ok(text.includes(`Last updated: ${DATE}`), `2e ${p}: "Last updated: ${DATE}" on the page`);
    t.ok(html.includes(`href="${APP_STORE}"`) && html.includes(`href="${PLAY}"`), `2f ${p}: links to both store pages`);
    t.ok(!/noindex/.test(html) && !/—/.test(html), `2g ${p}: indexable, no em dash`);
    t.ok([...html.matchAll(/<script\b[^>]*>/g)].every((m) => m[0] === '<script src="/clarity/loader.js" defer>' || m[0] === '<script type="application/ld+json">'), `2h ${p}: no script but the guides' Clarity loader and JSON-LD (the words are in the HTML)`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const asked = [...html.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => textOf(m[1]));
    if (p === "/best-budgeting-apps-canada") {
      t.ok(text.includes("Frequently asked questions") && asked.length === 4, `2i ${p}: the FAQ block, its questions as headings (${asked.length})`);
      t.eq(ld.map((b) => b["@type"]), ["FAQPage"], `2j ${p}: one JSON-LD block, FAQPage`);
      const faq = ld[0] || {};
      t.eq((faq.mainEntity || []).map((q) => q.name), asked, `2k ${p}: FAQPage holds exactly the questions the page shows, in order`);
      t.ok((faq.mainEntity || []).every((q) => q["@type"] === "Question" && q.acceptedAnswer?.["@type"] === "Answer" && text.includes(q.acceptedAnswer.text)), `2l ${p}: …each with the answer the page shows`);
      t.ok(faq["@context"] === "https://schema.org" && faq.url === `${SITE}${p}`, `2m ${p}: schema.org, at the page's address`);
      const faqStart = html.indexOf("Frequently asked questions");
      t.ok(faqStart > 0 && html.slice(0, faqStart).indexOf("<h3>") < 0, `2n ${p}: question headings only in the FAQ block`);
    } else {
      t.eq([ld.length, asked.length], [0, 0], `2i ${p}: no FAQ, so no FAQPage and no other JSON-LD`);
    }

    // ── 3. The comparison tables ──────────────────────────────────────────────────────────────
    const tableRows = W[p].filter((l) => /\|/.test(l)).map((l) => l.split(" | "));
    if (tableRows.length) {
      const tbl = html.slice(html.indexOf("<table"), html.indexOf("</table>") + 8);
      const head = [...tbl.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
      const body = [...tbl.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => textOf(m[1])));
      t.eq(head, tableRows[0], `3a ${p}: a real table, headed ${tableRows[0].join(" | ")}`);
      t.eq(body, tableRows.slice(1), `3b ${p}: every row, cell for cell (${tableRows.length - 1} rows)`);
      t.ok(/<th scope="row">/.test(tbl), `3c ${p}: each row is headed by its feature`);
    } else t.ok(!/<table/.test(html), `3a ${p}: no table where the words have none`);
  }

  // ── 4. /press: the downloads are the repo's own art ────────────────────────────────────────────
  {
    const html = page("/press");
    const links = [...html.matchAll(/<a href="(\/[^"]+\.(?:png|jpg))" download>/g)].map((m) => m[1]);
    t.ok(links.length >= 6 && links.every((u) => fs.existsSync(path.join(ROOT, "public", u))), `4a every download is a file the site serves (${links.length})`);
    const same = (a, b) => fs.readFileSync(a).equals(fs.readFileSync(b));
    const pub = (u) => path.join(ROOT, "public", u);
    t.ok(links.includes("/email/flourish-wordmark.png"), "4b the logo (light): the flourish wordmark the emails use");
    t.ok(links.includes("/press/flourish-logo-dark.png") && same(pub("/press/flourish-logo-dark.png"), path.join(ROOT, "ios-appicon", "icon-1024-dark.png")), "4c the logo (dark): the mark on its dark ground, the iOS dark icon's own file");
    t.ok(links.includes("/flourish-adult-app-icon-1024.png"), "4d the app icon, 1024 px");
    const shots = links.filter((u) => u.startsWith("/app-screens/"));
    t.ok(shots.length >= 3 && shots.length <= 5 && !shots.includes("/app-screens/hero-card.jpg"), `4e 3 to 5 screenshots, the landing's approved screens (${shots.length})`);
    const NEW = fs.readdirSync(pub("press"));
    t.eq(NEW, ["flourish-logo-dark.png"], "4f public/press holds one copied file and no new art");
    t.ok(textOf(html).includes("Example, sample data"), "4g the screenshots say they are sample data");
  }

  // ── 5. Sitemap, and an unknown address ──────────────────────────────────────────────────────────
  {
    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    for (const p of PATHS) t.ok(sitemap.includes(`<url><loc>${SITE}${p}</loc><lastmod>${A.AI_PAGES_DATE}</lastmod></url>`), `5a the sitemap lists ${p}`);
    // Netlify serves a real file first (/x as x.html), then the rules; the last rule, the SPA fallback, is unchanged.
    const toml = read("netlify.toml");
    const redirects = [...toml.matchAll(/\[\[redirects\]\]\s*\n\s*from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"\s*\n\s*status\s*=\s*(\d+)/g)].map((m) => [m[1], m[2], +m[3]]);
    t.eq(redirects[redirects.length - 1], ["/*", "/app.html", 200], "5b the SPA fallback is still the last rule");
    t.ok(!redirects.some(([from, to]) => /compare|press|best-budgeting/.test(from + to)), "5c no rule of its own: each page is a real file");
    const served = (p) => { const f = path.join(dist, p); if (fs.existsSync(f) && fs.statSync(f).isFile()) return p; if (fs.existsSync(`${f}.html`)) return `${p}.html`; if (fs.existsSync(path.join(f, "index.html"))) return `${p}/index.html`; return "app.html"; };
    t.eq(PATHS.map(served), PATHS.map((p) => `${p}.html`), "5d each address answers with its own page");
    t.eq(["/compare", "/compare/", "/compare/mint", "/press-kit", "/best-budgeting-apps", "/login", "/app"].map(served), Array(7).fill("app.html"), "5e an unknown address still gets the app shell, as before");
  }

  // ── 6. The home page's footer, and llms.txt ─────────────────────────────────────────────────────
  {
    const APP = read("src", "App.jsx");
    const foot = APP.slice(APP.indexOf('<div className="fll-foot">'), APP.indexOf("</div>", APP.indexOf('<a href="/guides/">Blog</a>')));
    const want = [["/best-budgeting-apps-canada", "Best budgeting apps in Canada"], ["/compare/ynab", "flourish vs YNAB"], ["/compare/monarch", "flourish vs Monarch"], ["/compare/waypoint", "flourish vs Waypoint"], ["/press", "Press kit"]];
    t.ok(want.every(([href, label]) => foot.includes(`<a href="${href}">${label}</a>`)), "6a the home page's footer links all five, by the approved llms.txt names");
    SEO.setStoreLinks({ appStore: APP_STORE, play: PLAY });
    const pages = { home: "", support: "", homeMeta: "" };
    const facts = SEO.LLMS_FACTS;
    for (const f of [facts.summary, facts.operator, ...facts.does]) pages[f.from] = `${pages[f.from]} ${f.text}`;
    const llms = SEO.buildLlms({ pages, guides: [] });
    const [where, pricing, compare] = W.llms.map((l) => l.replace(/^Under "Who it's for": /, "").replace(/^New "Pricing" section: /, "").replace(/^New "Compare" links: /, ""));
    t.ok(llms.includes(`Who it's for: Canadian households.\n${where}\n`), "6b llms.txt: \"Where to use it\", word for word, under \"Who it's for\"");
    t.ok(llms.includes(`## Pricing\n\n${pricing}\n`), "6c llms.txt: the Pricing section, word for word");
    const names = compare.replace(/\.$/, "").split(", ");
    const listed = [...llms.slice(llms.indexOf("## Compare")).matchAll(/^- \[([^\]]+)\]\(([^)]+)\)$/gm)].map((m) => [m[1], m[2]]);
    t.eq(listed.slice(0, 5), names.map((n, i) => [n, `${SITE}${PATHS[i]}`]), "6d llms.txt: the Compare links, by their approved names");
    t.ok(["# flourish Money", "## What it does", "## Get the app", "## Guides", "## About", "Contact: hello@flourishmoney.app"].every((s) => llms.includes(s)), "6e everything already in llms.txt is kept");
  }

  // ── 7. A store app holds none of it ─────────────────────────────────────────────────────────────
  {
    const { LANDING_ONLY } = await import("../scripts/strip-landing-media.mjs");
    t.ok(LANDING_ONLY.includes("press"), "7a a store build drops public/press");
    const pkg = JSON.parse(read("package.json")).scripts;
    t.ok(!/build-guides|ai-pages/.test(pkg["build:native"]), "7b build:native never builds the pages");
  }

  t.summary("AI PAGES (best apps, three comparisons, press, sitemap, footer, llms.txt)");
})();
