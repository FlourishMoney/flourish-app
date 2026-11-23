// netlify/functions/_lib/serverAlert.js
// -----------------------------------------------------------------------------
// AN ERROR THE SERVER SENDS TO THE ERROR TRACKER ITSELF (round 7 of the Plus review, 2026-11-23, R7-1).
//
// For the few states that need a person and that the database cannot be trusted to remember, because the database
// failing is part of the state: a bank Item still live at Plaid with no row here. A line in the function log is not
// enough (nobody is paged by it, and it ages out), so the same fact goes to the error tracker the app already uses,
// and to the support inbox (_lib/supportAlert.js).
//
// No SDK: one POST of Sentry's envelope to the project's own address (its DSN). The DSN is the public one the app
// already ships (VITE_SENTRY_DSN); a server-only SENTRY_DSN is used first when set. With neither (a preview, a local
// run) nothing is sent: SERVER_ALERT_SKIPPED.
//
// WHAT MAY BE SENT: a short message, short tags and a few named facts the caller chooses (an item id, a path, an
// account id). NEVER a token, a key, an email address or an amount: the caller passes none, and nothing is added here.
// Never throws, and never holds up the request for more than TIMEOUT_MS.
// -----------------------------------------------------------------------------
"use strict";
const crypto = require("crypto");

const TIMEOUT_MS = 4000;

// "https://<public key>@<host>/<project id>" -> where to post, and with which key. null when it is not one.
// Read with one pattern, part by part: scheme, the public key before the "@", the host, the numeric project id.
function parseDsn(dsn) {
  const m = /^(https?):\/\/([A-Za-z0-9_-]+)@([A-Za-z0-9.-]+(?::\d+)?)\/(\d+)\/?$/.exec(String(dsn || "").trim());
  if (!m) return null;
  const [, scheme, key, host, project] = m;
  return { key, url: `${scheme}://${host}/api/${project}/envelope/`, dsn: `${scheme}://${key}@${host}/${project}` };
}

const short = (v, n = 200) => String(v == null ? "" : v).slice(0, n);

async function reportServerError({ message, tags = {}, extra = {} } = {}, { env = process.env, fetchImpl = (typeof fetch === "function" ? fetch : null), now = Date.now() } = {}) {
  try {
    const target = parseDsn(env.SENTRY_DSN || env.VITE_SENTRY_DSN);
    if (!target || !fetchImpl || !message) { console.log("[server-alert] SERVER_ALERT_SKIPPED", short(message, 80)); return false; }
    const event_id = crypto.randomBytes(16).toString("hex");
    const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => [short(k, 32), short(v)]));
    const event = {
      event_id, timestamp: now / 1000, platform: "node", level: "error", logger: "flourish.server",
      server_name: "netlify-functions", environment: short(env.CONTEXT || "production", 40),
      message: { formatted: short(message, 500) }, tags: clean(tags), extra: clean(extra),
      fingerprint: [short(tags.flag || message, 80), short(tags.path || "", 80)],
    };
    const body = [JSON.stringify({ event_id, sent_at: new Date(now).toISOString(), dsn: target.dsn }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n") + "\n";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=flourish-server/1.0, sentry_key=${target.key}` },
        body, signal: controller.signal,
      });
      if (!res || !res.ok) { console.error("[server-alert] send failed", res ? res.status : "no_status"); return false; }
      return true;
    } finally { clearTimeout(timer); }
  } catch (e) {
    console.error("[server-alert] send failed", e && e.name === "AbortError" ? "timeout" : "no_status");
    return false;
  }
}

module.exports = { reportServerError, parseDsn };
