// tests/_giftFake.cjs
// -----------------------------------------------------------------------------
// A stand-in for Supabase that knows migration 0050's gift functions, for tests/gifts.test.cjs. The functions here do
// what 0050's do (tests/gifts.sql.test.cjs runs the real ones in Postgres); everything else is a small table store:
// from(table) with select/eq/maybeSingle, insert(...).select(), update(...).eq() and upsert, enough for
// stripe-webhook.js, billing.js and _lib/auth.js getUserPlan. Any other chained call answers an empty result.
// Also: draftWords(), the drafts in docs/review/GIFT-COPY.md as a words map, so an email can be read as it would be sent.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");

const DOC = path.join(__dirname, "..", "docs", "review", "GIFT-COPY.md");
/** { id: draft } for every row of GIFT-COPY.md. */
function draftWords() {
  const doc = fs.readFileSync(DOC, "utf8");
  const out = {};
  for (const m of doc.matchAll(/^\| `(gift-[a-z0-9-]+)` \| [^|]+ \| ([^|]+) \| (pending|approved) \|$/gm)) out[m[1]] = m[2].trim();
  return out;
}

const iso = (v) => new Date(v).toISOString();
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
// 00:00 / 07:00 America/Toronto on a day, the way 0050 computes it (EST -5, EDT -4: second Sunday of March to first
// Sunday of November, both at 02:00).
function torontoAt(day, hour) {
  const [y, m, d] = day.split("-").map(Number);
  const nthSunday = (month, n) => { const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (n - 1); };
  const dstStart = Date.UTC(y, 2, nthSunday(3, 2), 7), dstEnd = Date.UTC(y, 10, nthSunday(11, 1), 6);
  const guess = Date.UTC(y, m - 1, d, hour + 5);
  const inDst = guess - 3600e3 >= dstStart && guess - 3600e3 < dstEnd;
  return new Date(Date.UTC(y, m - 1, d, hour + (inDst ? 4 : 5)));
}

function makeFake({ rows = {}, failRpc = null, missingGift = false, onRpc = null } = {}) {
  const state = { rows: { billing_events: [], subscriptions: [], profiles: [], ...rows }, gifts: [], writes: [], rpcCalls: [] };
  const status = (g) => (g.voided_at ? "void" : g.redeemed_at ? "redeemed" : "unused");
  const view = (g) => ({ created: false, collision: false, code: g.code, plan: g.plan, delivery: g.delivery, buyer_email: g.buyer_email,
    recipient_name: g.recipient_name, recipient_email: g.recipient_email, gift_message: g.gift_message, send_on: g.send_on,
    start_on: g.start_on, buyer_emailed_at: g.buyer_emailed_at, status: status(g) });
  const byCode = (c) => state.gifts.find((g) => g.code === c);

  const GIFT = {
    gift_create(a) {
      const had = state.gifts.find((g) => g.stripe_session_id === a.p_session);
      if (had) return view(had);
      if (byCode(a.p_code)) return { created: false, collision: true };
      const g = { code: a.p_code, plan: a.p_plan, stripe_session_id: a.p_session, stripe_payment_intent: a.p_payment_intent, livemode: !!a.p_livemode,
        buyer_email: a.p_buyer_email, delivery: a.p_delivery, recipient_name: a.p_recipient_name, recipient_email: a.p_recipient_email,
        gift_message: a.p_message, send_on: a.p_send_on, start_on: a.p_start_on, amount_total_cents: a.p_total, buyer_emailed_at: null,
        recipient_sent_at: null, recipient_send_claimed_at: null, recipient_send_attempts: 0, recipient_last_error: null,
        redeemed_by: null, redeemed_at: null, starts_at: null, ends_at: null, voided_at: null, created_at: new Date().toISOString() };
      state.gifts.push(g);
      return { ...view(g), created: true };
    },
    gift_mark_buyer_emailed(a) {
      const g = byCode(a.p_code); if (!g) return false;
      g.buyer_emailed_at = g.buyer_emailed_at || a.p_now;
      if (g.delivery === "print") { g.recipient_name = null; g.gift_message = null; }
      return true;
    },
    gift_refund(a) {
      const g = state.gifts.find((x) => x.stripe_payment_intent === a.p_payment_intent);
      if (!g) return { found: false };
      if (g.voided_at) return { found: true, already_void: true };
      if (g.redeemed_at) return { found: true, redeemed: true };
      if (!a.p_full) return { found: true, partial: true };
      Object.assign(g, { voided_at: a.p_now, void_reason: "refunded", recipient_name: null, gift_message: null, recipient_send_claimed_at: null });
      return { found: true, voided: true };
    },
    gift_redeem(a) {
      if (!a.p_user || !/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/.test(a.p_code || "")) return { result: "invalid" };
      const g = byCode(a.p_code);
      if (!g) return { result: "invalid" };
      if (g.voided_at) return { result: "void" };
      if (g.redeemed_at) return g.redeemed_by === a.p_user ? { result: "mine", plan: g.plan, starts_at: g.starts_at, ends_at: g.ends_at } : { result: "used" };
      const now = Date.parse(a.p_now);
      const after = Math.max(0, ...state.gifts.filter((x) => x.redeemed_by === a.p_user && !x.voided_at && Date.parse(x.ends_at) > now).map((x) => Date.parse(x.ends_at)));
      const start = Math.max(now, a.p_not_before ? Date.parse(a.p_not_before) : now, g.start_on ? torontoAt(g.start_on, 0).getTime() : now, after || now);
      Object.assign(g, { redeemed_by: a.p_user, redeemed_at: a.p_now, starts_at: iso(start), ends_at: iso(addMonths(start, 12)) });
      return { result: "ok", plan: g.plan, starts_at: g.starts_at, ends_at: g.ends_at };
    },
    gift_cover(a) {
      const now = Date.parse(a.p_now);
      const mine = state.gifts.filter((g) => g.redeemed_by === a.p_user && !g.voided_at && Date.parse(g.ends_at) > now);
      const cur = mine.filter((g) => Date.parse(g.starts_at) <= now).sort((x, y) => Date.parse(y.ends_at) - Date.parse(x.ends_at))[0];
      const later = mine.filter((g) => Date.parse(g.starts_at) > now).map((g) => Date.parse(g.starts_at));
      return { covered: !!cur, plan: cur ? cur.plan : null, plus: !!cur && cur.plan === "flourish_plus",
        ends_at: mine.length ? iso(Math.max(...mine.map((g) => Date.parse(g.ends_at)))) : null, next_starts_at: later.length ? iso(Math.min(...later)) : null };
    },
    gift_claim_due_sends(a) {
      const now = Date.parse(a.p_now);
      const due = state.gifts.filter((g) => g.delivery === "email" && g.recipient_email && g.send_on && !g.recipient_sent_at && !g.voided_at && !g.redeemed_at
        && g.recipient_send_attempts < 10 && (!g.recipient_send_claimed_at || Date.parse(g.recipient_send_claimed_at) < now - 30 * 60000)
        && torontoAt(g.send_on, 7).getTime() <= now).slice(0, a.p_limit || 5);
      return due.map((g) => { g.recipient_send_claimed_at = a.p_now; g.recipient_send_attempts++;
        return { code: g.code, plan: g.plan, recipient_email: g.recipient_email, recipient_name: g.recipient_name, gift_message: g.gift_message,
          send_on: g.send_on, start_on: g.start_on, recipient_send_attempts: g.recipient_send_attempts }; });
    },
    gift_mark_sent(a) {
      const g = byCode(a.p_code); if (!g || g.recipient_sent_at) return false;
      Object.assign(g, { recipient_sent_at: a.p_now, recipient_send_claimed_at: null, recipient_last_error: null, recipient_name: null, gift_message: null });
      return true;
    },
    gift_mark_send_failed(a) { const g = byCode(a.p_code); if (g && !g.recipient_sent_at) g.recipient_last_error = a.p_error; return null; },
    gift_release_send(a) {
      const g = byCode(a.p_code); if (g && !g.recipient_sent_at) Object.assign(g, { recipient_send_claimed_at: null, recipient_send_attempts: Math.max(0, g.recipient_send_attempts - 1), recipient_last_error: a.p_error });
      return null;
    },
  };

  const table = (name) => (state.rows[name] = state.rows[name] || []);
  const query = (name) => {
    const filters = [];
    const q = {
      select() { return q; },
      eq(col, val) { filters.push((r) => r[col] === val); return q; },
      async maybeSingle() { return { data: table(name).find((r) => filters.every((f) => f(r))) || null, error: null }; },
      insert(row, opts) {
        const pk = name === "billing_events" ? "event_id" : "user_id";
        const dup = table(name).some((r) => r[pk] === row[pk]);
        state.writes.push({ table: name, op: "insert", row, duplicate: dup });
        if (!dup) table(name).push({ ...row });
        return { select: async () => ({ data: dup && opts && opts.ignoreDuplicates ? [] : dup ? [] : [{ ...row }], error: null }) };
      },
      async upsert(row) {
        state.writes.push({ table: name, op: "upsert", row });
        const i = table(name).findIndex((r) => r.user_id === row.user_id);
        if (i >= 0) Object.assign(table(name)[i], row); else table(name).push({ ...row });
        return { error: null };
      },
      update(patch) {
        return { eq: async (col, val) => { state.writes.push({ table: name, op: "update", patch, where: { [col]: val } }); table(name).forEach((r) => { if (r[col] === val) Object.assign(r, patch); }); return { error: null }; } };
      },
      // Anything else (an in(), an order(), a limit()): an empty answer, as for a table with nothing in it.
      in() { return q; }, order() { return q; }, limit() { return q; }, neq() { return q; }, is() { return q; }, gt() { return q; }, lte() { return q; },
      then(res, rej) { return Promise.resolve({ data: table(name).filter((r) => filters.every((f) => f(r))), error: null }).then(res, rej); },
    };
    return q;
  };
  const client = {
    from: query,
    async rpc(fn, args) {
      state.rpcCalls.push({ fn, args });
      if (onRpc) { const r = await onRpc(fn, args, state); if (r) return r; }
      if (GIFT[fn]) {
        if (missingGift) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` } };
        if (failRpc && failRpc(fn)) return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
        return { data: GIFT[fn](args), error: null };
      }
      if (fn === "purchase_attempt_begin") return { data: { result: "held" }, error: null };
      return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` } };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "someone@example.ca" } }, error: null }) } },
  };
  return { client, state, GIFT };
}

module.exports = { makeFake, draftWords, torontoAt };
