// tests/limiterPrivacy.test.cjs
// -----------------------------------------------------------------------------
// THE RATE LIMITERS KEEP NO IP ADDRESS OR EMAIL ADDRESS (Privacy Policy, 2026-10-21).
//
//   1  signup and resend: every key and value written holds a keyed hash and a window, never the raw IP or the
//      address (nor its local part); the coach's backstop likewise;
//   2  the limits still work: 5 per IP per hour, 3 sends per inbox per day, and they reset with the window;
//   3  an entry holds only its current window: the first write after the window replaces the old count;
//   4  the hash: stable for one value, different per kind and per secret, derived from SUPABASE_SECRET_KEY
//      (never the key itself) unless LIMITER_HASH_SECRET is set; with no secret nothing is written and signup
//      fails closed;
//   5  the daily cleanup deletes every expired entry and every old raw key, keeps live ones, and logs counts only;
//   6  the wiring: the scheduled function, its daily schedule, and Blobs connected first.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
function memStore() {
  const data = new Map();
  return { data, async get(k) { return data.has(k) ? data.get(k) : null; }, async setJSON(k, v) { data.set(k, v); },
    async delete(k) { data.delete(k); }, async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; } };
}
const IP = "203.0.113.77", IP6 = "2001:db8::7", EMAIL = "Person.Name+tag@Example.com";
const RAW = [IP, IP6, "person.name", "example.com", "person.name@example.com", "Person.Name+tag@Example.com"];
const leaks = (store) => [...store.data.entries()].flatMap(([k, v]) => RAW.filter((r) => (k + JSON.stringify(v)).toLowerCase().includes(r.toLowerCase())).map((r) => `${k} holds ${r}`));

(async () => {
  const t = create();
  const SECRET = "test-limiter-secret-not-real";
  const K = require("../netlify/functions/_lib/limiterKeys.js");
  const L = require("../netlify/functions/_lib/signupLimit.js");
  const C = require("../netlify/functions/_lib/limiterCleanup.js");
  const NOW = new Date("2026-10-21T14:20:00Z");

  // ── 1. Nothing raw is written ─────────────────────────────────────────────────────────────────
  const s = memStore();
  for (const ip of [IP, IP6]) await L.checkSignupLimit({ store: s, ip, email: EMAIL, now: NOW, secret: SECRET });
  await L.recordEmailSent({ store: s, email: EMAIL, now: NOW, secret: SECRET });
  t.eq(leaks(s), [], "1a signup: no key or value holds the IP (v4 or v6), the address or any part of it");
  t.ok([...s.data.keys()].every((k) => /^v2\/(ip|email)\/[A-Za-z0-9_-]{43}$/.test(k)) && s.data.size === 3, `1b …only hashed keys (${[...s.data.keys()].map((k) => k.slice(0, 9)).join(", ")}…)`);
  t.ok([...s.data.values()].every((v) => Object.keys(v).sort().join() === "n,w"), "1c …and each value is only a window and a count");
  delete require.cache[require.resolve("../netlify/functions/coach.js")];
  const coach = require("../netlify/functions/coach.js");
  const cs = memStore();
  t.eq([await coach._bumpIpUsage(IP, { store: cs, now: NOW, secret: SECRET }), await coach._bumpIpUsage(IP, { store: cs, now: NOW, secret: SECRET })], [1, 2], "1d coach: today's count per IP still counts");
  t.ok(leaks(cs).length === 0 && [...cs.data.keys()].every((k) => /^v2\/coach-ip\/[A-Za-z0-9_-]{43}$/.test(k)), "1e …under a hashed key, never the IP");

  // ── 2. The limits still work ──────────────────────────────────────────────────────────────────
  const s2 = memStore();
  const tries = [];
  for (let i = 0; i < 6; i++) tries.push((await L.checkSignupLimit({ store: s2, ip: IP, email: `a${i}@example.invalid`, now: NOW, secret: SECRET })).allowed);
  t.eq(tries, [true, true, true, true, true, false], "2a 5 attempts an hour per IP, the 6th refused");
  t.eq((await L.checkSignupLimit({ store: s2, ip: IP, email: "a9@example.invalid", now: new Date("2026-10-21T15:01:00Z"), secret: SECRET })).allowed, true, "2b …and allowed again the next hour");
  const s3 = memStore();
  for (let i = 0; i < 3; i++) await L.recordEmailSent({ store: s3, email: `v+${i}@gmail.com`, now: NOW, secret: SECRET });
  t.eq((await L.checkSignupLimit({ store: s3, ip: "198.51.100.1", email: "V@gmail.com", now: NOW, secret: SECRET })).reason, "email_daily", "2c 3 confirmation emails a day per inbox (+tags and case folded)");
  t.eq((await L.checkSignupLimit({ store: s3, ip: "198.51.100.1", email: "v@gmail.com", now: new Date("2026-10-22T00:05:00Z"), secret: SECRET })).allowed, true, "2d …and allowed again the next day");

  // ── 3. One window per entry ───────────────────────────────────────────────────────────────────
  const k = K.subjectKey("ip", IP, SECRET);
  t.eq(s2.data.get(k), { w: "2026-10-21T15", n: 1 }, "3a the first write after the hour replaced the old count: only the current window is kept");

  // ── 4. The hash ───────────────────────────────────────────────────────────────────────────────
  t.ok(K.subjectKey("ip", IP, SECRET) === K.subjectKey("ip", ` ${IP} `, SECRET) && K.subjectKey("ip", IP, SECRET) !== K.subjectKey("coach-ip", IP, SECRET) && K.subjectKey("ip", IP, SECRET) !== K.subjectKey("ip", IP, "another-secret"),
    "4a stable for one value; different per kind and per secret");
  const sb = "sb_secret_test_not_real";
  t.eq([K.limiterSecret({ SUPABASE_SECRET_KEY: sb }), K.limiterSecret({ SUPABASE_SECRET_KEY: sb, LIMITER_HASH_SECRET: "own" }), K.limiterSecret({})],
    [crypto.createHmac("sha256", sb).update("flourish/limiter-key/v1").digest("hex"), "own", ""], "4b the secret: LIMITER_HASH_SECRET, else derived from SUPABASE_SECRET_KEY (never the key itself), else none");
  const s4 = memStore();
  const r4 = await L.checkSignupLimit({ store: s4, ip: IP, email: EMAIL, now: NOW, secret: "" });
  await L.recordEmailSent({ store: s4, email: EMAIL, now: NOW, secret: "" });
  t.eq([r4.allowed, r4.reason, s4.data.size, await coach._bumpIpUsage(IP, { store: s4, now: NOW, secret: "" })], [false, "no_secret", 0, null], "4c with no secret nothing is written: signup refuses (fails closed), the coach's backstop is skipped");

  // ── 5. The daily cleanup ──────────────────────────────────────────────────────────────────────
  const stores = { signup_attempts: memStore(), coach_ip_usage: memStore(), founding_confirm_sends: memStore() };
  const su = stores.signup_attempts, co = stores.coach_ip_usage, fc = stores.founding_confirm_sends;
  su.data.set(`ip:2026-10-21T03:${IP}`, { n: 2 }); su.data.set(`email:2026-10-21:person.name@example.com`, { n: 1 }); co.data.set(`2026-10-21:${IP}`, { n: 4 });
  su.data.set(K.subjectKey("ip", "198.51.100.3", SECRET), { w: "2026-10-21T14", n: 1 });   // this hour: kept
  su.data.set(K.subjectKey("ip", "198.51.100.4", SECRET), { w: "2026-10-21T13", n: 3 });   // last hour: expired
  su.data.set(K.subjectKey("email", "a@b.ca", SECRET), { w: "2026-10-21", n: 1 });          // today: kept
  su.data.set(K.subjectKey("email", "c@d.ca", SECRET), { w: "2026-10-20", n: 3 });          // yesterday: expired
  co.data.set(K.subjectKey("coach-ip", "198.51.100.3", SECRET), { w: "2026-10-20", n: 9 }); // yesterday: expired
  fc.data.set("founding-confirm/0f0e0d0c-0000-4000-8000-000000000001", [NOW.getTime() - 3600e3]);      // within 24 h: kept
  fc.data.set("founding-confirm/0f0e0d0c-0000-4000-8000-000000000002", [NOW.getTime() - 30 * 3600e3]); // older: expired
  const logs = []; const saved = console.log; console.log = (...a) => logs.push(a.join(" "));
  let result;
  try { result = await C.cleanAll({ getStore: (n) => stores[n], now: NOW }); } finally { console.log = saved; }
  t.eq(result, { signup_attempts: { oldRaw: 2, expired: 2, kept: 2 }, coach_ip_usage: { oldRaw: 1, expired: 1, kept: 0 }, founding_confirm_sends: { oldRaw: 0, expired: 1, kept: 1 } },
    "5a the cleanup deletes every old raw key and every expired entry, and keeps the live ones");
  t.eq([...su.data.keys(), ...co.data.keys(), ...fc.data.keys()].filter((k2) => RAW.some((r) => k2.includes(r))), [], "5b no raw IP or address is left in any store");
  const fn = require("../netlify/functions/limiter-cleanup.js");
  delete require.cache[require.resolve("@netlify/blobs")];
  const logged = [];
  {
    const BL = require.resolve("@netlify/blobs");
    const LC = require.resolve("../netlify/functions/limiter-cleanup.js");
    require.cache[BL] = { id: BL, filename: BL, loaded: true, exports: { getStore: (n) => stores[n], connectLambda() {} } };
    delete require.cache[LC];
    const saved2 = console.log; console.log = (...a) => logged.push(a.join(" "));
    try { const res = await require(LC).handler({}); t.eq(res.statusCode, 200, "5c the scheduled function runs the cleanup"); }
    finally { console.log = saved2; delete require.cache[BL]; delete require.cache[LC]; }
  }
  t.ok(logged.length === 1 && /^\[limiter-cleanup\] signup_attempts: old raw \d+, expired \d+, kept \d+; coach_ip_usage: .*; founding_confirm_sends: .*$/.test(logged[0]) && !RAW.some((r) => logged[0].includes(r)) && !/v2\//.test(logged[0]),
    "5d …and logs counts only, never a key or a value");

  // ── 6. The wiring ─────────────────────────────────────────────────────────────────────────────
  t.ok(/\[functions\."limiter-cleanup"\]\n  schedule = "@daily"/.test(read("netlify.toml")), "6a it runs daily");
  const SL = read("netlify", "functions", "_lib", "signupLimit.js"), CO = read("netlify", "functions", "coach.js");
  t.ok(!/`\$\{hourKey|`\$\{dayKey|`ip:|`email:/.test(SL) && /subjectKey\("ip", ip, secret\)/.test(SL) && /subjectKey\("email", inbox, secret\)/.test(SL), "6b the signup limiter builds every key with subjectKey");
  t.ok(/subjectKey\("coach-ip", ip/.test(CO) && !/\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}:\$\{ip\}/.test(CO), "6c …and so does the coach's backstop");
  t.summary("limiterPrivacy.test");
})();
