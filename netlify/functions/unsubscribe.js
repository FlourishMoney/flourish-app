/**
 * Flourish Money — waitlist unsubscribe (CASL)
 * netlify/functions/unsubscribe.js   (routed from /api/unsubscribe in netlify.toml)
 *
 * Every waitlist email carries a signed per-row link (_lib/waitlistUnsubscribe.js) in its footer and in
 * its List-Unsubscribe header. No login.
 *
 *   GET  ?id=<row id>&t=<signature>   a page with ONE button, "Unsubscribe". GET changes nothing, because
 *                                     mail security scanners open every link in a message, and a GET that
 *                                     unsubscribed would take people off the list who never asked.
 *   POST ?id=<row id>&t=<signature>   sets unsubscribed_at on that row. This is the button, and also the
 *                                     one-click POST a mailbox sends for "List-Unsubscribe-Post:
 *                                     List-Unsubscribe=One-Click" (RFC 8058).
 *
 * A bad or forged signature changes nothing and says so. unsubscribed_at is set once and kept (the first
 * unsubscribe is the one on record). Nothing is logged but a fixed message and a status word: never the
 * row id, the signature or an address.
 *
 * Env: SUPABASE_URL, SUPABASE_SECRET_KEY; WAITLIST_UNSUBSCRIBE_SECRET optional (see the lib).
 */
"use strict";
const { verifyUnsubscribeToken, ROW_ID_RX } = require("./_lib/waitlistUnsubscribe");

const PATCH_TIMEOUT_MS = 4000;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

function page(title, body, statusCode = 200) {
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${title}</title></head>`,
    '<body style="margin:0;background:#F4F1EB;color:#1A2035;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;">',
    '<main style="max-width:480px;margin:0 auto;padding:48px 24px;font-size:16px;line-height:1.6;">',
    `<h1 style="font-size:24px;margin:0 0 16px;">${title}</h1>`,
    body,
    '</main></body></html>',
  ].join("");
  return { statusCode, headers: HEADERS, body: html };
}

const HELP = '<p>If you still want off the list, email <a href="mailto:hello@flourishmoney.app?subject=unsubscribe" style="color:#1A2035;">hello@flourishmoney.app</a> and we will remove you.</p>';

async function setUnsubscribed(supabaseUrl, secretKey, id) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PATCH_TIMEOUT_MS);
  try {
    // unsubscribed_at=is.null: the first unsubscribe is the one on record; a repeat changes nothing.
    const res = await fetch(`${supabaseUrl}/rest/v1/waitlist?id=eq.${encodeURIComponent(id)}&unsubscribed_at=is.null`, {
      method: "PATCH",
      headers: {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
      signal: controller.signal,
    });
    if (!res.ok) console.error("[unsubscribe] update failed", res.status);
    return res.ok;
  } catch (err) {
    const aborted = !!err && (err.name === "AbortError" || err.name === "TimeoutError");
    console.error("[unsubscribe] update failed", aborted ? "timeout" : "no_status");
    return false;
  } finally {
    clearTimeout(deadline);
  }
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const id = typeof q.id === "string" ? q.id : "";
  const t = typeof q.t === "string" ? q.t : "";

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { ...HEADERS, "Allow": "GET, POST" }, body: "" };
  }
  if (!ROW_ID_RX.test(id) || !verifyUnsubscribeToken(id, t)) {
    return page("This unsubscribe link isn't valid", "<p>Nothing was changed.</p>" + HELP, 400);
  }

  if (event.httpMethod === "GET") {
    const action = `/api/unsubscribe?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`;
    return page("Unsubscribe from flourish emails",
      "<p>You will get no more emails from the flourish waitlist, including the launch email.</p>" +
      `<form method="post" action="${action}"><button type="submit" style="font:inherit;font-weight:700;padding:12px 22px;border-radius:12px;border:none;background:#1f6b22;color:#fff;cursor:pointer;">Unsubscribe</button></form>`);
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!supabaseUrl || !secretKey || !(await setUnsubscribed(supabaseUrl, secretKey, id))) {
    return page("We couldn't unsubscribe you just now", "<p>Please try the link again in a minute.</p>" + HELP, 503);
  }
  return page("You're unsubscribed", "<p>You will get no more emails from the flourish waitlist. Sorry to see you go.</p>");
};
