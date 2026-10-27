// tests/foundingStoreLink.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING EMAIL TO THE APP STORES (2026-10-27, Amanda: "People won't know how to download it").
//   1  the words to write: every [WORDS: id] in docs/product/FOUNDING-STORE-EMAIL-WORDS.md is in the code exactly once
//      (the email or the device link's page), and the code has no other placeholder; each has its place, facts and limit
//   2  the email's order: price line, the button (to the device link) with its text link, the stores' badges, the
//      steps line, then the website as a small line; the launch email is untouched
//   3  one set of store listings: the email, the device link's page and the website's badges name the same two
//   4  the device link's page (public/get/): one badge of each, Apple's first, the website as a smaller link; a static
//      page whose script is its own file (the CSP allows no inline script) and whose analytics send no personal data
//   5  the native build leaves the page and the emails' images out; the SPA fallback does not shadow /get
// (In a real browser, each device's way: tests/foundingStoreLink.browser.test.cjs.)
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

(async () => {
  const t = create();
  process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
  const S = await import("../src/lib/storeLinks.js");
  const doc = read("docs", "product", "FOUNDING-STORE-EMAIL-WORDS.md");
  const emailSrc = read("netlify", "functions", "_lib", "foundingLinkEmail.js");
  const page = read("public", "get", "index.html");
  const script = read("public", "get", "get.js");

  // ── 1. The words to write ────────────────────────────────────────────────────────────────────
  const docIds = [...doc.matchAll(/^### `([a-z-]+)`/gm)].map((m) => m[1]);
  t.eq(docIds, ["founding-email-button", "founding-email-store-steps", "founding-email-computer", "founding-email-price", "get-heading", "get-website"],
    "1a the doc lists six placeholders: the button, the steps line, the computer line, the price line, and the page's two");
  const inCode = (id) => (emailSrc.split(`[WORDS: ${id}]`).length - 1) + (page.split(`[WORDS: ${id}]`).length - 1);
  t.ok(docIds.every((id) => inCode(id) === 1), "1b each is in the code exactly once (the email or the device link's page)");
  const codeIds = [...new Set([...`${emailSrc}\n${page}\n${script}`.matchAll(/\[WORDS: ([a-z-]+)\]/g)].map((m) => m[1]))].sort();
  t.eq(codeIds, [...docIds].sort(), "1c …and the code has no placeholder the doc does not list");
  for (const id of docIds) {
    const sec = doc.split(`### \`${id}\``)[1].split(/\n### |\n## /)[0];
    t.ok(/\*\*Where:\*\*/.test(sec) && /\*\*Facts it must state/.test(sec) && /\*\*Limit:\*\* \d+ characters/.test(sec), `1d ${id}: where it shows, the facts it must state, and a character limit`);
  }
  const steps = doc.split("### `founding-email-store-steps`")[1].split("\n### ")[0];
  const order = ["same email address this message went to", "tap the confirmation link", "open **See plans** and choose **Founding annual**"].map((s) => steps.indexOf(s));
  t.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "1e the steps line's facts: same email, then the confirmation link, then See plans and Founding annual, in that order");
  t.ok(/\*\*in place of Annual\*\*, not first/.test(steps) && /Monthly, then Founding annual/.test(steps), "1f …and that the store apps show Founding annual in place of Annual, not first");
  t.ok(/flagged: the approved sentence is no longer all true/.test(doc) && /"Paid on flourishmoney\.app"/.test(doc), "1g the price line is flagged: \"Paid on flourishmoney.app\" is no longer the email's way to pay");

  // ── 2. The email's order ─────────────────────────────────────────────────────────────────────
  const paras = E.foundingLinkParagraphs(7);
  const kinds = paras.map((p) => (typeof p === "string" ? p : p.badges ? "{badges}" : p.small ? `{small ${p.small}}` : "?"));
  t.eq(kinds.slice(2, 7), ["[WORDS: founding-email-price]", "Your link: https://flourishmoney.app/get?ref=founding", "{badges}", "[WORDS: founding-email-store-steps]", "{small [WORDS: founding-email-computer]}"],
    "2a the price line, the device link (drawn as the button), the badges, the steps line, the website as a small line");
  t.eq(paras[6].url, "https://flourishmoney.app/?checkout=founding", "2b the small line's link is the website's founding checkout");
  const payload = E.foundingLinkEmailPayload("household@example.test", { id: "00000000-0000-4000-8000-000000000012", is_test: false, consent_version: "2026-10-01", founding_position: 12, unsubscribed_at: null, metadata: {} });
  const html = payload.html;
  const at = (s) => html.indexOf(s);
  t.ok(at(">[WORDS: founding-email-button]<") < at('src="https://flourishmoney.app/email/app-store-badge.png"') && at('src="https://flourishmoney.app/email/app-store-badge.png"') < at('src="https://flourishmoney.app/email/google-play-badge.png"')
    && at('src="https://flourishmoney.app/email/google-play-badge.png"') < at("[WORDS: founding-email-store-steps]") && at("[WORDS: founding-email-store-steps]") < at("[WORDS: founding-email-computer]"),
    "2c in the HTML: the button, then the App Store badge, the Google Play badge, the steps line, the small website line");
  t.ok(payload.text.split("\n\n").includes("[WORDS: founding-email-computer] https://flourishmoney.app/?checkout=founding") && !/badge/i.test(payload.text),
    "2d in the plain text: the website line with its url; no badges (the device link does their job)");
  const launch = E.paragraphsFor(E.LAUNCH_KIND, null);
  t.ok(launch.every((p) => typeof p === "string") && !/WORDS|get\?ref/.test(launch.join(" ")), "2e the launch email is untouched: no badges, no device link, no placeholder");

  // ── 3. One set of store listings ─────────────────────────────────────────────────────────────
  t.eq([E.APP_STORE_URL, E.PLAY_STORE_URL], [S.APP_STORE_URL, S.PLAY_STORE_URL], "3a the email names the website's two store listings (src/lib/storeLinks.js)");
  t.ok(page.includes(`href="${S.APP_STORE_URL}"`) && page.includes(`href="${S.PLAY_STORE_URL}"`), "3b …and so does the device link's page");
  t.eq(E.STORE_BADGES.map((b) => b.alt), S.STORE_BADGES.map((b) => b.alt), "3c the badges' alt text is the website's, the stores' own words");

  // ── 4. The device link's page ────────────────────────────────────────────────────────────────
  const badgeImgs = [...page.matchAll(/<img src="\/store-badges\/([^"]+)"/g)].map((m) => m[1]);
  t.eq(badgeImgs, ["download-on-the-app-store.svg", "GetItOnGooglePlay_Badge_Web_color_English.svg"], "4a one App Store badge and one Google Play badge, Apple's first, the stores' own files");
  t.ok(/<p class="web"><a id="website" href="\/\?checkout=founding"/.test(page) && /\.web \{[^}]*font-size: 14px/.test(page) && /h1 \{[^}]*font-size: 22px/.test(page),
    "4b the website is the smaller second way: a 14 px link to the founding checkout under the 22 px heading and the badges");
  t.ok(!/<script>(?!<\/)/.test(page) && /<script src="\/get\/get\.js"><\/script>/.test(page) && !/\son[a-z]+="/.test(page), "4c no inline script and no inline handler (the CSP allows script from the site only)");
  t.ok(/<meta name="robots" content="noindex">/.test(page) && /<html lang="en">/.test(page) && /<meta name="viewport" content="width=device-width,initial-scale=1">/.test(page), "4d noindex, a language, a phone viewport");
  const plausibleSrc = (read("src", "lib", "webAnalytics.js").match(/"(https:\/\/plausible\.io\/js\/[^"]+)"/) || [])[1];
  t.ok(!!plausibleSrc && script.includes(`var PLAUSIBLE_SRC = "${plausibleSrc}";`), "4e the page loads the site's own Plausible script (src/lib/webAnalytics.js)");
  t.ok(/autoCapturePageviews: false/.test(script) && /out\.u = window\.location\.origin \+ "\/get";/.test(script) && /if \(WAYS\.indexOf\(props\.way\) >= 0\) out\.p\.way = props\.way;/.test(script) && /if \(REFS\.indexOf\(props\.ref\) >= 0\) out\.p\.ref = props\.ref;/.test(script),
    "4f Plausible is told the page without its query, and only way and ref, from fixed lists");
  const code = script.replace(/\/\/[^\n]*/g, "");
  t.ok(!/localStorage|sessionStorage|document\.cookie|email|\bua\b[^;]*props/.test(code), "4g no storage, no cookie, and nothing about the person (the user agent only picks the store; it is never sent)");

  // ── 5. Native build and routing ──────────────────────────────────────────────────────────────
  const { LANDING_ONLY } = await import("../scripts/strip-landing-media.mjs");
  t.ok(LANDING_ONLY.includes("get") && LANDING_ONLY.includes("email"), "5a the native build leaves out the device link's page (and its Plausible script) and the emails' images");
  const toml = read("netlify.toml");
  const spa = toml.split("[[redirects]]").find((b) => /from\s*=\s*"\/\*"/.test(b)) || "";
  t.ok(/to\s*=\s*"\/index\.html"/.test(spa) && !/force\s*=\s*true/.test(spa), "5b the SPA fallback is not forced, so /get is served from public/get/");
  t.ok(/script-src 'self'[^;]*https:\/\/plausible\.io/.test(toml) && /img-src 'self'/.test(toml), "5c the CSP allows the page's script, Plausible, and its own images");

  t.summary("foundingStoreLink");
})();
