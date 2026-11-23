// tests/_realdb-plusRound2Limits.cjs
// -----------------------------------------------------------------------------
// N3 AND N4 AGAINST REAL POSTGRES, WITH WRITERS THAT REALLY RUN AT THE SAME TIME. Not part of `npm run test:math`.
//
// It runs only against the throwaway local Supabase of the nightly test (e2e/nightly: `supabase start --workdir
// e2e/nightly`, then `node e2e/nightly/setup-db.cjs`), and refuses any address that is not this machine. Synthetic
// accounts only; it removes them when it finishes. No Plaid, no Stripe.
//
//   set -a; source <(supabase status --workdir e2e/nightly -o env); set +a
//   SUPABASE_URL="$API_URL" SUPABASE_SECRET_KEY="$SERVICE_ROLE_KEY" node tests/_realdb-plusRound2Limits.cjs
//
// What it shows, ROUNDS times each:
//   N3  a person on the basic plan with 1 bank (limit 2); WRITERS requests each write a new bank at the same moment and
//       then take the second look (_lib/bankLimits.js overAfterAdding, naming their own bank) and undo their own row
//       when told to. The end must be exactly 2 banks, never 3, and the first bank must still be there.
//       For comparison the round 1 rule (count again, take yourself out if past the limit) is run the same way.
//   N4  a person with Plus at 49 net worth entries; WRITERS requests save a new entry at the same moment through the
//       real function (netlify/functions/networth.js). The end must be exactly 50, never 51, with one save answered 200.
// -----------------------------------------------------------------------------
"use strict";
const path = require("path");
const crypto = require("crypto");

const URL_ = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SECRET_KEY || "";
const ROUNDS = Number(process.env.ROUNDS || 15);
const WRITERS = Number(process.env.WRITERS || 6);
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL_) || !KEY) {
  console.error("This runs only against the local throwaway Supabase: set SUPABASE_URL to http://127.0.0.1:<port> and SUPABASE_SECRET_KEY to its service role key.");
  process.exit(2);
}
Object.assign(process.env, { PLUS_ENABLED: "true", HOUSEHOLD_ENABLED: "true", STRIPE_PRICE_PLUS_MONTHLY_CAD: "price_test_plus_m", STRIPE_PRICE_PLUS_ANNUAL_CAD: "price_test_plus_a" });
delete process.env.PLUS_TESTER_USER_IDS;

const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase", "supabase-js"));
const admin = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

async function newUser() {
  const email = `limits-${crypto.randomBytes(6).toString("hex")}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: crypto.randomBytes(18).toString("base64url"), email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  return data.user.id;
}
const must = (r, what) => { if (r && r.error) throw new Error(`${what}: ${r.error.message || r.error.code}`); return r; };
const bankRow = (user, item) => ({ user_id: user, item_id: item, access_token: `access-synthetic-${item}`, institution_id: `ins_${item}`, institution_name: `Bank ${item}`, status: "active" });
const banksOf = async (user) => (must(await admin.from("plaid_items").select("item_id").eq("user_id", user), "read banks").data || []).map((r) => r.item_id);

async function n3(rule) {
  const { overAfterAdding } = require("../netlify/functions/_lib/bankLimits.js");
  const household = require("../netlify/functions/_lib/household.js");
  const ends = [];
  let firstLost = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const user = await newUser();
    try {
      must(await admin.from("plaid_items").insert(bankRow(user, "first")), "seed bank");
      await Promise.all(Array.from({ length: WRITERS }, (_, i) => quietly(async () => {
        const item = `new-${round}-${i}`;
        must(await admin.from("plaid_items").upsert(bankRow(user, item), { onConflict: "user_id,item_id" }), "write bank");
        const after = await overAfterAdding(admin, user, rule === "round 2" ? { itemId: item } : {});
        if (after.over) await household.disconnectItem(admin, user, item);
      })));
      const left = await banksOf(user);
      ends.push(left.length);
      if (!left.includes("first")) firstLost++;
    } finally { await admin.auth.admin.deleteUser(user).catch(() => {}); }
  }
  return { ends, firstLost };
}

async function n4() {
  const real = require(AUTH_PATH);
  let who = null;
  require.cache[AUTH_PATH].exports = { ...real, getAdminClient: () => admin, getUserFromRequest: async () => ({ user_id: who, error: null }) };
  delete require.cache[require.resolve("../netlify/functions/networth.js")];
  const nw = require("../netlify/functions/networth.js");
  const ends = [], saved = [], other = [];
  for (let round = 0; round < ROUNDS; round++) {
    const user = await newUser(); who = user;
    try {
      must(await admin.from("plus_addon_subscriptions").insert({ user_id: user, provider: "stripe", plan_key: "plus_monthly", status: "active", product_id: process.env.STRIPE_PRICE_PLUS_MONTHLY_CAD, current_period_end: new Date(Date.now() + 20 * 86400000).toISOString() }), "seed Plus");
      must(await admin.from("net_worth_entries").insert(Array.from({ length: 49 }, (_, i) => ({ user_id: user, kind: "home", label: `e${i}`, value_cents: 100, currency: "CAD" }))), "seed entries");
      const answers = await Promise.all(Array.from({ length: WRITERS }, (_, i) => quietly(() => nw.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer synthetic" },
        body: JSON.stringify({ action: "save_entry", client_version: "1.1.8", kind: "car", label: `new ${i}`, value: 9000, currency: "CAD" }) }))));
      const n = must(await admin.from("net_worth_entries").select("id").eq("user_id", user), "count entries").data.length;
      ends.push(n);
      saved.push(answers.filter((a) => a.statusCode === 200).length);
      other.push(...answers.filter((a) => a.statusCode !== 200 && a.statusCode !== 409).map((a) => a.statusCode));
    } finally { await admin.auth.admin.deleteUser(user).catch(() => {}); }
  }
  return { ends, saved, other };
}

const tally = (xs) => Object.entries(xs.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {})).map(([k, v]) => `${k} (${v}x)`).join(", ");

(async () => {
  console.log(`${ROUNDS} rounds, ${WRITERS} writers at once, against ${URL_}`);
  const old = await n3("round 1");
  console.log(`N3, the round 1 rule (count again, take yourself out): banks left per round: ${tally(old.ends)}   [the limit is 2]`);
  const now = await n3("round 2");
  console.log(`N3, the rule now (one fixed order):                    banks left per round: ${tally(now.ends)}; first bank lost in ${now.firstLost} rounds`);
  const e = await n4();
  console.log(`N4, the real function at 49 entries:                   entries left per round: ${tally(e.ends)}; saves answered 200 per round: ${tally(e.saved)}${e.other.length ? `; UNEXPECTED answers: ${tally(e.other)}` : ""}   [the cap is 50]`);
  const bad = [];
  if (now.ends.some((n) => n > 2)) bad.push("N3: more than 2 banks were left in some round");
  if (now.firstLost) bad.push("N3: the bank that was already connected was removed");
  if (e.ends.some((n) => n > 50)) bad.push("N4: more than 50 entries were left in some round");
  if (e.other.length) bad.push("N4: an answer that was neither a save nor the known refusal");
  const exact = now.ends.filter((n) => n === 2).length, exact4 = e.ends.filter((n) => n === 50).length;
  console.log(bad.length ? `FAILED: ${bad.join("; ")}` : `OK: never past the limit. Exactly the limit in ${exact} of ${ROUNDS} bank rounds and ${exact4} of ${ROUNDS} entry rounds (fewer means the extra's removal outlasted the waits: both went, and a retry connects).`);
  process.exit(bad.length ? 1 : 0);
})().catch((err) => { console.error("could not run:", err.message); process.exit(2); });
