#!/usr/bin/env node
// scripts/ai-pages.mjs: the AI visibility pages (2026-11-24).
// -----------------------------------------------------------------------------
// Five plain pages, built after vite by scripts/build-guides.mjs (so `npm run build` makes them and build:native never
// does): /best-budgeting-apps-canada, /compare/ynab, /compare/monarch, /compare/waypoint and /press. Each is a real file
// (dist/<path>.html), so Netlify serves it ahead of the SPA fallback and every other address behaves as before. They
// read without a script, like the guides, in the guides' page shell, with the home page's header.
//
// THE WORDS are the approved round 4 (docs/product/AI-VISIBILITY-WORDS.md), word for word; tests/aiPages.test.cjs holds
// every line of each page to that record. [date] is AI_PAGES_DATE, the go-live day in Toronto: if the pages go live on
// another day, change that one line (the "Last updated" dates, "checked against its published pages on" and the
// sitemap's dates all follow it) and run the gate again before the deploy.
//
// JSON-LD: FAQPage only, on the one page with questions, holding exactly the questions and answers the page shows.
// The comparisons are real tables. /press links the repo's existing art (no new art): the wordmark the emails use, the
// mark on its dark ground (the iOS dark icon's own file, copied into public/press), the 1024 px app icon and the
// landing's four app screens.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { APP_STORE_URL, PLAY_STORE_URL, STORE_BADGES } from "../src/lib/storeLinks.js";
import { SITE, shell, readableDate } from "./build-guides.mjs";

// The go-live day (Toronto). See the note above.
export const AI_PAGES_DATE = "2026-11-24";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const link = (u) => `<a href="${esc(u)}">${esc(u)}</a>`;
// "Label: words", the label in bold. The text is the approved line, unchanged.
const labelled = (label, text) => `<strong>${esc(label)}</strong> ${esc(text)}`;
const DATE = "[date]";
const filled = (s, date) => s.split(DATE).join(date);

// ── The words (docs/product/AI-VISIBILITY-WORDS.md) ─────────────────────────────────────────────────────────────────
const PHONE_APPS_LINE = "On these pages, the flourish trial and free-plan details describe the website. In the iPhone and Android apps, every new account can use all features for its first 14 days, then the free plan applies.";

const BEST = {
  path: "/best-budgeting-apps-canada",
  llmsName: "best budgeting apps in Canada",
  h1: "Best budgeting apps in Canada (2026)",
  title: "Best budgeting apps in Canada (2026) | flourish",
  description: "We looked at budgeting apps available to Canadian households, using each company's published pricing and feature information.",
  blocks: [
    { p: "We make flourish, so we've included it in this comparison. We looked at budgeting apps available to Canadian households, using each company's published pricing and feature information. Prices and features can change, and bank connections depend on your institution." },
    { h2: "How we picked" },
    { p: "We looked for apps Canadians can use with manual entry or supported bank connections. We compared pricing, budgeting methods, household features and how each app helps you plan upcoming expenses." },
    { h2: "flourish (our app)" },
    { facts: [
      ["Best for:", "Planning around your paycheques and seeing what's safe to spend until payday."],
      ["Price:", "The free plan, or $11.99 a month or $99.99 a year CAD, plus tax. Eligible new subscribers get a 14-day subscription trial with payment details required. The subscription renews unless cancelled."],
      ["Platforms:", "iPhone, Android and browser."],
      ["Bank connections:", "Read-only through Plaid with a subscription. The website's free plan uses manual entry."],
      ["What stands out:", "A safe-to-spend calculation that lists bills, minimum debt payments, a buffer and a savings amount. Also a 90-day forecast, the What-If Simulator and an optional weekly money meeting."],
    ] },
    { h2: "YNAB" },
    { facts: [
      ["Best for:", "People who want a hands-on budgeting method that assigns money to specific jobs."],
      ["Price:", "US$14.99 a month or US$109 a year, plus applicable tax. A 34-day trial is available. No ongoing free plan."],
      ["Platforms:", "iPhone, Android and browser."],
      ["Bank connections:", "Supported Canadian banks through Plaid or MX. Manual entry is available."],
      ["What stands out:", "Its structured budgeting method and YNAB Together, which lets up to six people share one subscription."],
    ], source: "https://www.ynab.com/pricing" },
    { h2: "Monarch Money" },
    { facts: [
      ["Best for:", "People who want budgets, account balances and investments together."],
      ["Price:", "Core costs US$14.99 a month or US$99.99 a year. Plus costs US$199.99 a year. Applicable taxes are extra. A 7-day trial is available and requires payment details."],
      ["Platforms:", "iPhone, Android and browser."],
      ["Bank connections:", "Plaid, MX and Mastercard Connect. Canadian bank support varies by institution. Manual entry is available."],
      ["What stands out:", "A broad view of household finances, including investments, reports and shared household access."],
    ], source: "https://www.monarch.com/pricing" },
    { h2: "Waypoint Budget" },
    { facts: [
      ["Best for:", "People who want a Canadian budgeting app with a free plan, Safe to Spend and lower-priced bank connections."],
      ["Price:", "The free plan; Plus at CA$7.99 a month or CA$79.99 a year; Pro at CA$12.99 a month or CA$129.99 a year. Its paid plans have a 7-day trial."],
      ["Platforms:", "iPhone, Android and browser."],
      ["Bank connections:", "Plaid and Flinks. Plus connects one bank; Pro supports unlimited connections under its terms. The free plan uses manual entry or imports."],
      ["What stands out:", "Safe to Spend on the free plan, five daily coach messages, and household sharing on Pro."],
    ], source: "https://waypointbudget.com/pricing" },
    { h2: "A spreadsheet" },
    { facts: [
      ["Best for:", "People who want full control without paying for a budgeting app."],
      ["Price:", "No subscription required if you use a spreadsheet tool available to you at no cost."],
      ["Trade-off:", "You'll need to enter and maintain your own numbers, calculations and upcoming payments."],
    ] },
  ],
  faq: [
    { q: "Which budgeting app is best if I live paycheque to paycheque?", a: "Look for one that helps you plan around the dates you receive income and the bills due between those dates. flourish calculates what's safe to spend until your next payday. Other apps, including Waypoint, also offer spending-availability tools, so compare how their calculations work." },
    { q: "Do I have to connect my bank?", a: "No. flourish, YNAB, Monarch and Waypoint all support manual entry. Automatic bank connections can reduce typing, but availability varies by app, plan and financial institution." },
    { q: "Are prices in Canadian dollars?", a: "flourish and Waypoint bill Canadian customers in CAD. YNAB and Monarch list their subscriptions in USD, so the amount paid in CAD can change with exchange rates. Your card issuer may also charge a foreign transaction fee." },
    { q: "Do these apps support couples?", a: "Yes, with different arrangements. flourish supports a shared household with separate sign-ins. YNAB Together supports up to six people under one subscription. Monarch supports household members under one subscription. Waypoint offers household sharing on Pro." },
  ],
};

const YNAB = {
  path: "/compare/ynab",
  llmsName: "flourish vs YNAB",
  h1: "flourish vs YNAB (2026)",
  title: "flourish vs YNAB (2026)",
  shortAnswer: "Choose YNAB if you want a structured method for assigning your money to categories and planning ahead. Choose flourish if you prefer a safe-to-spend number calculated around your payday, with Canadian terms and CAD subscription pricing.",
  table: [
    ["Feature", "flourish", "YNAB"],
    ["Monthly price", "CA$11.99 + tax", "US$14.99 + applicable tax"],
    ["Annual price", "CA$99.99 + tax", "US$109 + applicable tax"],
    ["Free option", "The free plan", "No ongoing free plan"],
    ["Free trial", "14 days for eligible new subscribers, payment details required", "34 days; no card required when signing up directly"],
    ["Billing currency", "CAD", "USD"],
    ["Platforms", "iPhone, Android, browser", "iPhone, Android, browser"],
    ["Bank connections", "Plaid on a subscription", "Plaid or MX for supported Canadian banks"],
    ["Household sharing", "Yes, separate sign-ins", "Yes, up to six people through YNAB Together"],
    ["Built in Canada", "Yes", "No"],
  ],
  ourTake: "YNAB offers a structured budgeting method and a broad set of tools for working together. flourish focuses on the amount available until payday, with bills, minimum debt payments, a buffer and a savings amount shown in the calculation.",
  more: [],
  checked: `We make flourish. YNAB information was checked against its published pages on ${DATE}.`,
  sources: ["https://www.ynab.com/pricing", "https://support.ynab.com/en_us/which-direct-import-provider-SkcusCQeWe", "https://support.ynab.com/en_us/ynab-together-B1nS78Cki"],
  trademark: "YNAB is a trademark of its owner. This comparison is independent and is not endorsed by YNAB.",
};

const MONARCH = {
  path: "/compare/monarch",
  llmsName: "flourish vs Monarch",
  h1: "flourish vs Monarch Money (2026)",
  title: "flourish vs Monarch Money (2026)",
  shortAnswer: "Choose Monarch if you want a broad view of your budget, accounts and investments, with detailed reports and household sharing. Choose flourish if your main question is what's safe to spend until your next payday.",
  table: [
    ["Feature", "flourish", "Monarch Money"],
    ["Monthly price", "CA$11.99 + tax", "Core US$14.99 + applicable tax"],
    ["Annual price", "CA$99.99 + tax", "Core US$99.99 or Plus US$199.99 + applicable tax"],
    ["Free option", "The free plan", "No ongoing free plan"],
    ["Free trial", "14 days for eligible new subscribers, payment details required", "7 days, payment details required"],
    ["Billing currency", "CAD", "USD"],
    ["Platforms", "iPhone, Android, browser", "iPhone, Android, browser"],
    ["Bank connections", "Plaid on a subscription", "Plaid, MX and Mastercard Connect"],
    ["Household sharing", "Yes, separate sign-ins", "Yes, separate sign-ins under one subscription"],
    ["Built in Canada", "Yes", "No"],
  ],
  ourTake: "Monarch brings budgeting, investments, net worth and reports into one place. It also supports shared household finances. flourish focuses on payday timing, with a safe-to-spend calculation, 90-day forecast and What-If Simulator.",
  more: ["Canadian bank connections vary by institution. Monarch notes that some Canadian institutions can be difficult to connect or keep synced. Neither service can guarantee a connection to every bank."],
  checked: `We make flourish. Monarch Money information was checked against its published pages on ${DATE}.`,
  sources: ["https://www.monarch.com/pricing", "https://help.monarch.com/hc/en-us/articles/33707613533972-Understanding-Data-Providers-and-Connections", "https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households"],
  trademark: "Monarch Money is a trademark of its owner. This comparison is independent and is not endorsed by Monarch Money.",
};

const WAYPOINT = {
  path: "/compare/waypoint",
  llmsName: "flourish vs Waypoint",
  h1: "flourish vs Waypoint Budget (2026)",
  title: "flourish vs Waypoint Budget (2026)",
  shortAnswer: "Choose Waypoint if you want Safe to Spend and five coach messages a day on the free plan, or a lower-priced bank connection. Choose flourish if you want a safe-to-spend calculation built around your next payday and a weekly money meeting.",
  table: [
    ["Feature", "flourish", "Waypoint Budget"],
    ["Monthly price", "CA$11.99 + tax", "Plus CA$7.99; Pro CA$12.99, excluding tax"],
    ["Annual price", "CA$99.99 + tax", "Plus CA$79.99; Pro CA$129.99, excluding tax"],
    ["Free option", "The free plan", "The free plan"],
    ["Free trial", "14 days for eligible new subscribers, payment details required", "7 days on paid plans"],
    ["Billing currency", "CAD", "CAD for Canadians"],
    ["Platforms", "iPhone, Android, browser", "iPhone, Android, browser"],
    ["Bank connections", "Plaid on a subscription", "Plaid and Flinks; one bank on Plus, unlimited on Pro subject to terms"],
    ["Household sharing", "Yes, separate sign-ins", "Yes, on Pro"],
    ["Built in Canada", "Yes", "Yes, Calgary"],
  ],
  ourTake: "Both apps offer a safe-to-spend figure, Canadian pricing and an optional bank connection. Waypoint's free plan includes Safe to Spend and five coach messages a day. Its Plus plan costs less than a flourish subscription and includes one bank connection.",
  more: [
    "flourish calculates what's safe to spend until the next payday after upcoming bills, minimum debt payments, a buffer and a savings amount. It also offers a 90-day forecast, the What-If Simulator and a weekly money meeting agenda.",
    "The free plan on the flourish website uses manual entry and allows two coach messages a week and one What-If a day. It does not include bank connections, Credit or the coach-run money meeting.",
  ],
  checked: `We make flourish. Waypoint Budget information was checked against its published pages on ${DATE}.`,
  sources: ["https://waypointbudget.com/pricing", "https://waypointbudget.com/faq", "https://waypointbudget.com/budgeting-app-canada"],
  trademark: "Waypoint Budget is a trademark of its owner. This comparison is independent and is not endorsed by Waypoint Budget.",
};
for (const c of [YNAB, MONARCH, WAYPOINT]) c.description = c.shortAnswer;

const PRESS = {
  path: "/press",
  llmsName: "press kit",
  h1: "flourish press kit",
  title: "flourish press kit",
  description: "flourish is a Canadian money app that shows what's safe to spend until payday.",
  lines: [
    ["One line:", "flourish is a Canadian money app that shows what's safe to spend until payday."],
    ["Boilerplate:", "flourish is a Canadian money app that shows what's safe to spend until payday, after bills, minimum debt payments, a buffer and a savings amount. It runs on iPhone, Android and in a browser at flourishmoney.app. flourish is operated by GrowSmart Inc. in Foxboro, Ontario, and was built by a financial controller."],
    ["Facts:", "Launched 2026. Available in Canada. Price: the free plan, or $11.99 a month or $99.99 a year CAD plus tax."],
  ],
  downloadsLine: ["Downloads:", "logo (light and dark), app icon, screenshots."],
  contact: "hello@flourishmoney.app",
  // The repo's existing, approved art. public/press holds only the dark logo, copied from ios-appicon/icon-1024-dark.png.
  files: [
    { href: "/email/flourish-wordmark.png", label: "Logo, light (PNG)" },
    { href: "/press/flourish-logo-dark.png", label: "Logo, dark (PNG)" },
    { href: "/flourish-adult-app-icon-1024.png", label: "App icon (PNG, 1024 px)" },
  ],
  // The landing's screens and their captions (src/App.jsx, the landing's strip).
  screens: [
    { href: "/app-screens/home.jpg", label: "Safe to spend until payday" },
    { href: "/app-screens/watch.jpg", label: "Every bill and payday, up to 90 days ahead" },
    { href: "/app-screens/meet.jpg", label: "A 15-minute weekly money meeting" },
    { href: "/app-screens/how-we-got-this.jpg", label: "Tap safe to spend to see the math" },
  ],
};

export const AI_PAGES = [BEST, YNAB, MONARCH, WAYPOINT, PRESS];
export const aiPageUrl = (p) => `${SITE}${p.path}`;
export const aiPageFile = (p) => `${p.path.slice(1)}.html`;

// ── Rendering ───────────────────────────────────────────────────────────────────────────────────────────────────────
const EXTRA_STYLE = `<style>
  ul.facts { list-style: none; padding: 0; margin: 8px 0 0; }
  ul.facts li { margin: 0 0 8px; }
  main h3 { font-size: 18px; line-height: 1.35; margin: 24px 0 6px; }
  table th[scope="row"] { color: var(--ink); font-size: 15px; }
  .stores { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 32px 0 0; }
  .stores a { display: inline-block; line-height: 0; }
  .stores a:focus-visible { outline-offset: 4px; }
  .shots { display: flex; flex-wrap: wrap; gap: 16px; padding: 0; list-style: none; }
  .shots li { width: 150px; margin: 0; }
  .shots img { display: block; width: 150px; height: auto; border-radius: 12px; border: 1px solid var(--rule); }
  .shots span { display: block; font-size: 14px; line-height: 1.4; margin-top: 6px; }
  .label { color: var(--muted); font-size: 14px; font-weight: 600; }
</style>`;

const HEADER = '<header><a href="/" style="text-decoration:none">flourish</a></header>';

function storeLinks() {
  const badges = STORE_BADGES.map((b) => `<a href="${esc(b.href)}"><img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${b.width}" height="${b.height}"></a>`).join("");
  return `<p class="stores">${badges}</p>`;
}

function headOf(p, ld) {
  const url = aiPageUrl(p);
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="flourish">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(p.h1)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:image" content="${SITE}/app-screens/hero-card.jpg">`,
    ld ? `<script type="application/ld+json">${jsonLd(ld)}</script>` : "",
    EXTRA_STYLE,
  ].filter(Boolean).join("\n");
}

function renderBest(p, date) {
  const blocks = p.blocks.map((b) => {
    if (b.h2) return `<h2>${esc(b.h2)}</h2>`;
    if (b.p) return `<p>${esc(b.p)}</p>`;
    const items = b.facts.map(([label, text]) => `<li>${labelled(label, text)}</li>`);
    if (b.source) items.push(`<li><strong>Source:</strong> ${link(b.source)}</li>`);
    return `<ul class="facts">\n${items.join("\n")}\n</ul>`;
  }).join("\n");
  const faq = p.faq.map(({ q, a }) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join("\n");
  return `${blocks}\n<section aria-labelledby="faq">\n<h2 id="faq">Frequently asked questions</h2>\n${faq}\n</section>`;
}

function renderCompare(p, date) {
  const [head, ...rows] = p.table;
  const table = `<div class="tablewrap"><table>
<thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
<tbody>
${rows.map(([feature, ...cells]) => `<tr><th scope="row">${esc(feature)}</th>${cells.map((c, i) => `<td data-label="${esc(head[i + 1])}">${esc(c)}</td>`).join("")}</tr>`).join("\n")}
</tbody>
</table></div>`;
  return [
    `<p>${labelled("Short answer:", p.shortAnswer)}</p>`,
    table,
    `<p>${esc(PHONE_APPS_LINE)}</p>`,
    `<p>${labelled("Our take:", p.ourTake)}</p>`,
    ...p.more.map((m) => `<p>${esc(m)}</p>`),
    `<p>${esc(filled(p.checked, date))}</p>`,
    `<p>Sources:</p>\n<ul>\n${p.sources.map((u) => `<li>${link(u)}</li>`).join("\n")}\n</ul>`,
    `<p>${esc(p.trademark)}</p>`,
  ].join("\n");
}

function renderPress(p) {
  const files = p.files.map((f) => `<li><a href="${esc(f.href)}" download>${esc(f.label)}</a></li>`).join("\n");
  const shots = p.screens.map((s) => `<li><a href="${esc(s.href)}" download><img src="${esc(s.href)}" alt="${esc(s.label)}" width="680" height="1474" loading="lazy"></a><span>${esc(s.label)}</span></li>`).join("\n");
  return [
    ...p.lines.map(([label, text]) => `<p>${labelled(label, text)}</p>`),
    `<p>${labelled(...p.downloadsLine)}</p>`,
    `<ul>\n${files}\n</ul>`,
    `<ul class="shots">\n${shots}\n</ul>`,
    '<p class="label">Example, sample data</p>',
    `<p><strong>Press contact:</strong> <a href="mailto:${p.contact}">${p.contact}</a></p>`,
  ].join("\n");
}

export function renderAiPage(p, { tags = [], date = readableDate(AI_PAGES_DATE) } = {}) {
  const ld = p.faq ? {
    "@context": "https://schema.org", "@type": "FAQPage", "@id": `${aiPageUrl(p)}#faq`, url: aiPageUrl(p),
    mainEntity: p.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  } : null;
  const inner = p === BEST ? renderBest(p, date) : p === PRESS ? renderPress(p) : renderCompare(p, date);
  const body = `<main>
<h1>${esc(p.h1)}</h1>
<p class="meta">Last updated: ${esc(date)}</p>
${inner}
${storeLinks()}
</main>`;
  return shell({ head: headOf(p, ld), body, tags, header: HEADER });
}

/** Write the five pages into dist (dist/<path>.html). */
export function buildAiPages(dist, { tags = [] } = {}) {
  if (!/^https:\/\/apps\.apple\.com\//.test(APP_STORE_URL) || !/^https:\/\/play\.google\.com\//.test(PLAY_STORE_URL)) throw new Error("ai-pages: the store links did not come through");
  for (const p of AI_PAGES) {
    const file = path.join(dist, aiPageFile(p));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderAiPage(p, { tags }));
  }
  return AI_PAGES.map(aiPageFile);
}
