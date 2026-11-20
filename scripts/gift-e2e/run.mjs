#!/usr/bin/env node
// scripts/gift-e2e/run.mjs
// -----------------------------------------------------------------------------
// THE GIFTS END TO END, IN STRIPE TEST MODE, ON THIS MAC ONLY. Never production: a throwaway local Supabase (project
// flourish-gift-e2e, ports 553xx, scripts/gift-e2e/supabase), the real functions run in this process, the real pages
// served from a local build, and Stripe in TEST mode (a sk_test_ key from ~/keys/flourish-stripe-test.env, which
// scripts/gift-e2e/set-stripe-test-key.sh writes; a live key is refused).
//
//   1  buy "a year of flourish" on the gift page, emailed to the recipient today; pay on Stripe's own test Checkout
//      with Stripe's published test card
//   2  Stripe's real checkout.session.completed event, fetched from Stripe and posted to the local webhook (signed with
//      a local secret): one code; the same event again makes no second code and no second email
//   3  Email 1 (captured: there is no email key on this Mac) and the printable card it links to, with its QR code read
//      back by macOS's own QR reader
//   4  Email 2 from the 15-minute job: sent once, a second run sends nothing; a gift for a later day waits for 7 a.m.
//      Eastern on that day
//   5  redeem on the website, signing in through the website's own sign-in screen: the plan turns on for 12 months, and
//      the website, iPhone and Android status calls all say paid
//   6  a second account redeeming the same code is told it was already redeemed
//   7  buy "a year of flourish with Plus", refund it through Stripe's test API, post the real charge.refunded event: the
//      unused code is void, and redeeming it says so
// Words: the drafts in docs/review/GIFT-COPY.md are put in place of the placeholders, here only, so the screens read
// as they would once approved. Output: docs/review/gift-e2e/ (screenshots, the captured emails, results.json).
//
//   node scripts/gift-e2e/run.mjs                  everything (needs the Stripe test key)
//   node scripts/gift-e2e/run.mjs --local-payment  everything but Stripe itself: the checkout's parameters, exactly as
//                                                  the page sends them, become a paid Stripe-shaped session and event
//                                                  here (no key needed; labelled as such in the results)
//   node scripts/gift-e2e/run.mjs --keep           leave the local Supabase running afterwards
// -----------------------------------------------------------------------------
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(REPO, "docs", "review", "gift-e2e");
const PORT = 8899;
const LOCAL = `http://localhost:${PORT}`;
const WEBHOOK_SECRET = `whsec_local_e2e_${crypto.randomBytes(8).toString("hex")}`;
const KEEP = process.argv.includes("--keep");
const LOCAL_PAY = process.argv.includes("--local-payment");
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`); return !!ok; };
const die = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the Stripe TEST key ───────────────────────────────────────────────────────────────────────────────
const keyFile = path.join(os.homedir(), "keys", "flourish-stripe-test.env");
if (!LOCAL_PAY && !fs.existsSync(keyFile)) die(`no Stripe test key: run scripts/gift-e2e/set-stripe-test-key.sh first (${keyFile}), or use --local-payment`);
const STRIPE_KEY = LOCAL_PAY ? "" : (/^STRIPE_SECRET_KEY=(.+)$/m.exec(fs.readFileSync(keyFile, "utf8")) || [])[1]?.trim() || "";
if (!LOCAL_PAY && !STRIPE_KEY.startsWith("sk_test_")) die("the saved key is not a Stripe TEST key; nothing was done");
const stripe = async (method, p, form = null) => {
  const res = await fetch(`https://api.stripe.com/v1${p}`, { method, headers: { Authorization: `Bearer ${STRIPE_KEY}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined });
  const j = await res.json();
  if (!res.ok) throw new Error(`stripe ${method} ${p}: ${j?.error?.message || res.status}`);
  return j;
};

// ── preflight: where would Stripe send this test's events? ────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
let TAX_ON = true;
if (LOCAL_PAY) {
  console.log("0. --local-payment: Stripe is not called; each paid session is built here from the checkout's own parameters");
  check("payment simulated locally (no Stripe key on this Mac yet)", true, "Stripe Checkout and Stripe's own events are NOT exercised in this run");
} else {
  console.log("0. Stripe test mode, read only");
  const acct = await stripe("GET", "/balance");
  if (acct.livemode !== false) die("that key is not in test mode");
  const hooks = (await stripe("GET", "/webhook_endpoints?limit=100")).data || [];
  const toProd = hooks.filter((h) => h.status === "enabled" && /flourishmoney\.app/.test(h.url) && !/--|deploy-preview/.test(h.url));
  check("test mode key", true);
  fs.writeFileSync(path.join(OUT, "stripe-test-webhooks.json"), JSON.stringify(hooks.map((h) => ({ url: h.url, status: h.status, events: h.enabled_events })), null, 2));
  if (toProd.length) die(`a test-mode webhook endpoint points at the live site (${toProd.map((h) => h.url).join(", ")}): a test purchase would send events there. Stopped before buying anything.`);
  check("no test-mode webhook endpoint points at the live site", true, hooks.length ? `${hooks.length} endpoint(s), none on flourishmoney.app` : "none");
  const taxSettings = await stripe("GET", "/tax/settings").catch(() => null);
  TAX_ON = !!taxSettings && taxSettings.status === "active";
  check("Stripe Tax settings in test mode", true, TAX_ON ? "active: checkout adds tax" : `status ${taxSettings ? taxSettings.status : "unreadable"}: run with tax off`);
}

// ── 1. a throwaway local Supabase ─────────────────────────────────────────────────────────────────────
console.log("1. local Supabase (flourish-gift-e2e)");
const sb = (args) => spawnSync("supabase", args, { cwd: HERE, encoding: "utf8" });
let st = sb(["status", "-o", "json"]);
if (st.status !== 0) {
  const up = sb(["start", "-x", "studio,imgproxy,logflare,vector,storage-api,edge-runtime,realtime,postgres-meta,supavisor,mailpit"]);
  if (up.status !== 0) die(`supabase start failed: ${(up.stderr || up.stdout).split("\n").slice(-5).join(" ")}`);
  st = sb(["status", "-o", "json"]);
}
const S = JSON.parse(st.stdout.slice(st.stdout.indexOf("{")));
const SB_URL = S.API_URL, SB_ANON = S.ANON_KEY, SB_SERVICE = S.SERVICE_ROLE_KEY, DB_URL = S.DB_URL;
if (!/^http:\/\/127\.0\.0\.1:553/.test(SB_URL)) die(`unexpected Supabase address ${SB_URL}: this must be the throwaway local stack`);
const psql = (q) => execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", q], { encoding: "utf8" }).trim();
const migs = fs.readdirSync(path.join(REPO, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
const migFailed = [];
const already = psql("select to_regclass('public.gift_codes') is not null") === "t";
for (const f of already ? ["0050_gift_codes.sql"] : migs) {
  try { execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-qX", "-f", path.join(REPO, "supabase", "migrations", f)], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { migFailed.push(`${f}: ${String(e.stderr || "").split("\n").find((l) => /ERROR/.test(l)) || "error"}`); }
}
psql("notify pgrst, 'reload schema'");
check("migrations applied to the local database", !migFailed.some((m) => /^00(09|10|50)_/.test(m)), migFailed.length ? `${migFailed.length} older one(s) did not apply here: ${migFailed.map((m) => m.split(":")[0]).join(", ")}` : `all ${migs.length}`);
psql("delete from public.gift_codes where not livemode; delete from public.billing_events where provider = 'stripe' and type in ('checkout.session.completed','charge.refunded');");

// ── 2. the site, built against the local Supabase, and the functions ──────────────────────────────────
console.log("2. build the website against the local Supabase");
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-gift-e2e-"));
execFileSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "error"], { cwd: REPO, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, VITE_SUPABASE_URL: SB_URL, VITE_SUPABASE_PUBLISHABLE_KEY: SB_ANON } });
const DRAFTS = {};
for (const m of fs.readFileSync(path.join(REPO, "docs", "review", "GIFT-COPY.md"), "utf8").matchAll(/^\| `(gift-[a-z0-9-]+)` \| [^|]+ \| ([^|]+) \| (pending|approved) \|$/gm)) DRAFTS[m[1]] = m[2].trim();
const withDrafts = (s) => s.replace(/\[WORDS: (gift-[a-z0-9-]+)\]/g, (x, id) => DRAFTS[id] ?? x);

Object.assign(process.env, {
  GIFTS_ENABLED: "true", BILLING_ENABLED: "true", IAP_ENABLED: "true", SUPABASE_URL: SB_URL, SUPABASE_SECRET_KEY: SB_SERVICE,
  STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_TAX_ENABLED: TAX_ON ? "true" : "", APP_ORIGIN: "https://flourishmoney.app",
  RESEND_API_KEY: "re_e2e_captured_not_sent", LIMITER_HASH_SECRET: "e2e-local",
});
const FN = path.join(REPO, "netlify", "functions");
const wordsPath = require.resolve(path.join(FN, "_lib", "giftWords.js"));
const realWords = require(wordsPath);
require.cache[wordsPath].exports = { ...realWords, GIFT_WORDS: Object.freeze({ ...realWords.GIFT_WORDS, ...DRAFTS }),
  giftWords: (id, vars, w) => realWords.giftWords(id, vars, w || { ...realWords.GIFT_WORDS, ...DRAFTS }) };
const giftFn = require(path.join(FN, "gift.js"));
const hookFn = require(path.join(FN, "stripe-webhook.js"));
const billingFn = require(path.join(FN, "billing.js"));
const sweepFn = require(path.join(FN, "gift-send-sweep.js"));
const gifts = require(path.join(FN, "_lib", "gifts.js"));
const { createClient } = require(require.resolve("@supabase/supabase-js", { paths: [FN] }));
const admin = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// Email: there is no Resend key on this Mac (it is a production key), so every email is captured, not sent.
const emails = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  if (String(url) === "https://api.resend.com/emails") {
    const body = JSON.parse(init.body);
    emails.push({ key: init.headers["Idempotency-Key"], ...body });
    return { ok: true, status: 200, json: async () => ({ id: `captured_${emails.length}` }) };
  }
  return realFetch(url, init);
};
// --local-payment: what Stripe would hold. The checkout's parameters are kept as gift.js sent them, and "paying" turns
// them into a paid session (13% HST on top, as Stripe Tax charges in Ontario) and its event.
const localSessions = new Map();
let localN = 0;
const localStripePost = async (p, params) => {
  if (p !== "/checkout/sessions") throw new Error(`local payment: unexpected ${p}`);
  const id = `cs_test_local_${Date.now()}_${++localN}`;
  localSessions.set(id, params);
  return { id, url: `${LOCAL}/local-checkout/${id}` };
};
function localPaidSession(id) {
  const prm = localSessions.get(id), item = prm.line_items[0].price_data;
  const tax = Math.round(item.unit_amount * 0.13);
  return { id, object: "checkout.session", mode: prm.mode, payment_status: "paid", livemode: false, payment_intent: `pi_local_${id.slice(-12)}`,
    amount_subtotal: item.unit_amount, amount_total: item.unit_amount + tax, total_details: { amount_tax: tax }, currency: item.currency,
    customer_details: { email: prm.customer_email }, customer_email: prm.customer_email, metadata: prm.metadata,
    allow_promotion_codes: prm.allow_promotion_codes, automatic_tax: prm.automatic_tax, subscription: null };
}
const localEvent = (type, object) => ({ id: `evt_local_${crypto.randomBytes(6).toString("hex")}`, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } });
const memStore = () => { const m = new Map(); return { get: async (k) => m.get(k) || null, setJSON: async (k, v) => { m.set(k, v); } }; };
const attempts = memStore();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, LOCAL);
  let raw = ""; for await (const c of req) raw += c;
  // As Netlify does: the client's address in x-nf-client-connection-ip.
  const event = { httpMethod: req.method, headers: { ...Object.fromEntries(Object.entries(req.headers)), "x-nf-client-connection-ip": req.socket.remoteAddress || "127.0.0.1" }, body: raw, isBase64Encoded: false, queryStringParameters: Object.fromEntries(u.searchParams) };
  const reply = (r) => { res.writeHead(r.statusCode, r.headers || {}); res.end(r.body || ""); };
  try {
    if (u.pathname === "/api/gift") return reply(await giftFn.run(event, { store: attempts, ...(LOCAL_PAY ? { stripePost: localStripePost } : {}) }));
    if (LOCAL_PAY && u.pathname.startsWith("/local-checkout/")) {
      // Stands in for Stripe's page: shows what would be charged, then sends the buyer back as Stripe would.
      const prm = localSessions.get(u.pathname.split("/").pop());
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;padding:24px"><h1>Local stand-in for Stripe Checkout</h1><p>Not Stripe. Mode: ${prm.mode}. Item: ${prm.line_items[0].price_data.product_data.name}, ${(prm.line_items[0].price_data.unit_amount / 100).toFixed(2)} ${prm.currency || prm.line_items[0].price_data.currency.toUpperCase()} plus tax. Promotion codes: ${prm.allow_promotion_codes}. Automatic tax: ${prm.automatic_tax.enabled}.</p><a id=pay href="${prm.success_url}">Pay (simulated)</a></body>`);
    }
    if (u.pathname === "/api/billing") return reply(await billingFn.handler(event));
    if (u.pathname.startsWith("/api/")) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end('{"error":"not_found"}'); }
    let file = path.join(dist, decodeURIComponent(u.pathname));
    if (u.pathname === "/gift" || u.pathname === "/gift/") file = path.join(dist, "gift", "index.html");
    else if (/^\/gift\/(redeem|card)$/.test(u.pathname)) file = path.join(dist, `${u.pathname}.html`);
    else if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, u.pathname === "/" ? "index.html" : "app.html");
    if (!fs.existsSync(file)) file = path.join(dist, "index.html");
    const ext = path.extname(file);
    let body = fs.readFileSync(file);
    if ([".html", ".js"].includes(ext)) body = Buffer.from(withDrafts(body.toString("utf8")));
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e.message)); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// The webhook: Stripe's own event, as Stripe would deliver it, signed with this run's local secret.
async function deliver(evt) {
  const raw = JSON.stringify(evt), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${raw}`).digest("hex");
  return hookFn.handler({ httpMethod: "POST", headers: { "stripe-signature": `t=${ts},v1=${sig}` }, body: raw, isBase64Encoded: false });
}
async function stripeEvent(type, matches, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const list = (await stripe("GET", `/events?type=${type}&limit=20`)).data || [];
    const hit = list.find((e) => matches(e.data.object));
    if (hit) return hit;
    await sleep(2000);
  }
  return null;
}
const giftRow = async (session) => (await admin.from("gift_codes").select("*").eq("stripe_session_id", session).maybeSingle()).data;

// ── 3. the browser ────────────────────────────────────────────────────────────────────────────────────
const { chromium } = require(path.join(REPO, "node_modules", "playwright"));
const browser = await chromium.launch();
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  // Stripe sends the buyer back to https://flourishmoney.app/gift/?bought=1: answered from this local build, never the live site.
  await ctx.route("https://flourishmoney.app/**", async (route) => {
    const u = new URL(route.request().url());
    const r = await realFetch(`${LOCAL}${u.pathname}${u.search}`);
    route.fulfill({ status: r.status, headers: { "content-type": r.headers.get("content-type") || "text/html" }, body: Buffer.from(await r.arrayBuffer()) });
  });
  return ctx.newPage();
}

async function buyGift(page, { plan, delivery, name, email, message, sendOn, startOn }, label) {
  await page.goto(`${LOCAL}/gift/`);
  await page.waitForSelector('[data-price="flourish"]:not(:empty)');
  await shot(page, `${label}-1-gift-page`);
  await page.check(`input[name="plan"][value="${plan}"]`);
  await page.fill("#buyer_email", "gift-e2e-buyer@example.com");
  await page.check(`input[name="delivery"][value="${delivery}"]`);
  if (name) await page.fill("#recipient_name", name);
  if (delivery === "email") { await page.fill("#recipient_email", email); await page.fill("#send_on", sendOn); }
  if (message) await page.fill("#message", message);
  if (startOn) await page.fill("#start_on", startOn);
  await page.click("#submit");
  // The session id is in the checkout's own address (Stripe's /c/pay/cs_test_..., or the local stand-in's).
  await page.waitForURL(/checkout\.stripe\.com|local-checkout/, { timeout: 30000 }).catch(async () => {
    throw new Error(`no checkout: ${await page.textContent("#form-error").catch(() => "")} ${await page.evaluate(() => [...document.querySelectorAll("[data-error]:not([hidden])")].map((e) => e.dataset.error).join(","))}`);
  });
  const sessionId = (/(cs_test_[A-Za-z0-9_]+)/.exec(page.url()) || [])[1];
  if (!sessionId) throw new Error(`no session id in ${page.url().split("#")[0]}`);
  if (LOCAL_PAY) {
    await page.waitForURL(/local-checkout/);
    await shot(page, `${label}-2-checkout-stand-in`);
    await page.click("#pay");
    await page.waitForURL(/flourishmoney\.app\/gift\/\?bought=1/, { timeout: 30000 });
    await page.waitForSelector("#thanks:not([hidden])");
    await shot(page, `${label}-3-thank-you`);
    return sessionId;
  }
  // Stripe's hosted Checkout, test mode: Stripe's published test card.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  await page.waitForSelector("#cardNumber", { timeout: 30000 });
  if (await page.locator('iframe[src*="hcaptcha"], iframe[title*="captcha" i]').count()) throw new Error("Stripe Checkout showed a CAPTCHA; stopped (it is never completed by a script)");
  await shot(page, `${label}-2-stripe-checkout`);
  await page.fill("#cardNumber", "4242 4242 4242 4242");
  await page.fill("#cardExpiry", "12 / 34");
  await page.fill("#cardCvc", "123");
  await page.fill("#billingName", "Gift Test");
  if (await page.locator("#billingCountry").count()) await page.selectOption("#billingCountry", "CA");
  if (await page.locator("#billingAddressLine1").count()) {
    await page.fill("#billingAddressLine1", "100 Test Street");
    await page.fill("#billingLocality", "Belleville");
    if (await page.locator("#billingAdministrativeArea").count()) await page.selectOption("#billingAdministrativeArea", "ON");
  }
  if (await page.locator("#billingPostalCode").count()) await page.fill("#billingPostalCode", "K8N 1A1");
  const savePhone = page.locator("#enableStripePass");
  if (await savePhone.count() && await savePhone.isChecked()) await savePhone.uncheck();
  await page.click(".SubmitButton, button[type=submit]");
  await page.waitForURL(/flourishmoney\.app\/gift\/\?bought=1/, { timeout: 60000 });
  await page.waitForSelector("#thanks:not([hidden])");
  await shot(page, `${label}-3-thank-you`);
  return sessionId;
}

const torontoToday = gifts.torontoToday();
const tomorrow = gifts.addDays(torontoToday, 1);
let ok1 = false;
try {
  // ── buy gift 1: a year of flourish, emailed today ───────────────────────────────────────────────────
  console.log(`3. buy a year of flourish (${LOCAL_PAY ? "payment simulated locally" : "Stripe test mode"})`);
  const page = await newPage();
  const s1 = await buyGift(page, { plan: "flourish", delivery: "email", name: "Sam Tester", email: "gift-e2e-recipient@example.com", message: "Merry Christmas, Sam. Enjoy the year.", sendOn: torontoToday }, "gift1");
  const sess1 = LOCAL_PAY ? localPaidSession(s1) : await stripe("GET", `/checkout/sessions/${s1}`);
  check(`gift 1 paid${LOCAL_PAY ? " (simulated)" : " in Stripe test mode"}, one-time (payment mode)`, sess1.payment_status === "paid" && sess1.mode === "payment" && !sess1.subscription,
    `total ${sess1.amount_total} ${sess1.currency}, tax ${sess1.total_details?.amount_tax ?? 0}`);
  check("no promotion codes, and Stripe Tax as set", sess1.allow_promotion_codes !== true && !!sess1.automatic_tax?.enabled === !!TAX_ON);
  const e1 = LOCAL_PAY ? localEvent("checkout.session.completed", sess1) : await stripeEvent("checkout.session.completed", (o) => o.id === s1);
  check(LOCAL_PAY ? "checkout.session.completed event (built locally)" : "Stripe's checkout.session.completed event found", !!e1, e1 ? e1.id : "not found");
  const d1 = await deliver(e1);
  const row1 = await giftRow(s1);
  check("webhook (signature verified): 200 and one code", d1.statusCode === 200 && !!row1, row1 ? `${row1.plan}, ${row1.delivery}, send on ${row1.send_on}` : d1.body);
  await deliver(e1); await deliver({ ...e1 });
  const count1 = (await admin.from("gift_codes").select("code").eq("stripe_session_id", s1)).data.length;
  const buyerMails = emails.filter((m) => m.key === `gift-buyer/${s1}`);
  check("the same event delivered again: still one code, still one Email 1", count1 === 1 && buyerMails.length === 1, `${count1} code, ${buyerMails.length} email`);
  const m1 = buyerMails[0];
  fs.writeFileSync(path.join(OUT, "email1-buyer.html"), m1.html); fs.writeFileSync(path.join(OUT, "email1-buyer.txt"), `Subject: ${m1.subject}\nTo: ${m1.to}\n\n${m1.text}`);
  check("Email 1: 'Your gift is ready', the code, the card, one-time", m1.subject === DRAFTS["gift-email1-subject"] && m1.text.includes(gifts.formatGiftCode(row1.code)) && /gift\/card#c=/.test(m1.text) && /One-time gift, nothing renews/.test(m1.text));
  const p1 = await newPage();
  await p1.setContent(m1.html); await shot(p1, "gift1-4-email1");
  const cardUrl = /https:\/\/flourishmoney\.app\/gift\/card#\S+/.exec(m1.text)[0];
  await p1.goto(cardUrl); await p1.waitForSelector("#giftcard:not([hidden])"); await shot(p1, "gift1-5-printable-card");
  const cardCode = await p1.textContent("#code");
  await p1.locator(".qr").screenshot({ path: path.join(OUT, "card-qr.png") });
  const qr = spawnSync("swift", [path.join(HERE, "qr-decode.swift"), path.join(OUT, "card-qr.png")], { encoding: "utf8" });
  check("the printable card shows the code, and its QR opens the redeem page", cardCode === gifts.formatGiftCode(row1.code) && qr.stdout.trim() === "https://flourishmoney.app/gift/redeem", `QR reads ${qr.stdout.trim() || qr.stderr.trim()}`);

  // ── Email 2 ─────────────────────────────────────────────────────────────────────────────────────────
  console.log("4. the recipient's email (the 5-minute job)");
  const before = emails.length;
  const sweep1 = JSON.parse((await sweepFn.handler({}, {})).body);
  const recip = emails.slice(before).filter((m) => m.key === `gift-recipient/${row1.code}`);
  const late = new Date() >= gifts.sendInstant(torontoToday);
  check(late ? "Email 2 sent on its day (7 a.m. Eastern has passed)" : "Email 2 not sent before 7 a.m. Eastern", late ? recip.length === 1 : recip.length === 0, JSON.stringify(sweep1));
  await sweepFn.handler({}, {});
  check("the job run again sends nothing more", emails.filter((m) => m.key === `gift-recipient/${row1.code}`).length === (late ? 1 : 0));
  if (recip[0]) {
    fs.writeFileSync(path.join(OUT, "email2-recipient.html"), recip[0].html); fs.writeFileSync(path.join(OUT, "email2-recipient.txt"), `Subject: ${recip[0].subject}\nTo: ${recip[0].to}\n\n${recip[0].text}`);
    await p1.setContent(recip[0].html); await shot(p1, "gift1-6-email2");
    check("Email 2: to the recipient, the code, the redeem button, one-time", recip[0].to[0] === "gift-e2e-recipient@example.com" && recip[0].text.includes(gifts.formatGiftCode(row1.code)) && recip[0].html.includes("https://flourishmoney.app/gift/redeem") && /One-time gift, nothing renews/.test(recip[0].text));
  }

  // ── redeem on the website ───────────────────────────────────────────────────────────────────────────
  console.log("5. redeem on the website");
  const stamp = Date.now();
  const A = { email: `gift-e2e-a-${stamp}@example.com`, password: crypto.randomBytes(12).toString("base64url") };
  const B = { email: `gift-e2e-b-${stamp}@example.com`, password: crypto.randomBytes(12).toString("base64url") };
  for (const u of [A, B]) { const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true }); if (error) throw error; u.id = data.user.id; }
  const rp = await newPage();
  await rp.goto(`${LOCAL}/gift/redeem`);
  await rp.waitForSelector("#signed-out:not([hidden])"); await shot(rp, "redeem-1-signed-out");
  await rp.click("#signin");
  await rp.waitForSelector("#auth-email", { timeout: 20000 }); await shot(rp, "redeem-2-website-sign-in");
  await rp.fill("#auth-email", A.email); await rp.fill("#auth-password", A.password);
  await rp.click("button:not([aria-pressed]) >> text=/^Log In$/");
  await rp.waitForURL(/\/gift\/redeem$/, { timeout: 30000 });
  await rp.waitForSelector("#redeem-form:not([hidden])");
  check("signing in on the website brings them back to the redeem page", (await rp.textContent("#signed-in-as")).includes(A.email));
  await rp.fill("#code", gifts.formatGiftCode(row1.code).toLowerCase());
  await shot(rp, "redeem-3-code-entered");
  const redeemReply = rp.waitForResponse((r) => r.url().endsWith("/api/gift") && r.request().method() === "POST");
  await rp.click("#submit");
  const rr = await redeemReply;
  const rrBody = await rr.text().catch(() => "");
  await rp.waitForSelector("#done:not([hidden]), #result-error:not([hidden])", { timeout: 20000 });
  if (!(await rp.isVisible("#done"))) { await shot(rp, "redeem-4-FAILED"); throw new Error(`redeem showed: ${await rp.textContent("#result-error")} (HTTP ${rr.status()} ${rrBody.slice(0, 200)})`); }
  await shot(rp, "redeem-4-redeemed");
  const after1 = await giftRow(s1);
  const months = (Date.parse(after1.ends_at) - Date.parse(after1.starts_at)) / 86400e3;
  check("redeemed: the plan runs 12 months from today", after1.redeemed_by === A.id && Math.abs(Date.parse(after1.starts_at) - Date.now()) < 5 * 60e3 && months >= 365 && months <= 366, `${after1.starts_at} to ${after1.ends_at}`);
  const token = async (u) => (await createClient(SB_URL, SB_ANON, { auth: { persistSession: false } }).auth.signInWithPassword({ email: u.email, password: u.password })).data.session.access_token;
  const tokA = await token(A);
  const statusFor = async (origin, action, tok) => JSON.parse((await billingFn.handler({ httpMethod: "POST", headers: { origin, authorization: `Bearer ${tok}` }, body: JSON.stringify({ action }) })).body);
  const webS = await statusFor("https://flourishmoney.app", "status", tokA);
  const iosS = await statusFor("capacitor://localhost", "store_status", tokA);
  const andS = await statusFor("https://localhost", "store_status", tokA);
  check("the entitlement: paid on the website, the iPhone and Android", webS.paid === true && iosS.paid === true && andS.paid === true, `web covered_by ${webS.covered_by}, ends ${webS.period_end}`);
  check("…and the store apps are never told the word gift", !/gift/i.test(JSON.stringify(iosS) + JSON.stringify(andS)));
  const { getUserPlan } = require(path.join(FN, "_lib", "auth.js"));
  const planTrial = await getUserPlan(A.id);
  // A new account is on its 14-day trial (already unlimited, so the gift is not even asked). End the trial, as day 15
  // would, and the gift alone carries the plan.
  psql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); update public.profiles set trial_started_at = now() - interval '20 days', trial_ends_at = now() - interval '6 days' where user_id = '${A.id}'; commit;`);
  const planA = await getUserPlan(A.id);
  check("getUserPlan (the coach, What-If and banks): after the trial, the gift makes it premium", planTrial.unlimited === true && planA.entitlement === "premium" && planA.unlimited === true && planA.covered_by === "gift",
    `during the trial ${planTrial.entitlement}; after it ${planA.entitlement}, from ${planA.covered_by}`);

  // ── a second account, the same code ─────────────────────────────────────────────────────────────────
  console.log("6. the same code on a second account");
  const rb = await newPage();
  await rb.goto(`${LOCAL}/gift/redeem`);
  const tokB = await token(B);
  await rb.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-127-auth-token`, JSON.stringify({ access_token: tokB, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: B.email } })]);
  await rb.reload(); await rb.waitForSelector("#redeem-form:not([hidden])");
  await rb.fill("#code", gifts.formatGiftCode(row1.code)); await rb.click("#submit");
  await rb.waitForSelector("#result-error:not([hidden])");
  const usedMsg = await rb.textContent("#result-error");
  await shot(rb, "redeem-5-already-redeemed");
  check("a used code says it was already redeemed on an account, and to sign in", usedMsg === DRAFTS["gift-redeem-used"] && !/inactive/i.test(usedMsg), usedMsg);

  // ── gift 2: with Plus, printed, refunded ────────────────────────────────────────────────────────────
  console.log("7. buy a year of flourish with Plus, then refund it");
  const s2 = await buyGift(await newPage(), { plan: "flourish_plus", delivery: "print", name: "Robin", message: "For you", startOn: tomorrow }, "gift2");
  const e2 = LOCAL_PAY ? localEvent("checkout.session.completed", localPaidSession(s2)) : await stripeEvent("checkout.session.completed", (o) => o.id === s2);
  await deliver(e2);
  const row2 = await giftRow(s2);
  check("gift 2 (with Plus, printed card, starting tomorrow): one code", !!row2 && row2.plan === "flourish_plus" && row2.delivery === "print" && row2.start_on === tomorrow);
  const sess2 = LOCAL_PAY ? localPaidSession(s2) : await stripe("GET", `/checkout/sessions/${s2}`);
  if (!LOCAL_PAY) await stripe("POST", "/refunds", { payment_intent: sess2.payment_intent });
  const r2 = LOCAL_PAY
    ? localEvent("charge.refunded", { id: `ch_local_${s2.slice(-8)}`, object: "charge", payment_intent: sess2.payment_intent, refunded: true, amount_refunded: sess2.amount_total, amount: sess2.amount_total })
    : await stripeEvent("charge.refunded", (o) => o.payment_intent === sess2.payment_intent);
  check(LOCAL_PAY ? "charge.refunded event (built locally)" : "Stripe's charge.refunded event found", !!r2, r2 ? r2.id : "not found");
  const dr = await deliver(r2);
  const row2b = await giftRow(s2);
  check("refunded while unused: the code is void", dr.statusCode === 200 && !!row2b.voided_at && row2b.status === "void");
  await rb.fill("#code", gifts.formatGiftCode(row2.code)); await rb.click("#submit");
  await rb.waitForFunction((t) => document.querySelector("#result-error").textContent === t, DRAFTS["gift-redeem-void"]);
  await shot(rb, "redeem-6-refunded-code");
  check("redeeming the refunded code says it was refunded (never 'inactive')", true, await rb.textContent("#result-error"));

  // ── a later send day waits for 7 a.m. Eastern ───────────────────────────────────────────────────────
  console.log("8. a gift for a later day");
  await admin.rpc("gift_create", { p_code: gifts.makeGiftCode(), p_plan: "flourish", p_session: `cs_e2e_later_${stamp}`, p_payment_intent: null, p_livemode: false,
    p_buyer_email: "gift-e2e-buyer@example.com", p_delivery: "email", p_recipient_name: "Later", p_recipient_email: "gift-e2e-later@example.com", p_message: null,
    p_send_on: tomorrow, p_start_on: null, p_subtotal: 9999, p_tax: 0, p_total: 9999, p_currency: "cad" });
  const n0 = emails.length;
  const words = { ...realWords.GIFT_WORDS, ...DRAFTS };
  await gifts.runSendSweep({ admin, words, pauseMs: 0, now: () => new Date(gifts.sendInstant(tomorrow).getTime() - 60e3) });
  const early = emails.length - n0;
  await gifts.runSendSweep({ admin, words, pauseMs: 0, now: () => gifts.sendInstant(tomorrow) });
  const onTime = emails.length - n0;
  await gifts.runSendSweep({ admin, words, pauseMs: 0, now: () => new Date(gifts.sendInstant(tomorrow).getTime() + 3600e3) });
  check("tomorrow's gift: not at 6:59, sent at 7:00 Eastern, not again an hour later", early === 0 && onTime === 1 && emails.length - n0 === 1);
  ok1 = true;
} catch (e) {
  check("the run finished", false, e.message);
} finally {
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ at: new Date().toISOString(), payment: LOCAL_PAY ? "simulated locally (no Stripe)" : "Stripe test mode", stripe_tax: TAX_ON, results }, null, 2));
  fs.rmSync(dist, { recursive: true, force: true });
  if (!KEEP) sb(["stop", "--no-backup"]);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n  ${failed.length ? "✗" : "✓"} gift end to end: ${results.length - failed.length}/${results.length} passed${ok1 ? "" : " (stopped early)"}`);
process.exit(failed.length ? 1 : 0);
