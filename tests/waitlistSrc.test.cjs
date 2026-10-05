// tests/waitlistSrc.test.cjs
// -----------------------------------------------------------------------------
// THE WAITLIST RECORDS WHICH CAMPAIGN BROUGHT EACH SIGNUP.
//
// Campaign links carry ?src= (ig, fb, tt, calendar, clawback, email, press, meta_a, meta_b). The form reads it on page
// load, keeps it for the browser session, and sends it with the join. The server stores a known src in
// the source column and anything else as "direct" (never empty, never free text), moves the form's
// position into metadata.placement, and keeps utm_* exactly as captured.
// Runs the REAL beta.js handler with fetch stubbed, and the real browser helper with a fake sessionStorage.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const BETA = path.join(REPO, "netlify", "functions", "beta.js");
const KNOWN = ["ig", "fb", "tt", "calendar", "clawback", "email", "press", "meta_a", "meta_b"];

async function join(extra) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env[["RESEND", "API", "KEY"].join("_")]; // no email: this suite is about the row
  delete require.cache[require.resolve(BETA)];
  const beta = require(BETA);
  const calls = [];
  const real = global.fetch, quiet = console.error;
  console.error = () => {};
  global.fetch = async (url, o = {}) => {
    calls.push({ url: String(url), method: o.method || "GET", body: o.body });
    return { ok: true, status: 201, json: async () => [{ id: "row-1" }], text: async () => "" };
  };
  try {
    const res = await beta.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({
      action: "join_waitlist", email: "person@example.com", consentVersion: require(path.join(REPO, "netlify", "functions", "_lib", "waitlistConsent.js")).CONSENT_VERSION, placement: "hero", ...extra }) });
    const ins = calls.find(c => c.method === "POST" && c.url.endsWith("/rest/v1/waitlist"));
    return { status: res.statusCode, body: JSON.parse(res.body || "{}"), row: ins ? JSON.parse(ins.body) : null };
  } finally { global.fetch = real; console.error = quiet; }
}

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

(async () => {
  const t = create();

  // ── 1. Each known src is stored as the row's source ──────────────────────────────────────────
  for (const src of KNOWN) {
    const r = await join({ src });
    t.eq([r.status, r.row && r.row.source], [200, src], `1 src "${src}" is stored as source`);
  }
  t.eq((await join({ src: " IG " })).row.source, "ig", "1b case and surrounding spaces do not make a known src unknown");
  // The Meta ads (live since 2026-10-05) link to https://flourishmoney.app/?src=meta_a and ?src=meta_b: from the
  // landing URL, through the browser helper, to the stored row.
  {
    const W = await import("../src/lib/waitlistSrc.js");
    for (const src of ["meta_a", "meta_b"]) {
      const r = await join({ src: W.captureWaitlistSrc(`?src=${src}`, fakeStorage()) });
      t.eq([r.status, r.row && r.row.source], [200, src], `1c a visitor from https://flourishmoney.app/?src=${src} is stored with source "${src}"`);
    }
    const r = await join({ src: W.captureWaitlistSrc("?src=meta_c", fakeStorage()) });
    t.eq([r.status, r.row && r.row.source], [200, "direct"], "1d an unknown src (?src=meta_c) is still stored as \"direct\"");
  }

  // ── 2. Unknown or missing src is stored as "direct" (never empty, never free text) ───────────
  for (const [label, src] of [["an unknown src", "tiktok_ads"], ["free text", "hello <b>world</b>"], ["no src", undefined], ["an empty src", ""],
                              ["a non-string src", { a: 1 }], ["a form position passed as src", "hero"]]) {
    const r = await join({ src });
    t.eq([r.status, r.row && r.row.source], [200, "direct"], `2 ${label} is stored as "direct"`);
  }

  // ── 3. The placement lands in metadata; utm_* kept as captured ───────────────────────────────
  {
    const utm = { utm_source: "instagram", utm_campaign: "launch", referrer: "https://l.instagram.com/" };
    const r = await join({ src: "ig", placement: "bottom_cta", metadata: utm });
    t.eq(r.row.metadata, { ...utm, placement: "bottom_cta" }, "3a metadata keeps utm_* and referrer exactly, and adds the placement");
    const spoof = await join({ src: "ig", placement: "hero", metadata: { placement: "somewhere_else" } });
    t.eq(spoof.row.metadata.placement, "hero", "3b a placement inside the sent metadata cannot override the form's own");
    t.eq((await join({ metadata: ["not", "an", "object"] })).row.metadata, { placement: "hero" }, "3c a non-object metadata is dropped, the placement kept");
    const legacy = await join({ placement: undefined, source: "bottom_cta", src: "fb" });
    t.eq([legacy.status, legacy.row.source, legacy.row.metadata.placement], [200, "fb", "bottom_cta"],
      "3d a page cached from before this change (position sent as source) still joins, with the position as placement");
  }

  // ── 4. src survives a reload in the same session ─────────────────────────────────────────────
  {
    const W = await import("../src/lib/waitlistSrc.js");
    const st = fakeStorage();
    t.eq(W.captureWaitlistSrc("?src=ig", st), "ig", "4a the landing page load reads ?src=ig");
    t.eq(W.captureWaitlistSrc("", st), "ig", "4b a reload without ?src= in the same session still has ig");
    t.eq(W.captureWaitlistSrc("?utm_source=x", st), "ig", "4c …and so does a page with other parameters only");
    t.eq(W.captureWaitlistSrc("?src=press", st), "press", "4d a later campaign link replaces it");
    t.eq(W.captureWaitlistSrc("", fakeStorage()), "", "4e a new session with no ?src= has none (the server stores direct)");
    const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
    t.eq([W.captureWaitlistSrc("?src=tt", broken), W.captureWaitlistSrc("", broken)], ["tt", ""],
      "4f with storage refused, the src still goes with this page's join, and nothing throws");
    t.eq(W.captureWaitlistSrc("?src=" + "x".repeat(200), fakeStorage()).length, 32, "4g an absurdly long src is cut before it is stored");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/useEffect\(\(\) => \{ captureWaitlistSrc\(\); \}, \[\]\);/.test(app), "4h the form reads ?src= when the page loads");
    t.ok(/placement: tag, src: captureWaitlistSrc\(\),/.test(app), "4i …and sends the placement and the session's src with the join");
  }

  t.summary("waitlistSrc.test");
})();
