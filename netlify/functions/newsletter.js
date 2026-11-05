/**
 * Flourish — the "Canadian money dates this week" list (CASL, double opt-in)
 * netlify/functions/newsletter.js   (/api/newsletter, migration 0037)
 *
 *   GET                          { open, version, wording }. open is false until the table exists and email can be sent,
 *                                and the forms show nothing while it is.
 *   POST {email,consent,version,source}   stores the consent and sends the confirmation. The same answer whether or not the
 *                                address is already known. A confirmed address gets no second email.
 *   GET  ?do=confirm&...         one button. GET changes nothing: mail scanners open every link.
 *   POST ?do=confirm&...         confirmed: this is what puts the address on the list.
 *   GET  ?do=unsubscribe&...     one button.
 *   POST ?do=unsubscribe&...     unsubscribed at once (the button, or a mailbox's RFC 8058 one-click).
 *
 * Only public.newsletter_subscribers is read or written: never the waitlist. No address, IP or signature is logged.
 */
"use strict";
const { getStore } = require("@netlify/blobs");
const { getAdminClient } = require("./_lib/auth");
const { connectBlobs } = require("./_lib/blobsContext");
const { corsHeadersFor, isNativeRequest } = require("./_lib/cors");
const { cleanEmail, isEmail } = require("./_lib/emailAddress");
const { checkSignupLimit, recordEmailSent } = require("./_lib/signupLimit");
const N = require("./_lib/newsletter");

const PAGE_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAGES = Object.freeze({
  confirmPrompt: { title: "Confirm your sign-up", body: `One tap and you're on the list for ${N.NEWSLETTER_NAME}.`, button: "Confirm my sign-up" },
  confirmed: { title: "You're on the list", body: `You'll get ${N.NEWSLETTER_NAME}. Every email has a one-click unsubscribe.` },
  unsubscribePrompt: { title: "Unsubscribe", body: `Stop getting ${N.NEWSLETTER_NAME}.`, button: "Unsubscribe" },
  unsubscribed: { title: "You're unsubscribed", body: "You won't get this email again." },
  expired: { title: "This link has expired", body: "Sign up again at flourishmoney.app/newsletter." },
  invalid: { title: "This link isn't valid", body: "To unsubscribe, email hello@flourishmoney.app." },
  error: { title: "Something went wrong", body: "Nothing was changed. Try the link again in a moment, or email hello@flourishmoney.app." },
});

function page(which, statusCode = 200, action = "") {
  const c = PAGES[which];
  const form = action && c.button ? `<form method="post" action="${esc(action)}" style="margin-top:24px;"><button type="submit" style="font-size:16px;font-weight:700;padding:14px 22px;border:0;border-radius:10px;background:#007048;color:#FFFFFF;cursor:pointer;">${esc(c.button)}</button></form>` : "";
  return {
    statusCode,
    headers: PAGE_HEADERS,
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title></head><body style="margin:0;background:#F4F1EB;color:#1A2035;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><main style="max-width:480px;margin:0 auto;padding:48px 24px;font-size:16px;line-height:1.6;"><h1 style="font-size:24px;margin:0 0 16px;">${esc(c.title)}</h1><p>${esc(c.body)}</p>${form}</main></body></html>`,
  };
}

const clientIp = (event) => {
  const h = event.headers || {};
  return (h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "").split(",")[0].trim() || null;
};
const limitStore = () => { try { return getStore("signup_attempts"); } catch { return null; } };

async function handleLink(event, q, deps) {
  const self = `/api/newsletter?${new URLSearchParams(q).toString()}`;
  const now = deps.now();
  if (q.do === "unsubscribe") {
    if (!N.checkUnsubscribe(q.id, q.t)) return page("invalid", 400);
    if (event.httpMethod === "GET") return page("unsubscribePrompt", 200, self);
    try {
      const { error } = await deps.admin().from("newsletter_subscribers").update({ unsubscribed_at: now.toISOString() }).eq("id", q.id).is("unsubscribed_at", null);
      if (error) throw error;
    } catch { console.error("[newsletter] unsubscribe failed"); return page("error", 500); }
    return page("unsubscribed");
  }
  const verdict = N.checkConfirm(q.id, q.x, q.t, now);
  if (verdict === "expired") return page("expired", 410);
  if (verdict !== "ok") return page("invalid", 400);
  if (event.httpMethod === "GET") return page("confirmPrompt", 200, self);
  try {
    const admin = deps.admin();
    const { data: row, error } = await admin.from("newsletter_subscribers").select("consented_at,unsubscribed_at").eq("id", q.id).maybeSingle();
    if (error) throw error;
    if (!row) return page("invalid", 400);
    // A link from before an unsubscribe never undoes it: only a newer sign-up can.
    if (row.unsubscribed_at && new Date(row.consented_at) <= new Date(row.unsubscribed_at)) return page("invalid", 400);
    const { error: upErr } = await admin.from("newsletter_subscribers").update({ confirmed_at: now.toISOString(), unsubscribed_at: null }).eq("id", q.id);
    if (upErr) throw upErr;
  } catch { console.error("[newsletter] confirm failed"); return page("error", 500); }
  return page("confirmed");
}

async function handleSubscribe(event, deps, CORS) {
  const reply = (code, o) => ({ statusCode: code, headers: CORS, body: JSON.stringify(o) });
  let body = null;
  try { body = JSON.parse(event.body || "{}"); } catch { /* not JSON */ }
  if (!body || body.consent !== true || body.version !== N.CONSENT_VERSION) return reply(400, { error: "consent_required" });
  if (!N.SOURCES.includes(body.source)) return reply(400, { error: "invalid_source" });
  const email = cleanEmail(body.email).toLowerCase();
  if (!email || !isEmail(email)) return reply(400, { error: "invalid_email" });

  const store = deps.store(event);
  const limit = await checkSignupLimit({ store, ip: clientIp(event), email });
  if (!limit.allowed) return reply(429, { error: "rate_limited", message: limit.message });

  const now = deps.now();
  const h = event.headers || {};
  const consentRow = {
    email, consent: true, consent_version: N.CONSENT_VERSION, consent_wording: N.CONSENT_VERSIONS[N.CONSENT_VERSION],
    consented_at: now.toISOString(), source: body.source, ua_family: N.uaFamily(h["user-agent"] || h["User-Agent"], isNativeRequest(event)),
  };
  try {
    const admin = deps.admin();
    const { data: existing, error: readErr } = await admin.from("newsletter_subscribers").select("id,confirmed_at,confirm_sent_at,unsubscribed_at").eq("email", email).maybeSingle();
    if (readErr) throw readErr;
    if (existing && existing.confirmed_at && !existing.unsubscribed_at) return reply(200, { ok: true });
    if (existing && existing.confirm_sent_at && now.getTime() - new Date(existing.confirm_sent_at).getTime() < N.RESEND_AGAIN_MS) return reply(200, { ok: true });
    let id = existing && existing.id;
    if (id) {
      // Back after unsubscribing: new consent, and off the list until it is confirmed.
      const { error } = await admin.from("newsletter_subscribers").update({ ...consentRow, confirmed_at: null }).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("newsletter_subscribers").insert(consentRow).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    const sent = await deps.send(N.confirmationEmail({ to: email, rowId: id, now }), `newsletter-confirm/${id}/${now.getTime()}`);
    if (sent) {
      await recordEmailSent({ store, email });
      await admin.from("newsletter_subscribers").update({ confirm_sent_at: now.toISOString() }).eq("id", id);
    }
    return reply(sent ? 200 : 503, sent ? { ok: true } : { error: "unavailable" });
  } catch {
    console.error("[newsletter] sign-up failed");
    return reply(503, { error: "unavailable" });
  }
}

async function route(event, deps) {
  const CORS = { ...corsHeadersFor(event), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "" };
  const q = event.queryStringParameters || {};
  if (q.do === "confirm" || q.do === "unsubscribe") return handleLink(event, q, deps);
  if (event.httpMethod === "POST") return handleSubscribe(event, deps, CORS);
  let open = false;
  try {
    if ((process.env.RESEND_API_KEY || "").trim()) {
      const { error } = await deps.admin().from("newsletter_subscribers").select("id", { head: true }).limit(1);
      open = !error;
    }
  } catch { open = false; }
  const headers = { ...CORS, "Cache-Control": "public, max-age=60" };
  return { statusCode: 200, headers, body: JSON.stringify(open ? { open, name: N.NEWSLETTER_NAME, version: N.CONSENT_VERSION, wording: N.CONSENT_VERSIONS[N.CONSENT_VERSION] } : { open }) };
}

const LIVE = {
  admin: () => getAdminClient(),
  store: (event) => { connectBlobs(event); return limitStore(); },
  send: (payload, key) => N.sendEmail(payload, key),
  now: () => new Date(),
};
exports.handler = (event) => route(event, LIVE);
exports._test = { route, PAGES };
