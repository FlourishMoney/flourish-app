// netlify/functions/coach.js
// Flourish Money — AI Coach serverless function

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

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
      // Standard chat + conversational plan builder
      if (!payload.messages || !Array.isArray(payload.messages)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "payload.messages must be an array" }) };
      }
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: payload.system || "You are Flourish, a friendly and knowledgeable personal finance coach. Be concise, warm, and practical.",
        messages: payload.messages,
      };
      break;

    case "simulator":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: "You are a financial scenario simulator for Flourish Money. Provide concise, data-driven projections.",
        messages: [{ role: "user", content: payload.prompt || "Analyze this financial scenario." }],
      };
      break;

    case "checkin":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: "You are a financial wellness coach doing a quick check-in. Be encouraging, identify one win and one opportunity. Keep it under 150 words.",
        messages: [{ role: "user", content: payload.prompt || "Give me a quick financial check-in summary." }],
      };
      break;

    case "insights":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: payload.system || "You are Flourish, a warm financial coach. Analyze real transaction data. Use exact numbers. Respond ONLY with valid JSON.",
        messages: [{ role: "user", content: payload.prompt || "Analyze this user's financial data." }],
      };
      break;

    case "buckets":
      // AI savings bucket suggestions — must return JSON
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        temperature: 0,
        system: "You are a financial planning AI. Respond only with valid JSON. No markdown, no preamble.",
        messages: [{ role: "user", content: payload.prompt || "Generate savings bucket recommendations." }],
      };
      break;

    case "tax":
      // Tax optimizer scenarios — must return JSON
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        temperature: 0,
        system: "You are a Canadian/US tax optimization AI. Respond only with valid JSON. No markdown.",
        messages: [{ role: "user", content: payload.prompt || "Calculate tax optimization scenarios." }],
      };
      break;

    case "document":
      // Tax document parsing — must return JSON
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        temperature: 0,
        system: "You are a tax document parser. Extract financial data and return only valid JSON. No markdown.",
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
