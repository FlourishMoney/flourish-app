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
// THE TWO VERIFICATION TAGS come from PINTEREST_DOMAIN_VERIFY and GOOGLE_SITE_VERIFICATION at build time, so a new value
// needs a new deploy. Unset means no tag. netlify.toml's SECRETS_SCAN_OMIT_KEYS lists both, because these values are meant
// to appear in the page and Netlify's scanner would otherwise stop the build.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = "https://flourishmoney.app";
export const AUTHOR = "flourish team";
export const SAMPLE_LABEL = "Example, sample data";
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
    else fail(`unknown block ${b.type}`);
  }
  if (g.status === "published" && !g.body.some((b) => b.type === "p" && /<a href="https:\/\//.test(b.html))) fail("a published guide needs at least one inline source link");
  return g;
}

export function readableDate(iso) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

const STYLE = `<style>
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
  ul.guides { list-style: none; padding: 0; }
  ul.guides li { background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 16px; margin: 0 0 12px; }
  ul.guides p { margin: 4px 0 0; font-size: 15px; color: var(--muted); }
  footer { color: var(--muted); font-size: 14px; padding-top: 16px; padding-bottom: 40px; border-top: 1px solid var(--rule); margin-top: 40px; }
</style>`;

const FOOT = `<footer>
  <p>flourish is operated by GrowSmart Inc. <a href="/newsletter/">Canadian money dates this week</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a></p>
</footer>`;

function shell({ head, body, tags }) {
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
    "</head>",
    "<body>",
    '<header><a href="/guides/" style="text-decoration:none">flourish guides</a></header>',
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
    publisher: { "@type": "Organization", name: "flourish", logo: { "@type": "ImageObject", url: `${SITE}/flourish-adult-app-icon-180.png` } },
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
    return `<figure><img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${Number(b.width)}" height="${Number(b.height)}" loading="lazy"><figcaption>${SAMPLE_LABEL}</figcaption></figure>`;
  }).join("\n");
  const body = `<main>
${g.status === "draft" ? '<p class="draft">Draft, not published.</p>\n' : ""}<h1>${esc(g.title)}</h1>
<p class="meta">Last updated ${readableDate(g.updatedAt)}. Written and reviewed by the ${AUTHOR}.</p>
${blocks}
<section class="checked"><h2>How we checked this</h2><p>${esc(g.howWeChecked)}</p></section>
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

export function renderSitemap(published) {
  const newest = published.map((g) => g.updatedAt).sort().pop();
  const row = (loc, lastmod) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    row(`${SITE}/`),
    row(`${SITE}/guides/`, newest),
    ...published.map((g) => row(guideUrl(g.slug), g.updatedAt)),
    "</urlset>",
    "",
  ].join("\n");
}

export const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`;

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
  write("robots.txt", ROBOTS);
  const index = path.join(dist, "index.html");
  fs.writeFileSync(index, addTagsToHead(fs.readFileSync(index, "utf8"), tags));
  return { guides: guides.length, published: published.length, tags: tags.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const r = buildGuides(path.join(root, "dist"), { contentDir: path.join(root, "content", "guides") });
  console.log(`  ✓ guides: ${r.guides} (${r.published} published), robots.txt, sitemap.xml, ${r.tags} verification tag${r.tags === 1 ? "" : "s"}`);
}
