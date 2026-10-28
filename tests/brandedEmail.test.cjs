// tests/brandedEmail.test.cjs
// -----------------------------------------------------------------------------
// THE BRANDED HTML EMAIL (2026-10-26): the founding link email (and the unused launch email) in the shared flourish
// layout, _lib/emailLayout.js. The words do not change; only how they look.
//   1  the HTML part carries exactly the plain-text part's words, in order; the one addition is the button's label
//      (since 2026-10-27, [WORDS: founding-email-button] until approved: docs/product/FOUNDING-STORE-EMAIL-WORDS.md),
//      and the text link under it is the text part's own "Your link:" line
//   2  the CASL footer, the consent line (both kinds, the personal-relationship one included) and the one-click
//      unsubscribe link are in both parts, the same
//   3  no tracking: the only images are the wordmark and (founding email) the two store badges, from flourishmoney.app;
//      the only links are the device link, the website's founding link, the two store listings and the signed
//      unsubscribe link, exactly; no pixel, no redirect, no utm, no script, no style block
//   4  email-safe: table layout, inline styles, max width 560, light colour scheme declared; the wordmark is the
//      public/email PNG at 3x its drawn size, with alt text "flourish" styled to read with images blocked
//   5  readable: every colour pair the layout uses clears 4.5:1 as designed AND inverted (a client's forced dark mode)
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");

const decode = (s) => s.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const visible = (html) => decode(html.replace(/<title>[^<]*<\/title>/, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const words = (text) => text.replace(/\s+/g, " ").trim();

function lum(hex) {
  const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const invert = (hex) => "#" + hex.replace("#", "").match(/../g).map((x) => (255 - parseInt(x, 16)).toString(16).padStart(2, "0")).join("");

(async () => {
  const t = create();
  process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";   // signs the unsubscribe link; no link, no email
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
  const L = require("../netlify/functions/_lib/emailLayout.js");
  const C = require("../netlify/functions/_lib/waitlistConsent.js");
  const BASIS = { type: "personal_relationship", stated_by: "Amanda Holt", stated_at: "2026-10-25", note: "friends and family, per founder" };
  const rows = {
    "a newer holder":    { id: "00000000-0000-4000-8000-000000000012", is_test: false, consent_version: "2026-10-01", founding_position: 12, unsubscribed_at: null, metadata: {} },
    "friends and family": { id: "00000000-0000-4000-8000-000000000003", is_test: false, consent_version: C.LEGACY_CONSENT_VERSION, founding_position: 3, unsubscribed_at: null, metadata: { consent_basis: { ...BASIS } } },
    "the launch email":   { id: "00000000-0000-4000-8000-000000000020", is_test: false, consent_version: C.LEGACY_CONSENT_VERSION, founding_position: null, unsubscribed_at: null, metadata: {} },
  };

  for (const [who, row] of Object.entries(rows)) {
    const p = E.foundingLinkEmailPayload("household@example.test", row, { launched: true });
    t.ok(!!p, `0 ${who}: a payload`);
    if (!p) continue;
    const founding = p.subject === E.SUBJECT;
    const unsub = (p.text.match(/Unsubscribe with one click: (\S+)/) || [])[1];

    // ── 1. The same words ────────────────────────────────────────────────────────────────────────
    const html = visible(p.html);
    const expected = words(p.text);
    t.eq(founding ? html.replace(` ${E.FOUNDING_BUTTON_LABEL} `, " ") : html, expected, `1a ${who}: the HTML shows exactly the plain-text part's words, in order${founding ? ", plus the button" : ""}`);
    if (founding) {
      t.eq((html.match(new RegExp(E.FOUNDING_BUTTON_LABEL.replace(/[[\]]/g, "\\$&"), "g")) || []).length, 1, `1b ${who}: one button, with its label`);
      t.eq(E.FOUNDING_BUTTON_LABEL, "[WORDS: founding-email-button]", "1c the button label is its placeholder until new words are approved (2026-10-27)");
      t.eq([...new Set((p.html + p.text).match(/\[WORDS: [a-z-]+\]/g) || [])].sort(), ["[WORDS: founding-email-button]", "[WORDS: founding-email-computer]", "[WORDS: founding-email-price]", "[WORDS: founding-email-store-steps]"],
        `1c2 ${who}: the only placeholders in either part are the four listed in docs/product/FOUNDING-STORE-EMAIL-WORDS.md`);
      t.ok(p.html.includes(`Your link: <a href="${E.FOUNDING_GET_URL}"`) && p.text.split("\n\n").includes(`Your link: ${E.FOUNDING_GET_URL}`), `1d ${who}: under the button, the text part's own "Your link:" line, as a text link`);
    } else {
      t.ok(!p.html.includes(E.FOUNDING_BUTTON_LABEL) && !/checkout=founding/.test(p.html + p.text), `1e ${who}: no button and no founding link`);
    }

    // ── 2. The footer in both ─────────────────────────────────────────────────────────────────────
    const line = row.metadata.consent_basis ? "Consent on record: personal relationship (joined the waitlist before Oct 1, 2026)." : `Consent on record: version ${row.consent_version}.`;
    for (const l of [E.WHY_LINE, line, ...E.CONTACT_BLOCK, `Unsubscribe with one click: ${unsub}`]) {
      t.ok(p.text.split("\n\n").includes(l) && html.includes(l), `2a ${who}: both parts carry "${l.slice(0, 60)}"`);
    }
    t.ok(/^https:\/\/flourishmoney\.app\/api\/unsubscribe\?id=[0-9a-f-]+&t=[A-Za-z0-9_-]+$/.test(unsub) && p.html.includes(`href="${unsub}"`) && p.headers["List-Unsubscribe"].includes(`<${unsub}>`),
      `2b ${who}: the one-click unsubscribe link, the same in the text, the HTML and the List-Unsubscribe header`);

    // ── 3. No tracking ───────────────────────────────────────────────────────────────────────────
    const imgs = [...p.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const srcs = imgs.map((i) => (i.match(/src="([^"]*)"/) || [])[1]);
    t.eq(srcs, founding ? [L.LOGO_URL, ...E.STORE_BADGES.map((b) => b.src)] : [L.LOGO_URL], `3a ${who}: the images are the wordmark${founding ? ", then the App Store and Google Play badges" : ""}, and nothing else`);
    t.ok(srcs.every((u) => /^https:\/\/flourishmoney\.app\/email\/[a-z-]+\.png$/.test(u)), `3b ${who}: every image comes from flourishmoney.app/email/`);
    const hrefs = [...p.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    t.eq([...new Set(hrefs)].sort(), (founding ? [E.FOUNDING_GET_URL, E.FOUNDING_LINK_URL, E.APP_STORE_URL, E.PLAY_STORE_URL, unsub] : [unsub]).sort(),
      `3c ${who}: the only links are ${founding ? "the device link, the website's founding link, the two store listings and " : ""}the unsubscribe link, exactly`);
    if (founding) {
      const count = (u) => hrefs.filter((h) => h === u).length;
      t.eq([count(E.FOUNDING_GET_URL), count(E.APP_STORE_URL), count(E.PLAY_STORE_URL), count(E.FOUNDING_LINK_URL)], [2, 1, 1, 1],
        `3d ${who}: the button and its text link open the device link; each badge its own store, once; the website's checkout once, in the small line`);
      t.ok(E.FOUNDING_GET_URL === "https://flourishmoney.app/get?ref=founding" && E.FOUNDING_LINK_URL === "https://flourishmoney.app/?checkout=founding", `3d2 ${who}: exactly /get?ref=founding and /?checkout=founding`);
    }
    t.ok(!/utm_|<script|<style|class=|width="1"|height="1"|\/\/open\.|track|pixel|beacon|resend\.(com|dev)\/[a-z]/i.test(p.html), `3e ${who}: no pixel, no utm, no redirect, no script, no style block, no class`);
    t.ok(!("track_opens" in p) && !("track_clicks" in p) && !("tracking" in p), `3f ${who}: the payload asks Resend for no tracking`);

    // ── 4. Email-safe ────────────────────────────────────────────────────────────────────────────
    t.ok(/<table role="presentation"/.test(p.html) && !/<div/.test(p.html) && /max-width:560px/.test(p.html), `4a ${who}: table layout, no divs, max width 560px`);
    t.ok(imgs[0].includes(`alt="flourish"`) && L.LOGO_ALT === "flourish", `4b ${who}: the wordmark's alt text is "flourish"`);
    t.ok(imgs[0].includes(`width="${L.LOGO_SIZE.width}" height="${L.LOGO_SIZE.height}"`) && new RegExp(`font-size:\\d+px;font-weight:800;[^"]*color:${L.COLORS.brand}`).test(imgs[0]),
      `4b2 ${who}: the wordmark has a fixed size, and its alt text is styled bold brand green (images blocked)`);
    t.ok(/<meta name="color-scheme" content="light">/.test(p.html) && /<meta name="viewport" content="width=device-width,initial-scale=1">/.test(p.html), `4c ${who}: light colour scheme declared, and a phone viewport`);
    t.ok(p.html.includes(L.FONT) && /Helvetica,Arial,sans-serif/.test(L.FONT), `4d ${who}: the app's font, with safe fallbacks`);
  }

  // ── 4e. The wordmark PNG: served from public/email, 3x its drawn size, an opaque cream tile in the page colour ──
  const fs = require("fs"), path = require("path");
  const file = path.join(__dirname, "..", "public", new URL(L.LOGO_URL).pathname);
  const png = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  t.ok(png.length > 0 && png.length < 60000 && png.slice(1, 4).toString() === "PNG", `4e the wordmark is a PNG in public${new URL(L.LOGO_URL).pathname} (${png.length} bytes)`);
  t.ok(png.length > 24 && png.readUInt32BE(16) === 3 * L.LOGO_SIZE.width && png.readUInt32BE(20) === 3 * L.LOGO_SIZE.height, "4f the wordmark PNG is 3x its drawn size (sharp on retina)");

  // ── 4g. The store badges: the stores' own artwork, Apple's first, one of each, 3x, alt text the badge's own words ──
  t.eq(E.STORE_BADGES.map((b) => [b.alt, b.href, b.width, b.height]),
    [["Download on the App Store", E.APP_STORE_URL, 120, 40], ["Get it on Google Play", E.PLAY_STORE_URL, 135, 40]], "4g Apple's badge first, then Google's, one of each, at the website's sizes (src/lib/storeLinks.js)");
  for (const b of E.STORE_BADGES) {
    const f = path.join(__dirname, "..", "public", new URL(b.src).pathname);
    const img = fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0);
    t.ok(img.length > 24 && img.slice(1, 4).toString() === "PNG" && img.readUInt32BE(16) === 3 * b.width && img.readUInt32BE(20) === 3 * b.height && img.length < 40000,
      `4h ${b.alt}: a PNG in public${new URL(b.src).pathname}, 3x its drawn size (${img.length} bytes)`);
  }
  const founder = E.foundingLinkEmailPayload("household@example.test", rows["a newer holder"], { launched: true });
  const badgeImgs = [...founder.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).slice(1);
  t.ok(badgeImgs.length === 2 && badgeImgs.every((i) => new RegExp(`font-size:11px;font-weight:700;line-height:13px;color:${L.COLORS.brand}`).test(i)),
    "4i the badges' alt text is bold brand green, 11 px on 13 px lines, so it wraps whole inside the 40 px badge box with images blocked");

  // ── 5. Readable as designed and inverted ───────────────────────────────────────────────────────
  const K = L.COLORS;
  for (const [fg, bg, what] of [[K.ink, K.card, "body text on the card"], [K.muted, K.page, "footer text on the page"], [K.onBrand, K.brand, "the button's label"], [K.brand, K.card, "the text link"], [K.brand, K.page, "the wordmark's alt text on the page"], [K.muted, K.card, "the small website line on the card"]]) {
    t.ok(contrast(fg, bg) >= 4.5, `5a ${what}: ${contrast(fg, bg).toFixed(1)}:1 as designed`);
    t.ok(contrast(invert(fg), invert(bg)) >= 4.5, `5b ${what}: ${contrast(invert(fg), invert(bg)).toFixed(1)}:1 inverted (a forced dark mode)`);
  }
  t.summary("brandedEmail");
})();
