// netlify/functions/coach.js
// Flourish Money — AI Coach serverless function
//
// ── TRUST LAYER (Phase 1) ────────────────────────────────────────────────────
// Claude must never invent financial numbers. All dollar amounts, percentages,
// and dates shown to the user must come from one of:
//   (a) the user's context passed in the system prompt (e.g. balance, income)
//   (b) a deterministic calculation returned by src/lib/financialCalculations.js
//       (e.g. newBalance, monthsToPayoff, finalValue)
// If the user asks for a number not in either source, Claude must decline and
// suggest running a What-If simulation instead of guessing.
//
// ── AUTH + ABUSE CEILING (Tier 1.1) ──────────────────────────────────────────
// Every request requires a valid Supabase JWT (Authorization: Bearer <token>).
// `chat` requests are counted per-user-per-day via the coach_usage table and
// capped at CHAT_DAILY_CEILING (abuse ceiling; plan-aware free=1/day is a
// fast-follow once a server-side plan table exists). Clients may no longer send
// a `system` prompt — they send `payload.context` (data only), which the server
// embeds inside a server-controlled prompt + TRUST_RULES.
// -----------------------------------------------------------------------------

const { getUserFromRequest, getAdminClient, getUserPlan, ENFORCE_PLAN_LIMITS } = require("./_lib/auth");
const { getStore } = require("@netlify/blobs");

// Sprint Z #8: per-IP abuse backstop, independent of Supabase. The client IP comes from Netlify's
// trusted header (falls back to x-forwarded-for).
function clientIp(event) {
  const h = event.headers || {};
  const ip = (h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "").split(",")[0].trim();
  return ip || null;
}

// Increment + return today's per-IP coach count in Netlify Blobs. Read-then-write isn't atomic, so
// it can slightly undercount under heavy concurrency — fine for an abuse/cost backstop (not a precise
// quota). Returns null when no IP or Blobs is unavailable, so callers can decide how to degrade.
async function bumpIpUsage(ip) {
  if (!ip) return null;
  const store = getStore("coach_ip_usage");
  const key = `${new Date().toISOString().slice(0, 10)}:${ip}`;
  const cur = await store.get(key, { type: "json" });
  const n = ((cur && cur.n) || 0) + 1;
  await store.setJSON(key, { n });
  return n;
}
// TRUST_RULES + buildChatSystem live in _lib/coachPrompt.js so the Coach QA suite
// (tests/coach_qa.cjs) tests the exact prompt this function ships.
const { TRUST_RULES, buildChatSystem } = require("./_lib/coachPrompt");

// Path B abuse ceiling: max `chat` messages per user per day. Generous on purpose
// — this is a cost/DoS backstop, not the product limit. Plan-aware free=1/day
// will layer on once a server plan source (profiles table) exists.
const CHAT_DAILY_CEILING = 50;

// Sprint Q item 11: plan-aware free-tier daily Coach limit (server-authoritative via the profiles
// table). Matches the product's free tier; trial/plus/pro/founder get the abuse ceiling above.
// FLAG: bump this if 1/day proves too tight for free users.
const FREE_CHAT_DAILY = 1;

// Sprint Z #8: per-IP daily caps (Netlify Blobs). IP_DAILY_CAP is the healthy-mode abuse/cost
// backstop — generous so users behind shared NAT aren't hit. EMERGENCY_IP_DAILY is the much tighter
// cap applied only when the per-user counter (Supabase RPC) is DOWN, so an outage can't open the
// floodgates (fail closed, not open).
const IP_DAILY_CAP = 100;
// FLAG (tunable): the emergency cap only applies during a per-user-counter outage. It's intentionally
// tight, but it's PER-IP, so a shared NAT (office / campus / cellular CGNAT) shares this budget during
// the outage. Raise it if legitimate shared-IP users get throttled during incidents.
const EMERGENCY_IP_DAILY = 10;

// Reject absurdly large bodies (cheap DoS guard; real coach messages are a few KB).
const MAX_BODY_BYTES = 100000;

// Phase D2: origin-aware CORS — locks to known origins, falls back to production.
const ALLOWED_ORIGINS = new Set([
  "https://flourishmoney.app",
  "http://localhost:5173",
  "http://localhost:8888",
]);

function corsHeadersFor(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://flourishmoney.app";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
}

exports.handler = async (event) => {
  const corsHeaders = corsHeadersFor(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // ── Auth gate (mirror plaid.js) ────────────────────────────────────────────
  const { user_id, error: authError } = await getUserFromRequest(event);
  if (!user_id) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: authError || "unauthorized" }) };
  }

  // ── Body size guard ────────────────────────────────────────────────────────
  if ((event.body || "").length > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: "Request too large" }) };
  }

  let type, payload, action;
  try {
    const body = JSON.parse(event.body || "{}");
    type = body.type;
    payload = body.payload || {};
    action = body.action;
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  // ── Sprint Z3 #2: AI third-party consent management (no consent gate, no Anthropic call) ──────
  // The client POSTs these so the SERVER is the source of truth for consent — client localStorage
  // alone can be bypassed. accept clears any prior revoke; revoke sets the timestamp the gate reads.
  if (action === "accept_consent" || action === "revoke_consent") {
    try {
      const admin = getAdminClient();
      const nowIso = new Date().toISOString();
      const patch = action === "accept_consent"
        ? { ai_third_party_consent_at: nowIso, ai_third_party_consent_revoked_at: null }
        : { ai_third_party_consent_revoked_at: nowIso };
      const { error } = await admin.from("profiles").update(patch).eq("user_id", user_id);
      if (error) { console.error("[coach] consent update failed:", error.message); return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "consent_update_failed" }) }; }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      console.error("[coach] consent update threw:", e.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "consent_update_failed" }) };
    }
  }

  // ── Sprint Z3 #2: server-enforced consent GATE — block ALL AI paths if consent was revoked ───
  // Direct profiles read (NOT inferred from getUserPlan). FAIL-OPEN on a read error (logged) so a
  // transient DB blip doesn't take AI down for everyone; a CONFIRMED revoke is always enforced.
  try {
    const admin = getAdminClient();
    const { data: prof, error: cErr } = await admin
      .from("profiles")
      .select("ai_third_party_consent_revoked_at")
      .eq("user_id", user_id)
      .maybeSingle();
    if (cErr) console.error("[coach] consent check read error (failing open):", cErr.message);
    else if (prof && prof.ai_third_party_consent_revoked_at) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "ai_consent_required" }) };
    }
  } catch (e) {
    console.error("[coach] consent check threw (failing open):", e.message);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[coach] ANTHROPIC_API_KEY is not set");
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server configuration error: missing API key" }) };
  }

  let anthropicBody;

  switch (type) {

    case "chat":
    case "plan":
      if (!payload.messages || !Array.isArray(payload.messages)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "payload.messages must be an array" }) };
      }
      // Abuse control — count real coach chat AND plan messages (both make the same upstream call).
      // Sprint Z2 #4: "plan" shares this branch with "chat"; the old `type === "chat"` guard let any
      // authenticated caller send {type:"plan"} for an identical, fully UNMETERED Anthropic request.
      if (type === "chat" || type === "plan") {
        // Sprint Z #8: per-IP backstop FIRST, independent of Supabase. Counts every request, so it
        // still limits abuse even if the per-user counter/DB is down.
        const ip = clientIp(event);
        let ipCount = null;
        try { ipCount = await bumpIpUsage(ip); }
        catch (e) { console.error("[coach] IP backstop unavailable:", e.message); }

        let userRpcOk = false;
        try {
          // Sprint Q item 11: plan-aware limit from the profiles table (server-authoritative, NOT
          // client-sent). Free → FREE_CHAT_DAILY/day; trial/plus/pro/founder → the abuse ceiling.
          const { unlimited } = await getUserPlan(user_id);
          const ceiling = (!ENFORCE_PLAN_LIMITS || unlimited) ? CHAT_DAILY_CEILING : FREE_CHAT_DAILY; // v1: flag off → everyone gets the abuse ceiling, not the free 1/day
          const admin = getAdminClient();
          const { data: usedCount, error: rlError } = await admin.rpc("increment_coach_usage", { p_user: user_id });
          if (rlError) throw rlError;
          userRpcOk = true;
          if (typeof usedCount === "number" && usedCount > ceiling) {
            return {
              statusCode: 429,
              headers: corsHeaders,
              body: JSON.stringify({ error: "rate_limited", message: unlimited
                ? "You've hit today's Coach message limit. It resets tomorrow."
                : "You've used today's free Coach message. Upgrade to Plus for unlimited — or come back tomorrow." }),
            };
          }
        } catch (e) {
          // Sprint Z #8: FAIL CLOSED. The per-user counter is down — don't allow unlimited. Enforce a
          // small emergency per-IP cap, and reject outright if the IP backstop is also unavailable.
          console.error("[coach] usage RPC error (failing closed to IP backstop):", e.message);
          if (ipCount === null || ipCount > EMERGENCY_IP_DAILY) {
            return {
              statusCode: 429,
              headers: corsHeaders,
              body: JSON.stringify({ error: "rate_limited", message: "Coach is briefly unavailable — please try again in a few minutes." }),
            };
          }
        }

        // Healthy-mode per-IP abuse/cost cap (only meaningful when the per-user gate is working).
        if (userRpcOk && ipCount !== null && ipCount > IP_DAILY_CAP) {
          return {
            statusCode: 429,
            headers: corsHeaders,
            body: JSON.stringify({ error: "rate_limited", message: "Too many Coach requests from your network today. Please try again tomorrow." }),
          };
        }
      }
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: buildChatSystem(payload.context),
        messages: payload.messages,
      };
      break;

    case "simulator":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system:
          "You are a financial scenario explainer for Flourish Money. You receive pre-computed simulation results from the app and translate them into plain, warm language. " +
          "Never change, adjust, or add numbers. Do not predict outcomes the app did not provide." +
          TRUST_RULES,
        messages: [{ role: "user", content: payload.prompt || "Explain this financial scenario." }],
      };
      break;

    case "checkin":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system:
          "You are a financial wellness coach doing a quick check-in. Be encouraging, identify one win and one opportunity. Keep it under 150 words." +
          (payload.context ? `\n\n<UNTRUSTED_USER_DATA>\n${payload.context}\n</UNTRUSTED_USER_DATA>` : "") +
          TRUST_RULES,
        messages: [{ role: "user", content: payload.prompt || "Give me a quick financial check-in summary." }],
      };
      break;

    case "insights":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system:
          "You are Flourish, a warm financial coach. Analyze real transaction data. Use exact numbers from the data. Respond ONLY with valid JSON." +
          (payload.context ? `\n\n<UNTRUSTED_USER_DATA>\n${payload.context}\n</UNTRUSTED_USER_DATA>` : "") +
          TRUST_RULES,
        messages: [{ role: "user", content: payload.prompt || "Analyze this user's financial data." }],
      };
      break;

    case "buckets":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        temperature: 0,
        system: "You are a financial planning AI. Respond only with valid JSON. No markdown, no preamble." + TRUST_RULES,
        messages: [{ role: "user", content: payload.prompt || "Generate savings bucket recommendations." }],
      };
      break;

    case "tax":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        temperature: 0,
        system: "You are a Canadian/US tax optimization AI. Respond only with valid JSON. No markdown. Use only the tax rates and thresholds provided in the prompt — do not substitute your own." + TRUST_RULES,
        messages: [{ role: "user", content: payload.prompt || "Calculate tax optimization scenarios." }],
      };
      break;

    case "document":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        temperature: 0,
        system: "You are a tax document parser. Extract financial data and return only valid JSON. No markdown." + TRUST_RULES,
        messages: payload.messages || [{ role: "user", content: payload.prompt || "Parse this document." }],
      };
      break;

    default:
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Unknown type: "${type}". Must be chat, plan, simulator, checkin, insights, buckets, tax, or document.` }),
      };
  }

  try {
    console.log(`[coach] type="${type}" model="${anthropicBody.model}" user="${user_id.slice(0, 8)}"`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();

    if (!response.ok) {
      // Sprint Z #14: don't leak upstream error internals to the client. Log the detail server-side
      // under a ref the client can quote to support.
      const ref = `coach_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      console.error(`[coach] Anthropic error [${ref}]:`, JSON.stringify(data));
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: "The coach is temporarily unavailable. Please try again.", ref }),
      };
    }

    console.log(`[coach] OK — stop="${data.stop_reason}" tokens=${data.usage?.output_tokens}`);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };

  } catch (err) {
    const ref = `coach_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    console.error(`[coach] Network error [${ref}]:`, err.message);
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: "The coach is temporarily unavailable. Please try again.", ref }),
    };
  }
};
