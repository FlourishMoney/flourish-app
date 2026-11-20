// tests/giftWords.test.cjs
// -----------------------------------------------------------------------------
// THE GIFT WORDS, APPROVED 2026-11-20 (docs/review/GIFT-COPY-APPROVED-2026-11-20.md), held word for word:
//   1  every approved line is in the code, exactly, where GIFT-COPY.md says it shows: the server's words
//      (_lib/giftWords.js), each gift page (every element carries its id in data-words, the scripts' lines in a template
//      by data-id), and lib/giftReturn.js (the website's sign-in note, Settings line and the Terms' Gifts section)
//   2  docs/review/GIFT-COPY.md says the same: every line approved with the approved text, the four Plus lines hidden,
//      Email 1's footer unchanged
//   3  the Plus gift: none of its lines ships anywhere, and it is not on the gift page
//   4  "one-time gift, nothing renews" is on the page, in both emails and on the card
//   5  the approved lines keep Amanda's rules: none of the banned words; no sentence starts with save, spend, pay or
//      invest; flourish in lowercase; no em dash; no line sends anyone to use the website instead of the app
//   6  the app itself (src/App.jsx) holds no gift path and no gift words: only lib/giftReturn.js, which a native build
//      empties; the Terms' Gifts section shows on the website only
//   7  the Privacy Policy's Gifts entry (docs/review/PLUS-COPY-APPROVED-2026-11-20.md, last section), word for word, on
//      the website's policy only, in the 1.1.7 entries' style
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const PW = require("./_pendingWords.cjs");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const unescape = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
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
const APPROVED = Object.fromEntries([...read("docs", "review", "GIFT-COPY-APPROVED-2026-11-20.md").matchAll(/^- `(gift-[a-z0-9-]+)`: (.+)$/gm)].map((m) => [m[1], m[2]]));
const PLUS = ["gift-plan-plus-name", "gift-plan-plus-detail", "gift-stripe-name-plus", "gift-plan-plus"];
const EMAIL1_FOOTER = require("../netlify/functions/_lib/household.js").INVITE_EMAIL
  ? require("../netlify/functions/_lib/household.js").INVITE_EMAIL.footer[0]
  : "flourish is operated by GrowSmart Inc., PO Box 29, Foxboro ON K0K 2B0. Questions? hello@flourishmoney.app";
t.eq(Object.keys(APPROVED).length, 123, "0a the approved sheet: 123 lines");
t.ok(PLUS.every((id) => !(id in APPROVED)), "0b …and none of the four Plus lines among them");

// ── 1. in the code, word for word ────────────────────────────────────────────────────────────────
const inCode = {};                                   // id -> [text, where]
const put = (id, text, where) => { (inCode[id] = inCode[id] || []).push([text, where]); };
const server = require("../netlify/functions/_lib/giftWords.js");
for (const id of server.GIFT_WORD_IDS) put(id, server.GIFT_WORDS[id], "_lib/giftWords.js");
const PAGES = ["index.html", "redeem.html", "card.html"];
for (const f of PAGES) {
  const src = read("public", "gift", f);
  for (const m of src.matchAll(/<(\w+)\b[^>]*\bdata-words="(gift-[a-z0-9-]+)"[^>]*>([^<]*)<\/\1>/g)) put(m[2], unescape(m[3]), f);
  for (const m of src.matchAll(/<meta\b[^>]*\bdata-words="(gift-[a-z0-9-]+)"[^>]*\bcontent="([^"]*)"/g)) put(m[1], unescape(m[2]), f);
  for (const m of src.matchAll(/<span data-id="(gift-[a-z0-9-]+)">([^<]*)<\/span>/g)) put(m[1], unescape(m[2]), f);
}
const RET = read("src", "lib", "giftReturn.js");
const literal = (name) => { const m = new RegExp(`export const ${name} = NATIVE_BUILD \\? "" : ("(?:[^"\\\\]|\\\\.)*");`).exec(RET); return m ? JSON.parse(m[1]) : null; };
put("gift-signin-note", literal("GIFT_SIGN_IN_NOTE"), "lib/giftReturn.js");
put("gift-settings-line", literal("GIFT_SETTINGS_LINE"), "lib/giftReturn.js");
const termsBlock = /export const GIFT_TERMS = NATIVE_BUILD \? null : Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(RET);
const termsStrings = termsBlock ? [...termsBlock[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)) : [];
put("gift-terms-heading", termsStrings[0], "lib/giftReturn.js");
termsStrings.slice(1).forEach((x, i) => put(`gift-terms-${i + 1}`, x, "lib/giftReturn.js"));

const missing = Object.keys(APPROVED).filter((id) => !inCode[id]);
t.eq(missing, [], "1a every approved line is in the code");
const wrong = Object.entries(inCode).filter(([id]) => id !== "gift-email1-footer")
  .flatMap(([id, uses]) => uses.filter(([text]) => text !== APPROVED[id]).map(([text, where]) => `${id} in ${where}: ${JSON.stringify(text)}`));
t.eq(wrong, [], "1b …word for word, every place it is used");
t.eq(Object.keys(inCode).filter((id) => !(id in APPROVED) && id !== "gift-email1-footer"), [], "1c nothing in the code is a gift line that was not approved");
t.eq(server.GIFT_WORDS["gift-email1-footer"], EMAIL1_FOOTER, "1d Email 1 keeps the household invite's footer, unchanged (approved sheet, note 2)");
t.eq(server.GIFT_WORDS["gift-email-footer"].split(" / ").length, 3, "1e Email 2's footer is three lines (' / ' marks the breaks)");
const HOMES = ["netlify/functions/_lib/giftWords.js", "src/lib/giftReturn.js", ...PAGES.map((f) => `public/gift/${f}`)];
t.eq(HOMES.filter((f) => /\[WORDS:/.test(read(f))), [], "1f no placeholder is left in any gift file");
t.eq(PW.pendingGiftWordIds(), [], "1g …and none is pending, so the production build's guard has no gift line to refuse");

// ── 2. the sheet says the same ───────────────────────────────────────────────────────────────────
const ROWS = Object.fromEntries([...read("docs", "review", "GIFT-COPY.md").matchAll(/^\| `(gift-[a-z0-9-]+)` \| [^|]+ \| ([^|]+) \| (pending|approved|hidden) \|$/gm)].map((m) => [m[1], { text: m[2].trim(), status: m[3] }]));
t.eq(Object.keys(APPROVED).filter((id) => !ROWS[id] || ROWS[id].status !== "approved" || ROWS[id].text !== APPROVED[id]), [], "2a GIFT-COPY.md: every approved line marked approved, with the approved text");
t.eq(PLUS.map((id) => ROWS[id] && ROWS[id].status), ["hidden", "hidden", "hidden", "hidden"], "2b …the four Plus lines marked hidden");
t.eq([ROWS["gift-email1-footer"] && ROWS["gift-email1-footer"].status, ROWS["gift-email1-footer"] && ROWS["gift-email1-footer"].text], ["approved", EMAIL1_FOOTER], "2c …and Email 1's unchanged footer listed");
t.eq(Object.values(ROWS).filter((r) => r.status === "pending").length, 0, "2d nothing is pending");

// ── 3. the Plus gift is hidden ───────────────────────────────────────────────────────────────────
const plusTexts = PLUS.map((id) => ROWS[id].text);
const shipped = [...walk("src"), ...walk("netlify"), ...walk("public"), "index.html"];
t.eq(shipped.filter((f) => plusTexts.some((x) => read(f).includes(x))), [], "3a none of the Plus gift's lines is anywhere the site or the apps are built from");
t.ok(!/value="flourish_plus"/.test(read("public", "gift", "index.html")) && !/data-price="flourish_plus"/.test(read("public", "gift", "index.html")), "3b the gift page offers only a year of flourish");
t.ok(/const PLUS_GIFT_ON_SALE = false;/.test(read("netlify", "functions", "_lib", "gifts.js")), "3c the server sells only a year of flourish until PLUS_GIFT_ON_SALE (tests/gifts.test.cjs 3h)");

// ── 4. "one-time gift, nothing renews" ───────────────────────────────────────────────────────────
const ONE = /^One-time gift, nothing renews\./;
t.eq(["gift-page-onetime", "gift-email1-onetime", "gift-email2-onetime", "gift-card-onetime", "gift-redeem-onetime", "gift-stripe-description"].map((id) => ONE.test(APPROVED[id] || "")),
  [true, true, true, true, true, true], "4a the page, both emails, the card, the redeem page and Stripe's line say it first");
t.ok(read("public", "gift", "index.html").split('data-words="gift-page-onetime"').length - 1 >= 2, "4b the gift page shows it near the top and again by the button");
t.ok(read("public", "gift", "card.html").includes('data-words="gift-card-onetime"'), "4c the card shows it");
const giftsSrc = read("netlify", "functions", "_lib", "gifts.js");
t.ok(/"gift-email1-onetime"/.test(giftsSrc) && /"gift-email2-onetime"/.test(giftsSrc), "4d both emails carry it (tests/gifts.test.cjs reads them)");

// ── 5. the rules ─────────────────────────────────────────────────────────────────────────────────
const lines = Object.entries(APPROVED);
const BANNED = [/sets aside/i, /holds back/i, /\blearns\b/i, /\bremembers\b/i, /\bsmarter\b/i, /\bcovered\b/i, /\bcovers\b/i, /web app/i, /never invents/i];
t.eq(lines.filter(([, x]) => BANNED.some((rx) => rx.test(x))).map(([id]) => id), [], "5a none of: sets aside, holds back, learns, remembers, smarter, covered, covers, web app, never invents");
const sentences = (s) => String(s).split(/(?<=[.!?:])\s+|\s\/\s/).map((x) => x.replace(/^["'(\s]+/, ""));
t.eq(lines.filter(([, x]) => sentences(x).some((y) => /^(save|spend|pay|invest)/i.test(y))).map(([id]) => id), [], "5b no sentence starts with save, spend, pay or invest");
t.eq(lines.filter(([, x]) => /Flourish/.test(x)).map(([id]) => id), [], "5c flourish is written in lowercase");
t.eq(lines.filter(([, x]) => /—/.test(x)).map(([id]) => id), [], "5d no em dash");
t.eq(lines.filter(([, x]) => /(in your browser|home screen|use (it|flourish) on (the|our) website|open flourish on)/i.test(x)).map(([id]) => id), [], "5e no line sends anyone to use the website instead of the app");

// ── 6. the app holds no gift path ────────────────────────────────────────────────────────────────
const APP = read("src", "App.jsx");
t.ok(!/\[WORDS: gift-/.test(APP) && !/["'`]\/gift\//.test(APP) && !/["'`]\/api\/gift/.test(APP) && !APP.includes("year of flourish"), "6a src/App.jsx holds no gift words, page or endpoint of its own");
t.ok(/from "\.\/lib\/giftReturn\.js"/.test(APP), "6b it reaches the redeem page and the gift lines only through lib/giftReturn.js");
t.ok(/const NATIVE_BUILD = import\.meta\.env\.VITE_NATIVE_BUILD === "true";/.test(RET) && (RET.match(/NATIVE_BUILD \? "" :/g) || []).length >= 6 && /GIFT_TERMS = NATIVE_BUILD \? null :/.test(RET),
  "6c …which empties every address, every line and the Terms section in a native build");
t.ok(/isNativeApp\(\) \|\| !GIFT_REDEEM_PATH/.test(APP) && /!GIFT_REDEEM_PATH \|\| isNativeApp\(\)/.test(APP), "6d …and the app also checks it is not a store app before using any of it");
t.ok(/\{GIFT_TERMS && !isNativeApp\(\) && <>/.test(APP) && APP.indexOf("{GIFT_TERMS && !isNativeApp()") < APP.indexOf("8. Intellectual Property"), "6e the Terms' Gifts section shows on the website only, after section 7");

// ── 7. the Privacy Policy's Gifts entry (approved 2026-11-20) ────────────────────────────────────
// docs/review/PLUS-COPY-APPROVED-2026-11-20.md, its last section: "Label: Gifts:" and the one paragraph.
const PLUS_SHEET = read("docs", "review", "PLUS-COPY-APPROVED-2026-11-20.md");
const privSection = PLUS_SHEET.slice(PLUS_SHEET.indexOf("## Privacy Policy, new entry for gifts"));
const PRIV = { label: (/^Label: (.+)$/m.exec(privSection) || [])[1], paragraph: (/^Paragraph: (.+)$/m.exec(privSection) || [])[1] };
t.ok(PLUS_SHEET.includes("## Privacy Policy, new entry for gifts") && PRIV.label === "Gifts:" && /^If you buy a flourish gift on our website/.test(PRIV.paragraph || ""), "7a the approved sheet's Privacy entry: label and paragraph");
const privBlock = /export const GIFT_PRIVACY = NATIVE_BUILD \? null : Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(RET);
const privStrings = privBlock ? [...privBlock[1].matchAll(/^\s+(label|paragraph): "((?:[^"\\]|\\.)*)",?$/gm)].map((m) => [m[1], JSON.parse(`"${m[2]}"`)]) : [];
t.eq(Object.fromEntries(privStrings), PRIV, "7b lib/giftReturn.js GIFT_PRIVACY holds both, word for word, and a native build compiles it to null");
t.eq([ROWS["gift-privacy-label"], ROWS["gift-privacy"]], [{ text: PRIV.label, status: "approved" }, { text: PRIV.paragraph, status: "approved" }], "7c GIFT-COPY.md lists both, approved");
t.ok(/\{GIFT_PRIVACY && !native && <div data-privacy-gifts="" style=\{\{\.\.\.p,marginTop:SPACE\.md\}\}><strong style=\{\{color:C\.cream\}\}>\{GIFT_PRIVACY\.label\}<\/strong> \{GIFT_PRIVACY\.paragraph\}<\/div>\}/.test(APP),
  "7d the policy shows it as the 1.1.7 entries are shown (bold label, then the paragraph), on the website only");
const sec1 = APP.indexOf('data-privacy-117="agreement"'), sec2 = APP.indexOf("2. How We Use Your Information");
t.ok(sec1 > 0 && APP.indexOf("{GIFT_PRIVACY && !native") > sec1 && APP.indexOf("{GIFT_PRIVACY && !native") < sec2, "7e …in section 1, after the 1.1.7 entries");
const privRules = [PRIV.label, PRIV.paragraph].join(" ");
t.ok(!BANNED.some((rx) => rx.test(privRules)) && !/Flourish/.test(privRules) && !/—/.test(privRules), "7f it keeps the rules: none of the banned words, flourish in lowercase, no em dash");

t.summary("giftWords.test");
