// tests/foundingStoreLink.test.cjs
// -----------------------------------------------------------------------------
// THE FOUNDING EMAIL TO THE APP STORES (2026-10-27, Amanda: "People won't know how to download it").
//   1  the words (approved 2026-10-27): every line in docs/product/FOUNDING-STORE-EMAIL-WORDS.md is in the code exactly
//      once (the email or the device link's page), within its limit, with its place and facts; no placeholder is left
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
    "1a the doc lists six lines: the button, the steps line, the computer line, the price line, and the page's two");
  const section = (id) => doc.split(`### \`${id}\``)[1].split(/\n### |\n## /)[0];
  const approved = Object.fromEntries(docIds.map((id) => [id, (section(id).match(/^- \*\*Approved:\*\* "(.+)"$/m) || [])[1]]));
  const where = { "founding-email-button": E.FOUNDING_BUTTON_LABEL, "founding-email-store-steps": E.FOUNDING_STORE_STEPS_LINE, "founding-email-computer": E.FOUNDING_COMPUTER_LINE, "founding-email-price": E.FOUNDING_EMAIL_PRICE_LINE };
  for (const id of docIds) {
    const line = approved[id], sec = section(id), limit = +((sec.match(/\*\*Limit:\*\* (\d+) characters/) || [])[1] || 0);
    const count = (emailSrc.split(JSON.stringify(line)).length - 1) + (page.split(`>${line}<`).length - 1);
    t.ok(!!line && count === 1 && (!(id in where) || where[id] === line), `1b ${id}: the approved line is in the code exactly once${id in where ? ", as the email's own" : ", on the page"}`);
    t.ok(/\*\*Where:\*\*/.test(sec) && /\*\*Facts it must state/.test(sec) && limit > 0 && line.length <= limit, `1d ${id}: where it shows, its facts, and within its limit (${line && line.length}/${limit})`);
  }
  // Couple mode (2026-10-29): its words to come live in lib/householdWords.js, held to being placeholders until
  // approved by householdClient 7c; the feature stays off (HOUSEHOLD_ENABLED) and its PR unmerged until then.
  t.ok(!/\[WORDS:/.test(`${emailSrc}\n${page}\n${script}\n${read("src", "App.jsx")}`) && !fs.readdirSync(path.join(ROOT, "src", "lib")).filter((f) => f !== "householdWords.js").some((f) => /\[WORDS:/.test(read("src", "lib", f))),
    "1c no [WORDS: placeholder is left: the email, the device link's page and script, App.jsx, src/lib (couple mode's words to come live in lib/householdWords.js)");
  const steps = doc.split("### `founding-email-store-steps`")[1].split("\n### ")[0].split("**Facts it must state")[1] || "";
  const order = ["same email address this message went to", "tap the confirmation link", "open **See plans** and choose **Founding annual**"].map((s) => steps.indexOf(s));
  t.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "1e the steps line's facts: same email, then the confirmation link, then See plans and Founding annual, in that order");
  t.ok(/\*\*in place of Annual\*\*, not first/.test(steps) && /Monthly, then Founding annual/.test(steps), "1f …and that the store apps show Founding annual in place of Annual, not first");
  const said = ["email address this message was sent to", "tap the confirmation link", "open See plans and choose Founding annual"].map((x) => E.FOUNDING_STORE_STEPS_LINE.indexOf(x));
  t.ok(said.every((i) => i >= 0) && said[0] < said[1] && said[1] < said[2] && !/\bfirst\b|at the top|selected/i.test(E.FOUNDING_STORE_STEPS_LINE),
    "1e2 the approved steps line says the three, in that order, and never that Founding annual is first or selected");
  t.ok(/flagged on 2026-10-27: the landing sentence was no longer all true/.test(doc) && /"Paid on flourishmoney\.app"/.test(doc), "1g the price line's flag stays on record: \"Paid on flourishmoney.app\" is not the email's way to pay");

  // ── 2. The email's order ─────────────────────────────────────────────────────────────────────
  const paras = E.foundingLinkParagraphs(7);
  const kinds = paras.map((p) => (typeof p === "string" ? p : p.badges ? "{badges}" : p.small ? `{small ${p.small}}` : "?"));
  t.eq(kinds.slice(2, 7), [E.FOUNDING_EMAIL_PRICE_LINE, "Your link: https://flourishmoney.app/get?ref=founding", "{badges}", E.FOUNDING_STORE_STEPS_LINE, `{small ${E.FOUNDING_COMPUTER_LINE}}`],
    "2a the price line, the device link (drawn as the button), the badges, the steps line, the website as a small line");
  t.eq(paras[6].url, "https://flourishmoney.app/?checkout=founding", "2b the small line's link is the website's founding checkout");
  const payload = E.foundingLinkEmailPayload("household@example.test", { id: "00000000-0000-4000-8000-000000000012", is_test: false, consent_version: "2026-10-01", founding_position: 12, unsubscribed_at: null, metadata: {} });
  const html = payload.html;
  const at = (s) => html.indexOf(s);
  t.ok(at(`>${E.FOUNDING_BUTTON_LABEL}<`) > 0 && at(`>${E.FOUNDING_BUTTON_LABEL}<`) < at('src="https://flourishmoney.app/email/app-store-badge.png"') && at('src="https://flourishmoney.app/email/app-store-badge.png"') < at('src="https://flourishmoney.app/email/google-play-badge.png"')
    && at('src="https://flourishmoney.app/email/google-play-badge.png"') < at(E.FOUNDING_STORE_STEPS_LINE) && at(E.FOUNDING_STORE_STEPS_LINE) < at(E.FOUNDING_COMPUTER_LINE),
    "2c in the HTML: the button, then the App Store badge, the Google Play badge, the steps line, the small website line");
  t.ok(payload.text.split("\n\n").includes(`${E.FOUNDING_COMPUTER_LINE} https://flourishmoney.app/?checkout=founding`) && !/badge/i.test(payload.text),
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
