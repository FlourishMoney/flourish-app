#!/usr/bin/env node
// scripts/build-seo.mjs: the website readable without a script, for search engines and AI tools (2026-11-19).
// -----------------------------------------------------------------------------
// Called by scripts/build-guides.mjs, so `npm run build` (the website) runs it and build:native (a store app) never does.
//
// 1. THE HOME PAGE AND /support HOLD THEIR WORDS. Both are React screens, so their HTML used to be the app shell (42
//    characters of text). scripts/prerender-pages.mjs renders the app's own components (AuthScreen, SupportPage) at build
//    time, and the result goes inside #root of dist/index.html (served at "/") and dist/support.html (served at /support).
//    Nothing is written by hand, so the words are the app's words.
//    A browser that runs scripts never shows that copy: `@media (scripting: enabled)` hides it, and React's first render
//    replaces it, as it replaced the empty root before. So a visitor sees exactly what they saw before (the loading mark,
//    then the landing or the app); only a reader that runs no script reads the copy.
//    The landing follows TRIAL_PLAN_FIRST by the server's rule, read from this build's env, as index.html's descriptions do
//    (scripts/trial-first-meta.mjs): the switch takes effect only with a deploy, and that deploy runs this build.
// 2. THE APP SHELL STAYS AS IT WAS for every other address: dist/app.html is vite's index.html with nothing added, and
//    netlify.toml's SPA fallback serves it, so /privacy, /app or /login carry none of the landing's words or JSON-LD.
// 3. JSON-LD. The home page: Organization (flourish Money, Canada, sameAs both store pages) and one SoftwareApplication per
//    store, with no price and no rating. /get/: the same. /support: FAQPage, built from the list the page renders
//    (faqFor), so its questions and answers are the page's. Each guide's Article comes from build-guides.mjs.
// 4. /llms.txt: what flourish is, who it is for, what it does, the guides and the store pages. Every sentence of fact in
//    it is checked here against the rendered page it comes from; one that is not on that page stops the build.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { renderPages } from "./prerender-pages.mjs";
import { AI_PAGES, aiPageUrl } from "./ai-pages.mjs";

const require = createRequire(import.meta.url);
const { trialPlanFirstSince } = require("../netlify/functions/_lib/planRules.js");

export const SITE = "https://flourishmoney.app";
export const ORG_ID = `${SITE}/#organization`;
export const ORG_NAME = "flourish Money";
export const ROOT_EMPTY = '<div id="root"></div>';
// The copy is for readers that run no script. Any browser that runs scripts hides it until React replaces it.
export const PRERENDER_STYLE = "<style>@media (scripting: enabled) { #root > [data-prerender] { display: none !important; } }</style>";

const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

/** The visible text of an HTML string: no tags, scripts or styles, entities decoded, spaces collapsed. */
export function textOf(html) {
  return String(html)
    // Comments first (a comment may mention a <style>). React's text separators are comments and join the words either side.
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    // Inline tags join the words either side too; any other tag is a break between words.
    .replace(/<\/?(?:a|strong|em|b|i|span|code|small|sup|sub)(?:\s[^>]*)?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

// The store links come from src/lib/storeLinks.js, through the SSR render (prerender-entry.jsx), so there is one copy of
// each and this file never imports app code directly. Set by buildSeo before anything is written.
let APP_STORE_URL = "", PLAY_STORE_URL = "";
export function setStoreLinks(links) {
  if (!/^https:\/\/apps\.apple\.com\//.test(links?.appStore || "") || !/^https:\/\/play\.google\.com\//.test(links?.play || "")) throw new Error("build-seo: the store links did not come through");
  APP_STORE_URL = links.appStore; PLAY_STORE_URL = links.play;
}

export function organization() {
  return {
    "@type": "Organization", "@id": ORG_ID, name: ORG_NAME, url: `${SITE}/`,
    logo: `${SITE}/flourish-adult-app-icon-1024.png`,
    email: "hello@flourishmoney.app",
    address: { "@type": "PostalAddress", addressCountry: "CA" },
    areaServed: { "@type": "Country", name: "Canada" },
    sameAs: [APP_STORE_URL, PLAY_STORE_URL],
  };
}

// No offers and no aggregateRating: flourish publishes neither here (Amanda, 2026-11-19: no prices, no ratings we don't have).
export function apps() {
  const one = (os, url) => ({
    "@type": "SoftwareApplication", name: ORG_NAME, operatingSystem: os, applicationCategory: "FinanceApplication",
    url, downloadUrl: url, inLanguage: "en-CA", publisher: { "@id": ORG_ID },
    description: "Know what's safe to spend until payday.",
  });
  return [one("iOS", APP_STORE_URL), one("Android", PLAY_STORE_URL)];
}

export function faqPage(faq) {
  return {
    "@type": "FAQPage", "@id": `${SITE}/support#faq`, url: `${SITE}/support`,
    mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

const graph = (...nodes) => ({ "@context": "https://schema.org", "@graph": nodes });

/** The shell with the copy in #root, a canonical link and JSON-LD. Throws if the shell is not the one vite writes. */
export function withCopy(shell, { copy, canonical, ld }) {
  if (!shell.includes(ROOT_EMPTY)) throw new Error("build-seo: the shell has no empty #root to put the page's words in");
  if (!shell.includes("</head>")) throw new Error("build-seo: the shell has no </head>");
  const head = [`<link rel="canonical" href="${canonical}" />`, PRERENDER_STYLE, jsonLd(ld)].join("\n    ");
  return shell
    .replace("</head>", `  ${head}\n  </head>`)
    .replace(ROOT_EMPTY, `<div id="root"><div data-prerender="">${copy}</div></div>`);
}

export function addToHead(html, tag) {
  if (!html.includes("</head>")) throw new Error("build-seo: no </head>");
  return html.replace("</head>", `${tag}\n</head>`);
}

// /llms.txt. A fact line is { text, from }: the text must be on the page `from` names, word for word (checked in buildLlms).
export const LLMS_FACTS = {
  summary: { text: "A Canadian money app where safe to spend is built around your paydays.", from: "homeMeta" },
  does: [
    { label: "Safe to spend until payday", text: "flourish accounts for bills due before payday, your minimum debt payments, a buffer and a savings amount, then shows what's safe to spend. You can see how it adds up.", from: "home" },
    { label: "Bills and paydays", text: "Every bill and payday, up to 90 days ahead", from: "home" },
    { label: "Money meeting", text: "A 15-minute weekly money meeting", from: "home" },
    { label: "What the money meeting is", text: "A short, structured check-in on the week: what went well, what changed, what is coming. Flourish writes the agenda from your numbers, and you and your coach work through it.", from: "support" },
    { label: "What-If Simulator", text: "Test a decision, like a big purchase or an extra debt payment, and see the result before you commit.", from: "home" },
    { label: "AI Coach", text: "The coach explains the numbers flourish calculates and your options, and leaves the decisions to you. It isn't a licensed adviser.", from: "home" },
    { label: "Built in Canada", text: "flourish speaks Canadian: chequing, not checking. It includes Canadian terms and programs like the RRSP, TFSA and the Canada Child Benefit.", from: "home" },
    { label: "Bank connections", text: "Bank connections are read-only, so flourish can't move your money.", from: "home" },
    { label: "Without a bank connection", text: "Import a PDF or CSV statement, or enter your numbers by hand. Everything works without a bank connection.", from: "support" },
  ],
  operator: { text: "flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0.", from: "home" },
};

// Approved word for word (docs/product/AI-VISIBILITY-WORDS.md, item 6, 2026-11-24). Not on a page in these words, so
// they are held here and by tests/aiPages.test.cjs, not checked against a page.
export const LLMS_APPROVED = {
  where: "Where to use it: iPhone, Android, and in a browser at flourishmoney.app.",
  pricing: "The free plan, or a flourish subscription at $11.99 a month or $99.99 a year in Canadian dollars, plus tax. Eligible new subscribers get 14 days free with payment details required, then it renews at the listed price unless cancelled. On the website, the free plan doesn't connect a bank.",
};

export function buildLlms({ pages, guides }) {
  const check = (f) => {
    const on = pages[f.from];
    if (typeof on !== "string") throw new Error(`build-seo: llms.txt names a page it was not given (${f.from})`);
    if (!on.includes(f.text)) throw new Error(`build-seo: llms.txt says "${f.text}", which is not on ${f.from}`);
    return f.text;
  };
  const F = LLMS_FACTS;
  return [
    `# ${ORG_NAME}`,
    "",
    `> ${check(F.summary)}`,
    "",
    "Who it's for: Canadian households.",
    LLMS_APPROVED.where,
    "",
    "## What it does",
    "",
    ...F.does.map((f) => { const said = check(f); return `- ${f.label}: ${said}${/[.!?]$/.test(said) ? "" : "."}`; }),
    "",
    "## Pricing",
    "",
    LLMS_APPROVED.pricing,
    "",
    "## Compare",
    "",
    ...AI_PAGES.map((p) => `- [${p.llmsName}](${aiPageUrl(p)})`),
    "",
    "## Get the app",
    "",
    `- [flourish on the App Store](${APP_STORE_URL})`,
    `- [flourish on Google Play](${PLAY_STORE_URL})`,
    "",
    "## Guides",
    "",
    ...guides.map((g) => `- [${g.title}](${SITE}/guides/${g.slug}/): ${g.description}`),
    "",
    "## About",
    "",
    `- ${check(F.operator)}`,
    "- Contact: hello@flourishmoney.app",
    `- [Support, questions and answers](${SITE}/support)`,
    `- [Privacy](${SITE}/privacy)`,
    `- [Terms](${SITE}/terms)`,
    "",
  ].join("\n");
}

/**
 * Write the pages. dist must already hold vite's index.html (with build-guides' verification tags) and /get/.
 * render: for tests, a stand-in for renderPages; published: the published guides, newest first.
 */
export function buildSeo(dist, { env = process.env, published = [], render = renderPages } = {}) {
  const indexPath = path.join(dist, "index.html");
  const shell = fs.readFileSync(indexPath, "utf8");
  if (shell.includes("data-prerender")) throw new Error("build-seo: dist/index.html already holds a copy (run on a fresh vite build)");
  const tpfOn = trialPlanFirstSince(env) !== null;
  const { home, support, faq, stores } = render({ tpfOn, env });
  setStoreLinks(stores);
  if (textOf(home).length < 1500 || textOf(support).length < 1000) throw new Error("build-seo: a rendered page came out nearly empty");
  for (const { q, a } of faq) if (!textOf(support).includes(q) || !textOf(support).includes(a)) throw new Error(`build-seo: /support does not show "${q}" and its answer`);

  fs.writeFileSync(path.join(dist, "app.html"), shell);
  fs.writeFileSync(indexPath, withCopy(shell, { copy: home, canonical: `${SITE}/`, ld: graph(organization(), ...apps()) }));
  fs.writeFileSync(path.join(dist, "support.html"), withCopy(shell, { copy: support, canonical: `${SITE}/support`, ld: graph(faqPage(faq), { "@id": ORG_ID, "@type": "Organization", name: ORG_NAME }) }));

  const getPath = path.join(dist, "get", "index.html");
  if (fs.existsSync(getPath)) fs.writeFileSync(getPath, addToHead(fs.readFileSync(getPath, "utf8"), jsonLd(graph(organization(), ...apps()))));

  const homeMeta = (shell.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const llms = buildLlms({ pages: { home: textOf(home), support: textOf(support), homeMeta: textOf(homeMeta) }, guides: published });
  fs.writeFileSync(path.join(dist, "llms.txt"), llms);
  return { tpfOn, homeChars: textOf(home).length, supportChars: textOf(support).length, faq: faq.length };
}
