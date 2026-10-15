/**
 * Flourish Money — confirm an email address for the founding price
 * netlify/functions/founding-confirm.js   (routed from /api/founding-confirm in netlify.toml)
 *
 * The link in the "Confirm your email address for your founding price" email (_lib/foundingConfirm.js),
 * which an older account holding a founding address asks for from the checkout screen.
 *
 *   GET  ?u=<account id>&x=<expiry>&t=<signature>   a page with ONE button. GET changes nothing: mail
 *                                                   security scanners open every link in a message.
 *   POST (the same query)                           checks the signature, the expiry, and that the
 *                                                   account's address is still the one the link was sent
 *                                                   to; then sets app_metadata.email_confirmation = "link".
 *
 * Nothing is logged but a fixed message and a status word: never the account id, the signature or an
 * address. The account's other app_metadata is kept as it is.
 */
"use strict";
const { getAdminClient } = require("./_lib/auth");
const { checkConfirm } = require("./_lib/foundingConfirm");

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The pages' words, exactly.
const PAGES = Object.freeze({
  prompt:  { title: "Confirm your email address", body: "This confirms the email address of your flourish account, so your founding price can be matched to it.", button: "Confirm my email address" },
  done:    { title: "Email address confirmed", body: "Your founding price is now matched to this address. Go back to flourishmoney.app, then Settings, See plans, and choose Founding Annual." },
  expired: { title: "This link has expired", body: "Links work for 24 hours. Ask for a new one from See plans on flourishmoney.app." },
  invalid: { title: "This link isn't valid", body: "Ask for a new one from See plans on flourishmoney.app." },
  error:   { title: "Something went wrong", body: "Nothing was changed. Try the link again in a moment." },
});

function page(which, statusCode = 200, form = "") {
  const c = PAGES[which];
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${_esc(c.title)}</title></head>`,
    '<body style="margin:0;background:#F4F1EB;color:#1A2035;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;">',
    '<main style="max-width:480px;margin:0 auto;padding:48px 24px;font-size:16px;line-height:1.6;">',
    `<h1 style="font-size:24px;margin:0 0 16px;">${_esc(c.title)}</h1>`,
    `<p>${_esc(c.body)}</p>`,
    form,
    '</main></body></html>',
  ].join("");
  return { statusCode, headers: HEADERS, body: html };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return page("invalid", 405);
  const q = event.queryStringParameters || {};
  // The shape first: a link that cannot be ours never reaches the database.
  if (!UUID_RX.test(String(q.u || "")) || !/^\d{1,12}$/.test(String(q.x || "")) || !q.t) return page("invalid", 400);

  let admin;
  try { admin = getAdminClient(); }
  catch { console.error("[founding-confirm] admin client unavailable"); return page("error", 500); }

  let user = null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(String(q.u));
    if (error) { console.error("[founding-confirm] account read failed"); return page("error", 500); }
    user = data && data.user;
  } catch {
    console.error("[founding-confirm] account read failed");
    return page("error", 500);
  }
  // Checked against the account's address NOW: a link sent before the address changed stops working.
  const verdict = user && user.email ? checkConfirm(q, user.email) : "invalid";
  if (verdict === "expired") return page("expired", 410);
  if (verdict !== "ok") return page("invalid", 400);

  if (event.httpMethod === "GET") {
    const action = `/api/founding-confirm?u=${encodeURIComponent(q.u)}&x=${encodeURIComponent(q.x)}&t=${encodeURIComponent(q.t)}`;
    const form = `<form method="post" action="${_esc(action)}" style="margin-top:24px;"><button type="submit" style="font-size:16px;font-weight:700;padding:14px 22px;border-radius:12px;border:0;background:#1A2035;color:#F4F1EB;cursor:pointer;">${_esc(PAGES.prompt.button)}</button></form>`;
    return page("prompt", 200, form);
  }

  try {
    const app_metadata = { ...(user.app_metadata || {}), email_confirmation: "link" };
    const { error } = await admin.auth.admin.updateUserById(String(q.u), { app_metadata });
    if (error) { console.error("[founding-confirm] update failed"); return page("error", 500); }
  } catch {
    console.error("[founding-confirm] update failed");
    return page("error", 500);
  }
  console.log("[founding-confirm] confirmed");
  return page("done", 200);
};

exports.PAGES = PAGES;
