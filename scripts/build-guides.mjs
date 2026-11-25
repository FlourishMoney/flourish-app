#!/usr/bin/env node
// scripts/build-guides.mjs: the website's guides, robots.txt, sitemap.xml and verification tags (2026-11-04).
// -----------------------------------------------------------------------------
// `npm run build` (which Netlify runs) calls this after vite build. build:native never does, so a store app holds none
// of these. Each content/guides/<slug>.json becomes dist/guides/<slug>/index.html, a plain static page: no app, no script.
//
// A DRAFT (status "draft") gets its page with noindex, and is left out of the index page and the sitemap. A guide is not
// allowed to publish without a title and description that fit, a "How we checked this" note and at least one source link
// (checkGuide throws, so the build stops). Every app screen carries the "Example, sample data" label, from the template.
//
// A BODY IS MADE OF BLOCKS: h2, p, ul (items), table (headers and rows; a table of five or more columns is laid out one
// row per card on a phone, each value under its column's name, so nothing is cut off at 390 wide) and screen. A guide may
// also list its sources (label and https link), shown under "How we checked this". The first three guides went live on
// 2026-11-18; their screens and link-preview images are in public/guide-media, which a store build drops.
//
// THE TWO VERIFICATION TAGS come from PINTEREST_DOMAIN_VERIFY and GOOGLE_SITE_VERIFICATION at build time, so a new value
// needs a new deploy. Unset means no tag. netlify.toml's SECRETS_SCAN_OMIT_KEYS lists both, because these values are meant
// to appear in the page and Netlify's scanner would otherwise stop the build.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The AI pages (2026-11-24): written here with this file's shell and date format, which buildAiPages is handed (ai-pages.mjs
// imports nothing from this file, so there is no import cycle).
import { AI_PAGES, AI_PAGES_DATE, buildAiPages } from "./ai-pages.mjs";

export const SITE = "https://flourishmoney.app";
export const AUTHOR = "flourish team";
export const SAMPLE_LABEL = "Example, sample data";
export const CLARITY_LOADER = '<script src="/clarity/loader.js" defer></script>';
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;
const SLUG_RX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_RX = /^[A-Za-z0-9_-]{1,128}$/;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// In a <script> block, "<" could close the block, so it is written as an escape.
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

export function verificationTags(env = process.env) {
  const tags = [];
  const add = (attr, name, raw) => {
    const v = String(raw || "").trim();
    if (!v) return;
    if (!TOKEN_RX.test(v)) throw new Error(`${name}: the value holds characters a verification token never has`);
    tags.push(`<meta name="${attr}" content="${v}" />`);
  };
  add("p:domain_verify", "PINTEREST_DOMAIN_VERIFY", env.PINTEREST_DOMAIN_VERIFY);
  add("google-site-verification", "GOOGLE_SITE_VERIFICATION", env.GOOGLE_SITE_VERIFICATION);
  return tags;
}

// Bing's site verification for flourishmoney.app (Amanda, 2026-11-19: keep it forever). Fixed, not from the env: it goes in
// the home page's <head> on every web build (and so in the pre-rendered page, scripts/build-seo.mjs). A store build never
// runs this file, so a store app has no such tag.
export const BING_VERIFY_TAG = '<meta name="msvalidate.01" content="8665BCCF8A22172D93F3B582F074EAA2" />';

export function addTagsToHead(html, tags) {
  if (!tags.length) return html;
  if (!html.includes("</head>")) throw new Error("no </head> to add the verification tags to");
  return html.replace("</head>", `${tags.join("\n    ")}\n  </head>`);
}

export function checkGuide(g) {
  const fail = (why) => { throw new Error(`guide ${g.slug || "(no slug)"}: ${why}`); };
  if (!SLUG_RX.test(g.slug || "")) fail("the slug must be lowercase words joined by hyphens");
  if (g.status !== "draft" && g.status !== "published") fail('status must be "draft" or "published"');
  for (const k of ["title", "seoTitle", "description", "image", "howWeChecked"]) if (typeof g[k] !== "string" || !g[k].trim()) fail(`${k} is missing`);
  if (g.seoTitle.length > TITLE_MAX) fail(`seoTitle is over ${TITLE_MAX} characters`);
  if (g.description.length > DESCRIPTION_MAX) fail(`description is over ${DESCRIPTION_MAX} characters`);
  if (!DATE_RX.test(g.publishedAt || "") || !DATE_RX.test(g.updatedAt || "")) fail("publishedAt and updatedAt must be YYYY-MM-DD");
  if (!Array.isArray(g.body) || !g.body.length) fail("the body is empty");
  for (const b of g.body) {
    if (b.type === "screen") { if (!b.src || !b.alt || !b.width || !b.height) fail("a screen needs src, alt, width and height"); }
    else if (b.type === "h2") { if (!b.text) fail("an h2 needs text"); }
    else if (b.type === "p") { if (!b.html) fail("a paragraph needs html"); }
    else if (b.type === "ul") { if (!Array.isArray(b.items) || !b.items.length || b.items.some((i) => typeof i !== "string" || !i.trim())) fail("a list needs items"); }
    else if (b.type === "table") {
      if (!Array.isArray(b.headers) || b.headers.length < 2 || b.headers.some((h) => typeof h !== "string" || !h.trim())) fail("a table needs at least two headers");
      if (!Array.isArray(b.rows) || !b.rows.length || b.rows.some((r) => !Array.isArray(r) || r.length !== b.headers.length || r.some((c) => typeof c !== "string" || !c.trim()))) fail("every table row needs one cell per header");
    }
    else fail(`unknown block ${b.type}`);
  }
  if (g.sources !== undefined) {
    if (!Array.isArray(g.sources) || !g.sources.length) fail("sources, when given, must be a list");
    for (const src of g.sources) if (!src || typeof src.label !== "string" || !src.label.trim() || !/^https:\/\/[^\s"<>]+$/.test(src.url || "")) fail("a source needs a label and an https link");
  }
  if (g.status === "published" && !g.body.some((b) => b.type === "p" && /<a href="https:\/\//.test(b.html))) fail("a published guide needs at least one inline source link");
  return g;
}

export function readableDate(iso) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

export const STYLE = `<style>
  :root { --page: #F4F1EB; --card: #FFFFFF; --ink: #1A2035; --muted: #5B6170; --rule: #E6E1D8; --brand: #007048; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --page: #12151E; --card: #1A1F2B; --ink: #F4F1EB; --muted: #B4B9C6; --rule: #2A3142; --brand: #4FD1A0; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--page); color: var(--ink); font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 17px; line-height: 1.65; }
  main, header, footer { max-width: 680px; margin: 0 auto; padding: 0 16px; }
  header { padding-top: 20px; font-weight: 800; }
  a { color: var(--brand); }
  a:focus-visible { outline: 3px solid var(--brand); outline-offset: 3px; }
  h1 { font-size: 32px; line-height: 1.2; margin: 28px 0 12px; overflow-wrap: anywhere; }
  h2 { font-size: 22px; line-height: 1.3; margin: 32px 0 8px; }
  .meta { color: var(--muted); font-size: 14px; margin: 0 0 24px; }
  .draft { background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 10px 14px; font-size: 14px; font-weight: 700; margin-top: 20px; }
  figure { margin: 24px 0; }
  figure img { display: block; max-width: 100%; height: auto; max-height: 560px; width: auto; border-radius: 12px; border: 1px solid var(--rule); }
  figcaption { color: var(--muted); font-size: 14px; margin-top: 8px; font-weight: 600; }
  .checked { background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 16px; margin: 32px 0; }
  .checked h2 { font-size: 17px; margin: 0 0 6px; }
  .checked p { margin: 0; font-size: 15px; }
  .checked p + p { margin-top: 12px; }
  .checked ul { margin: 6px 0 0; padding-left: 20px; font-size: 15px; }
  .checked li { margin: 0 0 6px; overflow-wrap: anywhere; }
  main ul { padding-left: 22px; }
  main li { margin: 0 0 8px; }
  main p, main li, main td, main th { overflow-wrap: break-word; }
  .tablewrap { margin: 20px 0; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--rule); border-radius: 12px; font-size: 15px; line-height: 1.45; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
  th { font-size: 14px; color: var(--muted); font-weight: 700; }
  tbody tr:last-child td { border-bottom: 0; }
  @media (max-width: 360px) { table { font-size: 14px; } th, td { padding: 8px; } th { font-size: 13px; } }
  @media (max-width: 640px) {
    table.stack, table.stack tbody, table.stack tr, table.stack td { display: block; width: 100%; }
    table.stack { border: 0; background: none; }
    table.stack thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    table.stack tr { background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 6px 0; margin: 0 0 12px; }
    table.stack td { border-bottom: 0; padding: 6px 14px; }
    table.stack td::before { content: attr(data-label); display: block; font-size: 13px; font-weight: 700; color: var(--muted); }
  }
  ul.guides { list-style: none; padding: 0; }
  ul.guides li { background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 16px; margin: 0 0 12px; }
  ul.guides p { margin: 4px 0 0; font-size: 15px; color: var(--muted); }
  footer { color: var(--muted); font-size: 14px; padding-top: 16px; padding-bottom: 40px; border-top: 1px solid var(--rule); margin-top: 40px; }
</style>`;

const FOOT = `<footer>
  <p>flourish is operated by GrowSmart Inc.</p>
  <p><a href="/newsletter/">Canadian money dates</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a></p>
</footer>`;

// The guides' header; the AI pages (scripts/ai-pages.mjs) pass the home page's instead.
export const GUIDES_HEADER = '<header><a href="/guides/" style="text-decoration:none">flourish guides</a></header>';

export function shell({ head, body, tags, header = GUIDES_HEADER }) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    head,
    ...tags,
    '<link rel="icon" href="/flourish-adult-favicon-32.png">',
    STYLE,
    // Microsoft Clarity's loader (public/clarity/loader.js, 2026-11-06): the only script that runs on a guide page. It
    // loads Clarity after the page is interactive, where the edge allows it, and never inside a store app.
    CLARITY_LOADER,
    "</head>",
    "<body>",
    header,
    body,
    FOOT,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export const guideUrl = (slug) => `${SITE}/guides/${slug}/`;

export function renderGuide(g, tags = []) {
  const url = guideUrl(g.slug);
  const image = new URL(g.image, SITE).href;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    image,
    url,
    mainEntityOfPage: url,
    datePublished: g.publishedAt,
    dateModified: g.updatedAt,
    author: { "@type": "Organization", name: AUTHOR },
    // The same Organization as the home page's JSON-LD (scripts/build-seo.mjs), by its @id.
    publisher: { "@type": "Organization", "@id": `${SITE}/#organization`, name: "flourish Money", logo: { "@type": "ImageObject", url: `${SITE}/flourish-adult-app-icon-180.png` } },
  };
  const head = [
    `<title>${esc(g.seoTitle)}</title>`,
    `<meta name="description" content="${esc(g.description)}">`,
    `<link rel="canonical" href="${url}">`,
    g.status === "draft" ? '<meta name="robots" content="noindex">' : "",
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="flourish">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(g.title)}">`,
    `<meta property="og:description" content="${esc(g.description)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="article:published_time" content="${g.publishedAt}">`,
    `<meta property="article:modified_time" content="${g.updatedAt}">`,
    `<meta property="article:author" content="${AUTHOR}">`,
    `<script type="application/ld+json">${jsonLd(schema)}</script>`,
  ].filter(Boolean).join("\n");
  const blocks = g.body.map((b) => {
    if (b.type === "h2") return `<h2>${esc(b.text)}</h2>`;
    if (b.type === "p") return `<p>${b.html}</p>`;
    if (b.type === "ul") return `<ul>\n${b.items.map((i) => `<li>${i}</li>`).join("\n")}\n</ul>`;
    if (b.type === "table") {
      const head = b.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
      const rows = b.rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(b.headers[i])}">${c}</td>`).join("")}</tr>`).join("\n");
      return `<div class="tablewrap"><table${b.headers.length >= 5 ? ' class="stack"' : ""}>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table></div>`;
    }
    return `<figure><img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${Number(b.width)}" height="${Number(b.height)}" loading="lazy"><figcaption>${SAMPLE_LABEL}</figcaption></figure>`;
  }).join("\n");
  const sources = g.sources ? `\n<p>Sources:</p>\n<ul>\n${g.sources.map((src) => `<li>${esc(src.label)}: <a href="${esc(src.url)}">${esc(src.url)}</a></li>`).join("\n")}\n</ul>\n` : "";
  const body = `<main>
${g.status === "draft" ? '<p class="draft">Draft, not published.</p>\n' : ""}<h1>${esc(g.title)}</h1>
<p class="meta">Last updated ${readableDate(g.updatedAt)}. ${g.status === "draft" ? "Draft template" : "Written"} by the ${AUTHOR}.</p>
${blocks}
<section class="checked"><h2>How we checked this</h2><p>${esc(g.howWeChecked)}</p>${sources}</section>
</main>`;
  return shell({ head, body, tags });
}

export function renderIndex(published, tags = []) {
  const url = `${SITE}/guides/`;
  const title = "Guides | flourish";
  const description = "Plain guides to money in Canada from the flourish team.";
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="flourish">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${SITE}/app-screens/hero-card.jpg">`,
  ].join("\n");
  const list = published.length
    ? `<ul class="guides">\n${published.map((g) => `<li><a href="/guides/${g.slug}/">${esc(g.title)}</a><p>${esc(g.description)}</p></li>`).join("\n")}\n</ul>`
    : "<p>The first guides are on the way.</p>";
  return shell({ head, body: `<main>\n<h1>Guides</h1>\n${list}\n</main>`, tags });
}

export const SITEMAP_PAGES = ["/support", "/privacy", "/terms", "/newsletter/"];

export function renderSitemap(published) {
  const newest = published.map((g) => g.updatedAt).sort().pop();
  const row = (loc, lastmod) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    row(`${SITE}/`),
    row(`${SITE}/guides/`, newest),
    ...published.map((g) => row(guideUrl(g.slug), g.updatedAt)),
    // The other public pages (2026-11-19). /get/ is left out: it is a redirect to the stores and says noindex.
    ...SITEMAP_PAGES.map((p) => row(`${SITE}${p}`)),
    // The AI visibility pages (scripts/ai-pages.mjs, 2026-11-24), each dated by the day its words went live.
    ...AI_PAGES.map((p) => row(`${SITE}${p.path}`, AI_PAGES_DATE)),
    "</urlset>",
    "",
  ].join("\n");
}

// Every reader may read the public pages; /api/ is the functions, not pages. The search and AI crawlers are named too
// (2026-11-19), each with the same two rules: a crawler that finds a group with its own name follows only that group.
export const NAMED_CRAWLERS = ["Bingbot", "OAI-SearchBot", "GPTBot", "PerplexityBot", "Google-Extended"];
export const ROBOTS = [
  ...["*", ...NAMED_CRAWLERS].map((ua) => `User-agent: ${ua}\nAllow: /\nDisallow: /api/\n`),
  `Sitemap: ${SITE}/sitemap.xml`,
  "",
].join("\n");

export function readGuides(dir) {
  const guides = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const g = checkGuide(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    if (`${g.slug}.json` !== f) throw new Error(`guide ${f}: the file name must match its slug`);
    return g;
  });
  return guides;
}

export function buildGuides(dist, { contentDir, env = process.env } = {}) {
  const guides = readGuides(contentDir);
  const published = guides.filter((g) => g.status === "published").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const tags = verificationTags(env);
  const write = (rel, text) => {
    const p = path.join(dist, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  };
  write("guides/index.html", renderIndex(published, tags));
  for (const g of guides) write(`guides/${g.slug}/index.html`, renderGuide(g, tags));
  write("sitemap.xml", renderSitemap(published));
  const aiPages = buildAiPages(dist, { tags, shell, readableDate });
  write("robots.txt", ROBOTS);
  const index = path.join(dist, "index.html");
  fs.writeFileSync(index, addTagsToHead(fs.readFileSync(index, "utf8"), [BING_VERIFY_TAG, ...tags]));
  return { guides: guides.length, published: published.length, tags: tags.length, aiPages: aiPages.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const r = buildGuides(path.join(root, "dist"), { contentDir: path.join(root, "content", "guides") });
  console.log(`  ✓ guides: ${r.guides} (${r.published} published), ${r.aiPages} AI pages, robots.txt, sitemap.xml, ${r.tags} verification tag${r.tags === 1 ? "" : "s"}`);
  // The home page's and /support's words in their HTML, JSON-LD and /llms.txt (scripts/build-seo.mjs, 2026-11-19).
  const { buildSeo } = await import("./build-seo.mjs");
  const published = readGuides(path.join(root, "content", "guides")).filter((g) => g.status === "published").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const s = buildSeo(path.join(root, "dist"), { published });
  console.log(`  ✓ seo: home ${s.homeChars} and /support ${s.supportChars} characters of text in the HTML (trial-plan-first ${s.tpfOn ? "on" : "off"}), ${s.faq} questions, llms.txt`);
}
