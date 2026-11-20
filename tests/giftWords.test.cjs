// tests/giftWords.test.cjs
// -----------------------------------------------------------------------------
// THE GIFT WORDS: docs/review/GIFT-COPY.md and the code, held together, and the drafts held to Amanda's rules.
//   1  every placeholder in the gift's words homes is listed in GIFT-COPY.md, and every listed line (but the Terms section,
//      which is not in the code yet) is used; no gift placeholder lives anywhere else
//   2  "one-time gift, nothing renews" is on the page, in both emails and on the card
//   3  the drafts: none of the banned words; no sentence starts with save, spend, pay or invest; flourish in lowercase; no
//      em dash; no line that sends people to the website instead of the app
//   4  the app itself (src/App.jsx) holds no gift path and no gift words: only lib/giftReturn.js, which a native build empties
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { draftWords } = require("./_giftFake.cjs");
const PW = require("./_pendingWords.cjs");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const HOMES = ["netlify/functions/_lib/giftWords.js", "src/lib/giftReturn.js", "public/gift/index.html", "public/gift/redeem.html", "public/gift/card.html"];
const ids = (src) => [...String(src).matchAll(/\[WORDS:\s*(gift-[a-z0-9-]+)\]/g)].map((m) => m[1]);
function walk(dir, out = []) {
  for (const f of fs.readdirSync(path.join(REPO, dir))) {
    const rel = path.join(dir, f);
    if (f === "node_modules" || f === "dist") continue;
    if (fs.statSync(path.join(REPO, rel)).isDirectory()) walk(rel, out);
    else if (/\.(js|jsx|mjs|cjs|html|json|css)$/.test(f)) out.push(rel);
  }
  return out;
}

const t = create();
const drafts = draftWords();
const listed = Object.keys(drafts);
const inCode = [...new Set(HOMES.flatMap((h) => ids(read(h))))].sort();

// ── 1. the list and the code ─────────────────────────────────────────────────────────────────────
t.eq(inCode.filter((id) => !listed.includes(id)), [], "1a every gift placeholder in the code is listed in GIFT-COPY.md");
t.eq(listed.filter((id) => !id.startsWith("gift-terms-") && !inCode.includes(id)), [], "1b every listed line but the Terms section is used in the code");
t.ok(listed.filter((id) => id.startsWith("gift-terms-")).length >= 5, "1c the Terms section is drafted (heading and paragraphs)");
t.eq(PW.pendingGiftWordIds().sort(), listed.sort(), "1d every listed line is pending (nothing is approved yet)");
const stray = [...walk("src"), ...walk("netlify"), ...walk("public"), "index.html"].filter((f) => ids(read(f)).length && !HOMES.includes(f.split(path.sep).join("/")));
t.eq(stray, [], "1e no gift placeholder lives outside the gift's own words homes");
const server = require("../netlify/functions/_lib/giftWords.js");
const giftsSrc = read("netlify/functions/_lib/gifts.js");
t.eq(server.GIFT_WORD_IDS.filter((id) => !giftsSrc.includes(`"${id}"`)), [], "1f every server line is used by _lib/gifts.js");
t.ok(server.GIFT_WORD_IDS.every((id) => server.GIFT_WORDS[id] === `[WORDS: ${id}]`), "1g …and each is still its placeholder in the code");

// ── 2. "one-time gift, nothing renews" ───────────────────────────────────────────────────────────
const ONE = /^One-time gift, nothing renews\./;
t.eq(["gift-page-onetime", "gift-email1-onetime", "gift-email2-onetime", "gift-card-onetime", "gift-redeem-onetime", "gift-stripe-description"].map((id) => ONE.test(drafts[id] || "")),
  [true, true, true, true, true, true], "2a the page, both emails, the card, the redeem page and Stripe's line say it first");
t.ok(read("public/gift/index.html").split("[WORDS: gift-page-onetime]").length - 1 >= 2, "2b the gift page shows it near the top and again by the button");
t.ok(read("public/gift/card.html").includes("[WORDS: gift-card-onetime]"), "2c the card shows it");
t.ok(/"gift-email1-onetime"/.test(giftsSrc) && /"gift-email2-onetime"/.test(giftsSrc), "2d both emails carry it (tests/gifts.test.cjs reads them)");
t.ok(/nothing renews/i.test(drafts["gift-terms-1"]), "2e …and the Terms section says it too");

// ── 3. the drafts ────────────────────────────────────────────────────────────────────────────────
const BANNED = [/sets aside/i, /holds back/i, /\blearns\b/i, /\bremembers\b/i, /\bsmarter\b/i, /\bcovered\b/i, /\bcovers\b/i, /web app/i, /never invents/i];
const bad = listed.filter((id) => BANNED.some((rx) => rx.test(drafts[id])));
t.eq(bad, [], "3a none of: sets aside, holds back, learns, remembers, smarter, covered, covers, web app, never invents");
const sentences = (s) => String(s).split(/(?<=[.!?:])\s+/).map((x) => x.replace(/^["'(\s]+/, ""));
const starts = listed.filter((id) => sentences(drafts[id]).some((x) => /^(save|spend|pay|invest)/i.test(x)));
t.eq(starts, [], "3b no sentence starts with save, spend, pay or invest (or Payment, Spending, Savings, Investments)");
t.eq(listed.filter((id) => /Flourish/.test(drafts[id])), [], "3c flourish is written in lowercase");
t.eq(listed.filter((id) => /—/.test(drafts[id])), [], "3d no em dash");
t.eq(listed.filter((id) => /(in your browser|home screen|use (it|flourish) on (the|our) website|open flourish on)/i.test(drafts[id])), [], "3e no line sends anyone to use the website instead of the app");
const doc = read("docs", "review", "GIFT-COPY.md");
t.ok(!BANNED.some((rx) => rx.test(doc.split("## Gift page")[1] || "")), "3f …and the review sheet's own tables use none of them either");

// ── 4. the app holds no gift path ────────────────────────────────────────────────────────────────
const APP = read("src", "App.jsx");
t.ok(!/\[WORDS: gift-/.test(APP) && !/["'`]\/gift\//.test(APP) && !/["'`]\/api\/gift/.test(APP), "4a src/App.jsx holds no gift words, page or endpoint of its own");
t.ok(/from "\.\/lib\/giftReturn\.js"/.test(APP), "4b it reaches the redeem page only through lib/giftReturn.js");
const ret = read("src", "lib", "giftReturn.js");
t.ok(/const NATIVE_BUILD = import\.meta\.env\.VITE_NATIVE_BUILD === "true";/.test(ret) && (ret.match(/NATIVE_BUILD \? "" :/g) || []).length >= 6, "4c …which empties every address and every line in a native build");
t.ok(/isNativeApp\(\) \|\| !GIFT_REDEEM_PATH/.test(APP) && /!GIFT_REDEEM_PATH \|\| isNativeApp\(\)/.test(APP), "4d …and the app also checks it is not a store app before using any of it");

t.summary("giftWords.test");
