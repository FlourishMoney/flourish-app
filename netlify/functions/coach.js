/**
 * Flourish — Secure AI Proxy (Netlify Functions)
 * netlify/functions/coach.js
 *
 * Called by the app as /.netlify/functions/coach
 * ANTHROPIC_API_KEY is set in Netlify → Site Settings → Environment Variables
 */

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let type, payload;
  try {
    ({ type, payload } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!type || !payload) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing type or payload" }) };
  }

  let anthropicBody;

  switch (type) {
    case "insights":
      anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: payload.system,
        messages: [{ role: "user", content: payload.prompt }],
      };
      break;
    case "chat":
      anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: payload.system,
        messages: payload.messages,
      };
      break;
    case "checkin":
      anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 150,
        messages: [{ role: "user", content: payload.prompt }],
      };
      break;
    case "simulator":
      anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 350,
        messages: [{ role: "user", content: payload.prompt }],
      };
      break;
    default:
      return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: "Upstream AI error", ...data }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "AI request failed", message: err.message }) };
  }
};
