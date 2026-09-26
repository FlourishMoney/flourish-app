// tests/signupLimit.test.cjs
// -----------------------------------------------------------------------------
// HOW OFTEN ONE MACHINE, AND ONE ADDRESS, MAY TRY TO SIGN UP.
//
// KNOWN-DEFECTS 33. With OPEN_SIGNUP on, the signup endpoint is a public URL that creates a real
// account and sends a real email, so without a limit one script can mint accounts in bulk and can
// point the confirmation mail at anyone it likes.
//
// 5 per IP per hour, 3 per email per day, counted in Netlify Blobs — the same backstop coach.js uses,
// so no new paid service and no dependency on Supabase being up. It FAILS CLOSED: if the counter
// cannot be reached the attempt is refused, because an abuse control that opens during an outage is
// not a control.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const BETA_PATH = require.resolve("../netlify/functions/beta.js");
const BLOBS_PATH = require.resolve("@netlify/blobs");

// An in-memory stand-in for a Netlify Blobs store.
function memStore(over = {}) {
  const data = new Map();
  return {
    data,
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async setJSON(key, value) { data.set(key, value); },
    ...over,
  };
}

(async () => {
  const { checkSignupLimit, IP_HOURLY_LIMIT, EMAIL_DAILY_LIMIT, TOO_MANY_MESSAGE } =
    require("../netlify/functions/_lib/signupLimit.js");
  const t = create();
  const REPO = path.join(__dirname, "..");
  const NOW = new Date("2026-10-01T09:30:00Z");
  const at = (iso) => new Date(iso);

  // ── 1. The limits ─────────────────────────────────────────────────────────────────────────────
  {
    t.eq([IP_HOURLY_LIMIT, EMAIL_DAILY_LIMIT], [5, 3], "5 per IP per hour, 3 per email per day");
    t.eq(TOO_MANY_MESSAGE, "Too many attempts. Try again in an hour.", "one plain message");
  }

  // ── 2. Per IP, per hour ───────────────────────────────────────────────────────────────────────
  {
    const store = memStore();
    // A different address each time, so only the IP bucket can refuse.
    const attempt = (n, now = NOW) => checkSignupLimit({ store, ip: "203.0.113.7", email: `a${n}@example.invalid`, now });
    for (let i = 1; i <= 5; i++) t.eq((await attempt(i)).allowed, true, `attempt ${i} from one IP is allowed`);
    const sixth = await attempt(6);
    t.eq([sixth.allowed, sixth.reason, sixth.message], [false, "ip_hourly", TOO_MANY_MESSAGE], "the 6th in the hour is refused");
    t.eq((await attempt(7)).allowed, false, "…and so is the 7th");

    // The next hour is a new bucket.
    t.eq((await attempt(8, at("2026-10-01T10:00:00Z"))).allowed, true, "the next hour starts again");
    // A different IP is unaffected.
    t.eq((await checkSignupLimit({ store, ip: "198.51.100.2", email: "other@example.invalid", now: NOW })).allowed, true,
         "another machine is not affected by the first one's attempts");
  }

  // ── 3. Per email, per day ─────────────────────────────────────────────────────────────────────
  {
    const store = memStore();
    // A different IP each time, so only the email bucket can refuse.
    const attempt = (n, now = NOW) => checkSignupLimit({ store, ip: `203.0.113.${n}`, email: "target@example.invalid", now });
    for (let i = 1; i <= 3; i++) t.eq((await attempt(i)).allowed, true, `attempt ${i} for one address is allowed`);
    const fourth = await attempt(4);
    t.eq([fourth.allowed, fourth.reason], [false, "email_daily"], "the 4th for that address is refused, even from a fresh IP");
    t.eq((await attempt(5, at("2026-10-01T23:59:00Z"))).allowed, false, "…still refused later the same day");
    t.eq((await attempt(6, at("2026-10-02T00:00:00Z"))).allowed, true, "the next day starts again");
    t.eq((await checkSignupLimit({ store, ip: "203.0.113.9", email: "someone-else@example.invalid", now: NOW })).allowed, true,
         "another address is unaffected");
  }

  // ── 4. A refused attempt still counts against the other bucket ────────────────────────────────
  // Otherwise the cheapest way past the email limit is to trip the IP limit first.
  {
    const store = memStore();
    for (let i = 1; i <= 5; i++) await checkSignupLimit({ store, ip: "203.0.113.7", email: `f${i}@example.invalid`, now: NOW });
    // The IP is now spent. Three more attempts at ONE address, all refused for the IP…
    for (let i = 0; i < 3; i++) {
      const r = await checkSignupLimit({ store, ip: "203.0.113.7", email: "victim@example.invalid", now: NOW });
      t.eq([r.allowed, r.reason], [false, "ip_hourly"], "refused for the IP");
    }
    // …and the address has been counted three times, so a fresh machine cannot continue.
    const fromElsewhere = await checkSignupLimit({ store, ip: "198.51.100.5", email: "victim@example.invalid", now: NOW });
    t.eq([fromElsewhere.allowed, fromElsewhere.reason], [false, "email_daily"], "…and those attempts counted against the address too");
  }

  // ── 5. Fails closed ───────────────────────────────────────────────────────────────────────────
  {
    t.eq((await checkSignupLimit({ store: null, ip: "203.0.113.7", email: "a@example.invalid", now: NOW })).reason, "store_unavailable",
         "no store at all: refused");
    const throwsOnRead = memStore({ get: async () => { throw new Error("blobs down"); } });
    const r1 = await checkSignupLimit({ store: throwsOnRead, ip: "203.0.113.7", email: "a@example.invalid", now: NOW });
    t.eq([r1.allowed, r1.reason, r1.message], [false, "store_unavailable", TOO_MANY_MESSAGE], "a store that cannot be read: refused");
    const throwsOnWrite = memStore({ setJSON: async () => { throw new Error("blobs down"); } });
    t.eq((await checkSignupLimit({ store: throwsOnWrite, ip: "203.0.113.7", email: "a@example.invalid", now: NOW })).allowed, false,
         "a store that cannot be written: refused");
    // No IP is not a licence to skip the limit.
    const store = memStore();
    for (let i = 1; i <= 3; i++) await checkSignupLimit({ store, ip: null, email: "noip@example.invalid", now: NOW });
    t.eq((await checkSignupLimit({ store, ip: null, email: "noip@example.invalid", now: NOW })).reason, "email_daily",
         "with no client IP the address limit still applies");
    t.eq((await checkSignupLimit({ store, ip: null, email: "", now: NOW })).reason, "unattributable",
         "an attempt with neither an IP nor an address is refused outright");
  }

  // ── 6. The endpoints, run for real ────────────────────────────────────────────────────────────
  {
    const shared = memStore();
    const state = { created: [], resends: [] };
    const runBeta = async (body, headers = {}) => {
      const savedEnv = { ...process.env };
      const savedFetch = global.fetch;
      delete require.cache[AUTH_PATH]; delete require.cache[BETA_PATH]; delete require.cache[BLOBS_PATH];
      require.cache[AUTH_PATH] = { id: AUTH_PATH, filename: AUTH_PATH, loaded: true, exports: {
        getAdminClient: () => ({
          rpc: async () => ({ data: "ok", error: null }),
          from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }),
          auth: { admin: { createUser: async (u) => { state.created.push(u); return { error: null }; } } },
        }),
        getPublicClient: () => ({ auth: { resend: async (a) => { state.resends.push(a); return { error: null }; } } }),
      } };
      require.cache[BLOBS_PATH] = { id: BLOBS_PATH, filename: BLOBS_PATH, loaded: true, exports: { getStore: () => shared } };
      global.fetch = async () => { throw new Error("network blocked in test"); };
      try {
        process.env.SUPABASE_URL = "https://supabase.test.invalid";
        process.env.SUPABASE_SECRET_KEY = "test-secret-not-real";
        process.env.OPEN_SIGNUP = "true";
        // AWAITED INSIDE THE TRY. The handler is async and reads process.env after its first await
        // (the rate-limit call), so returning the promise and restoring the environment in `finally`
        // would restore it out from under the code being tested.
        return await require(BETA_PATH).handler({
          httpMethod: "POST",
          headers: { origin: "https://flourishmoney.app", "x-nf-client-connection-ip": "203.0.113.42", ...headers },
          body: JSON.stringify(body),
        });
      } finally {
        delete require.cache[AUTH_PATH]; delete require.cache[BETA_PATH]; delete require.cache[BLOBS_PATH];
        process.env = savedEnv; global.fetch = savedFetch;
      }
    };
    const signup = (n) => runBeta({ action: "signup", email: `real${n}@example.invalid`, password: "a-long-enough-password", code: "" });

    for (let i = 1; i <= 5; i++) {
      const res = await signup(i);
      t.eq(JSON.parse(res.body).ok, true, `signup ${i} from one IP succeeds`);
    }
    const blocked = await signup(6);
    t.eq(blocked.statusCode, 429, "the 6th signup from that IP is a 429");
    t.eq(JSON.parse(blocked.body), { error: "rate_limited", message: TOO_MANY_MESSAGE }, "…with the plain message");
    t.eq(state.created.length, 5, "…and no sixth account was created");
    t.eq(state.resends.length, 5, "…and no sixth email was sent");

    // A typo in the address must not burn an attempt: validation comes first.
    const beta = fs.readFileSync(path.join(REPO, "netlify", "functions", "beta.js"), "utf8");
    const block = beta.slice(beta.indexOf('if (action === "signup")'));
    t.ok(block.indexOf('error: "invalid_email"') < block.indexOf("await rateLimit(event, email)"), "the address is validated before an attempt is counted");
    t.ok(block.indexOf('error: "weak_password"') < block.indexOf("await rateLimit(event, email)"), "…and so is the password");
    t.ok(block.indexOf("await rateLimit(event, email)") < block.indexOf("decideSignup("), "…but the limit is checked before the code is judged, so guessing codes is limited too");
    t.ok(block.indexOf("await rateLimit(event, email)") < block.indexOf("createUser("), "…and before any account is created");
    t.ok(/if \(action === "resend_confirmation"\)[\s\S]{0,700}await rateLimit\(event, addr\)/.test(beta), "the resend endpoint is limited too");
  }

  // ── 7. It is the coach's pattern, not a new service ───────────────────────────────────────────
  {
    const lim = fs.readFileSync(path.join(REPO, "netlify", "functions", "_lib", "signupLimit.js"), "utf8");
    const beta = fs.readFileSync(path.join(REPO, "netlify", "functions", "beta.js"), "utf8");
    t.ok(/getStore\("signup_attempts"\)/.test(beta), "it uses Netlify Blobs, as coach.js does");
    t.ok(!/redis|upstash|ratelimit\.com|fetch\(/i.test(lim), "…and no new paid service or network call");
    t.ok(/x-nf-client-connection-ip/.test(beta), "…reading the IP from Netlify's trusted header, as coach.js does");
  }

  t.summary("signupLimit.test");
})();
