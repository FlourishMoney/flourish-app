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

  let type, payload;
  try {
    const body = JSON.parse(event.body || "{}");
    type = body.type;
    payload = body.payload || {};
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON body" }) };
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
      // Abuse ceiling — count only real coach chat messages, after validation.
      // Atomic increment via RPC; fail OPEN on any DB error (auth is the real gate).
      if (type === "chat") {
        try {
          // Sprint Q item 11: plan-aware limit from the profiles table (server-authoritative, NOT
          // client-sent). Free → FREE_CHAT_DAILY/day; trial/plus/pro/founder → the abuse ceiling.
          const { unlimited } = await getUserPlan(user_id);
          const ceiling = (!ENFORCE_PLAN_LIMITS || unlimited) ? CHAT_DAILY_CEILING : FREE_CHAT_DAILY; // v1: flag off → everyone gets the abuse ceiling, not the free 1/day
          const admin = getAdminClient();
          const { data: usedCount, error: rlError } = await admin.rpc("increment_coach_usage", { p_user: user_id });
          if (rlError) {
            console.error("[coach] usage RPC error (failing open):", rlError.message);
          } else if (typeof usedCount === "number" && usedCount > ceiling) {
            return {
              statusCode: 429,
              headers: corsHeaders,
              body: JSON.stringify({ error: "rate_limited", message: unlimited
                ? "You've hit today's Coach message limit. It resets tomorrow."
                : "You've used today's free Coach message. Upgrade to Plus for unlimited — or come back tomorrow." }),
            };
          }
        } catch (e) {
          console.error("[coach] usage check failed (failing open):", e.message);
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
          (payload.context ? `\n\nDATA (authoritative — use these exact figures):\n${payload.context}` : "") +
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
      console.error("[coach] Anthropic error:", JSON.stringify(data));
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Anthropic API error", details: data.error?.message || "Unknown error" }),
      };
    }

    console.log(`[coach] OK — stop="${data.stop_reason}" tokens=${data.usage?.output_tokens}`);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };

  } catch (err) {
    console.error("[coach] Network error:", err.message);
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to reach Anthropic API", details: err.message }),
    };
  }
};
