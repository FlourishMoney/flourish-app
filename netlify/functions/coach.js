// netlify/functions/coach.js
// Flourish Money — AI Coach serverless function
// Handles: chat, simulator, checkin types

exports.handler = async (event) => {
  // ── CORS headers (required for browser fetch) ──────────────────────────────
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // ── Parse request body ──────────────────────────────────────────────────────
  let type, payload;
  try {
    const body = JSON.parse(event.body || "{}");
    type = body.type;
    payload = body.payload || {};
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  // ── Verify API key is present ───────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[coach] ANTHROPIC_API_KEY is not set in environment variables");
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Server configuration error: missing API key" }),
    };
  }

  // ── Build Anthropic request based on type ───────────────────────────────────
  let anthropicBody;

  switch (type) {
    case "insights":
      // AI Coach — generate 5 structured spending insights from financial data
      // payload: { system: string, prompt: string }
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: payload.system || "You are Flourish, a warm non-judgmental financial coach. Analyze real transaction data. Use exact numbers. Respond ONLY with valid JSON.",
        messages: [{ role: "user", content: payload.prompt || "Analyze this user's financial data." }],
      };
      break;

    case "chat":
      // Standard AI Coach chat
      if (!payload.messages || !Array.isArray(payload.messages)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "payload.messages must be an array" }),
        };
      }
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: payload.system || "You are Flourish, a friendly and knowledgeable personal finance coach. Be concise, warm, and practical. Focus on actionable advice tailored to the user's situation.",
        messages: payload.messages,
      };
      break;

    case "simulator":
      // Scenario simulation (what-if analysis)
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: "You are a financial scenario simulator for Flourish Money. Analyze the scenario and provide concise, data-driven projections. Format responses clearly with key numbers highlighted.",
        messages: [
          {
            role: "user",
            content: payload.prompt || "Analyze this financial scenario.",
          },
        ],
      };
      break;

    case "checkin":
      // Weekly/monthly financial check-in
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: "You are a financial wellness coach doing a quick check-in for a Flourish Money user. Be encouraging, identify one win and one opportunity. Keep it under 150 words.",
        messages: [
          {
            role: "user",
            content: payload.prompt || "Give me a quick financial check-in summary.",
          },
        ],
      };
      break;

    default:
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Unknown type: "${type}". Must be insights, chat, simulator, or checkin.` }),
      };
  }

  // ── Call Anthropic API ──────────────────────────────────────────────────────
  try {
    console.log(`[coach] Calling Anthropic API, type="${type}", model="${anthropicBody.model}"`);

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
      console.error("[coach] Anthropic API error:", JSON.stringify(data));
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Anthropic API error",
          details: data.error?.message || "Unknown error",
        }),
      };
    }

    console.log(`[coach] Success — stop_reason="${data.stop_reason}", tokens used: ${data.usage?.output_tokens}`);

    // Return the full Anthropic response so App.jsx can do: json.content?.[0]?.text
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(data),
    };

  } catch (err) {
    console.error("[coach] Network/fetch error:", err.message);
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to reach Anthropic API",
        details: err.message,
      }),
    };
  }
};
