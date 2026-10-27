// netlify/functions/_lib/emailLayout.js
// -----------------------------------------------------------------------------
// THE FLOURISH EMAIL LAYOUT (2026-10-26): one shared HTML frame for the waitlist's billing-day emails
// (_lib/foundingLinkEmail.js: the founding link email, and the Canada launch email).
//
// It carries the email's words exactly as given: it adds no sentence of its own. The only words it can add are a
// button's label, passed in by the caller. Everything about how it looks:
//   - the lowercase flourish wordmark (the brand lockup, public/email/flourish-wordmark.png) at the top, from an
//     absolute https://flourishmoney.app URL (never an attachment). The PNG carries its own cream tile in the page's
//     colour, so in light mode it reads as the bare wordmark and in a client's forced dark mode as a cream badge (the
//     dark green word is never lost on a dark page). Images blocked: the alt text "flourish" is styled as the
//     wordmark (bold brand green on the page), so the header still reads;
//   - a white card, max 560px wide, on the app's soft background (#F4F1EB), centred;
//   - the app's light-theme ink (#1A2035) and brand green (#007048: white text on it is 6.4:1, AA at any size);
//   - the app's font, Plus Jakarta Sans, with system fallbacks (Apple, Segoe UI, Helvetica, Arial);
//   - one button (a bulletproof table cell with an <a>, so Outlook draws it), and the plain URL as a text link under
//     it, so the link works when buttons or images are blocked;
//   - the CASL footer and one-click unsubscribe at the bottom, in small grey text, exactly as given.
// EMAIL-SAFE: table layout, inline styles only (no <style> block, no class), no web font download, no script.
// DARK MODE: the page declares light only (color-scheme), so Apple Mail and iOS keep it as designed; Gmail and
// Outlook apps that force their own dark mode invert a dark-ink-on-white design cleanly, and every colour pair here
// stays readable inverted (tests/brandedEmail.test.cjs checks the contrast both ways).
// NO TRACKING: no pixel, no image but the logo, no redirect or tracked link; Resend's open and click tracking are
// off for these sends (the payload asks for neither, and the domain setting is the account's).
// -----------------------------------------------------------------------------
"use strict";

const LOGO_URL = "https://flourishmoney.app/email/flourish-wordmark.png";
const LOGO_SIZE = Object.freeze({ width: 132, height: 48 });   // the PNG is 3x: 396 x 144
const LOGO_ALT = "flourish";
const COLORS = Object.freeze({
  page: "#F4F1EB",     // the app's light background
  card: "#FFFFFF",
  ink: "#1A2035",      // the app's light-theme text
  muted: "#5B6170",    // small grey footer text: 6.2:1 on white
  rule: "#E6E1D8",
  brand: "#007048",    // the app's light-theme green
  onBrand: "#FFFFFF",
});
const FONT = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// An href exactly as the url is (our own links: the founding link and a signed unsubscribe link), so the link a
// client opens is byte for byte the one the plain text shows. A url that could break out of the attribute is refused.
const href = (u) => { const s = String(u); if (/["<>\s]/.test(s) || !/^https:\/\//.test(s)) throw new Error("email link refused"); return s; };

/**
 * The whole HTML document.
 * @param {object} a
 * @param {string}   a.title       the subject, for <title>
 * @param {string[]} a.paragraphs  the body, in order, exactly as written; one of them may be the link line
 * @param {object}  [a.link]       { line, url, button }: `line` is the paragraph that carries the link (it is drawn as
 *                                 the button, then that same line with the url as a text link); `button` the label
 * @param {string[]} a.footer      the CASL footer lines, in order, exactly as written; a line that ends with `unsubscribeUrl`
 *                                 has that url drawn as a link
 * @param {string}   a.unsubscribeUrl
 */
function emailHtml({ title, paragraphs, link = null, footer, unsubscribeUrl }) {
  const p = (html, extra = "") => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.ink};${extra}">${html}</p>`;
  const body = paragraphs.map((t) => {
    if (!link || t !== link.line) return p(esc(t));
    const label = t.endsWith(link.url) ? t.slice(0, t.length - link.url.length) : `${t} `;
    return [
      // The button: a table cell with the link inside, drawn the same in Outlook, Gmail and Apple Mail.
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;border-collapse:separate;">`,
      `<tr><td align="center" bgcolor="${COLORS.brand}" style="border-radius:10px;background-color:${COLORS.brand};">`,
      `<a href="${href(link.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${COLORS.onBrand};text-decoration:none;border-radius:10px;">${esc(link.button)}</a>`,
      `</td></tr></table>`,
      // The same line as the plain text, with the url as a text link: works with buttons or images blocked.
      p(`${esc(label)}<a href="${href(link.url)}" style="color:${COLORS.brand};text-decoration:underline;word-break:break-all;">${esc(link.url)}</a>`, "font-size:14px;"),
    ].join("");
  });
  const small = (html) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted};">${html}</p>`;
  const foot = footer.map((l) => (unsubscribeUrl && l.endsWith(unsubscribeUrl)
    ? small(`${esc(l.slice(0, l.length - unsubscribeUrl.length))}<a href="${href(unsubscribeUrl)}" style="color:${COLORS.muted};text-decoration:underline;word-break:break-all;">${esc(unsubscribeUrl)}</a>`)
    : small(esc(l))));
  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${COLORS.page};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background-color:${COLORS.page};">`,
    `<tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">`,
    // The wordmark, above the card. Its alt text is styled as the wordmark, for clients that block images.
    `<tr><td align="left" style="padding:0 0 12px;"><img src="${LOGO_URL}" width="${LOGO_SIZE.width}" height="${LOGO_SIZE.height}" alt="${LOGO_ALT}" style="display:block;width:${LOGO_SIZE.width}px;height:${LOGO_SIZE.height}px;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:26px;font-weight:800;line-height:${LOGO_SIZE.height}px;letter-spacing:-0.3px;color:${COLORS.brand};"></td></tr>`,
    // The card: the body.
    `<tr><td bgcolor="${COLORS.card}" style="background-color:${COLORS.card};border-radius:14px;padding:28px 24px 12px;border:1px solid ${COLORS.rule};">`,
    body.join(""),
    `</td></tr>`,
    // The footer, under the card, small and grey.
    `<tr><td style="padding:20px 4px 0;">`,
    foot.join(""),
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

module.exports = { emailHtml, LOGO_URL, LOGO_ALT, LOGO_SIZE, COLORS, FONT };
