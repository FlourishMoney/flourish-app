// tests/brandedEmail.test.cjs
// -----------------------------------------------------------------------------
// THE BRANDED HTML EMAIL (2026-10-26): the founding link email (and the unused launch email) in the shared flourish
// layout, _lib/emailLayout.js. The words do not change; only how they look.
//   1  the HTML part carries exactly the plain-text part's words, in order; the one addition is the button's label
//      (a [WORDS: …] placeholder until approved), and the text link under it is the text part's own "Your link:" line
//   2  the CASL footer, the consent line (both kinds, the personal-relationship one included) and the one-click
//      unsubscribe link are in both parts, the same
//   3  no tracking: the only image is the logo, from flourishmoney.app; the only links are the founding link and the
//      signed unsubscribe link, exactly; no pixel, no redirect, no utm, no script, no style block
//   4  email-safe: table layout, inline styles, max width 560, the logo's alt text, light colour scheme declared
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
      t.eq((html.match(new RegExp(E.FOUNDING_BUTTON_LABEL.replace(/[[\]]/g, "\\$&"), "g")) || []).length, 1, `1b ${who}: one button, labelled with the placeholder`);
      t.ok(/^\[WORDS: [^\]]+\]$/.test(E.FOUNDING_BUTTON_LABEL), "1c the button label is a [WORDS: …] placeholder until approved");
      t.ok(p.html.includes(`Your link: <a href="${E.FOUNDING_LINK_URL}"`) && p.text.split("\n\n").includes(`Your link: ${E.FOUNDING_LINK_URL}`), `1d ${who}: under the button, the text part's own "Your link:" line, as a text link`);
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
    t.eq(imgs.length, 1, `3a ${who}: one image, the logo`);
    t.ok(imgs[0].includes(`src="${L.LOGO_URL}"`) && /^https:\/\/flourishmoney\.app\//.test(L.LOGO_URL), `3b ${who}: the logo comes from flourishmoney.app`);
    const hrefs = [...p.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    t.eq([...new Set(hrefs)].sort(), (founding ? [E.FOUNDING_LINK_URL, unsub] : [unsub]).sort(), `3c ${who}: the only links are ${founding ? "the founding link and " : ""}the unsubscribe link, exactly`);
    if (founding) t.ok(hrefs.filter((h) => h === E.FOUNDING_LINK_URL).length === 2 && E.FOUNDING_LINK_URL === "https://flourishmoney.app/?checkout=founding", `3d ${who}: the button and the text link are both exactly /?checkout=founding`);
    t.ok(!/utm_|<script|<style|class=|width="1"|height="1"|\/\/open\.|track|pixel|beacon|resend\.(com|dev)\/[a-z]/i.test(p.html), `3e ${who}: no pixel, no utm, no redirect, no script, no style block, no class`);
    t.ok(!("track_opens" in p) && !("track_clicks" in p) && !("tracking" in p), `3f ${who}: the payload asks Resend for no tracking`);

    // ── 4. Email-safe ────────────────────────────────────────────────────────────────────────────
    t.ok(/<table role="presentation"/.test(p.html) && !/<div/.test(p.html) && /max-width:560px/.test(p.html), `4a ${who}: table layout, no divs, max width 560px`);
    t.ok(new RegExp(`alt="${L.LOGO_ALT}"`).test(imgs[0]) && L.LOGO_ALT.length > 0, `4b ${who}: the logo has alt text`);
    t.ok(/<meta name="color-scheme" content="light">/.test(p.html) && /<meta name="viewport" content="width=device-width,initial-scale=1">/.test(p.html), `4c ${who}: light colour scheme declared, and a phone viewport`);
    t.ok(p.html.includes(L.FONT) && /Helvetica,Arial,sans-serif/.test(L.FONT), `4d ${who}: the app's font, with safe fallbacks`);
  }

  // ── 5. Readable as designed and inverted ───────────────────────────────────────────────────────
  const K = L.COLORS;
  for (const [fg, bg, what] of [[K.ink, K.card, "body text on the card"], [K.muted, K.page, "footer text on the page"], [K.onBrand, K.brand, "the button's label"], [K.brand, K.card, "the text link"]]) {
    t.ok(contrast(fg, bg) >= 4.5, `5a ${what}: ${contrast(fg, bg).toFixed(1)}:1 as designed`);
    t.ok(contrast(invert(fg), invert(bg)) >= 4.5, `5b ${what}: ${contrast(invert(fg), invert(bg)).toFixed(1)}:1 inverted (a forced dark mode)`);
  }
  t.summary("brandedEmail");
})();
