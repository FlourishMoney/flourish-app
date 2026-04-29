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
// -----------------------------------------------------------------------------

const TRUST_RULES = `
STRICT NUMBER POLICY (non-negotiable):
- Never invent or estimate dollar amounts, percentages, interest rates, dates, or timelines.
- Only cite numbers that (a) appear in the context above, or (b) are returned by a Flourish calculation function and passed to you explicitly.
- If the user asks for a specific figure you do not have, do not guess. Reply: "I can run a What-If simulation for that — want to try one?"
- Reference tax constants (CCB, FHSA, Child Tax Credit, etc.) that are stated in the context are safe to cite. Do not round, adjust, or extrapolate them.`;

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
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: payload.system ||
          "You are Flourish, a friendly and knowledgeable personal finance coach. Be concise, warm, and practical." +
          TRUST_RULES,
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
          TRUST_RULES,
        messages: [{ role: "user", content: payload.prompt || "Give me a quick financial check-in summary." }],
      };
      break;

    case "insights":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: payload.system ||
          ("You are Flourish, a warm financial coach. Analyze real transaction data. Use exact numbers from the data. Respond ONLY with valid JSON." +
            TRUST_RULES),
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
    console.log(`[coach] type="${type}" model="${anthropicBody.model}"`);

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
