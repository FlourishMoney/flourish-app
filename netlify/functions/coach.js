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
// capped at CHAT_DAILY_CEILING (abuse ceiling; the plan-aware free limit is 2 a week, counted
// fast-follow once a server-side plan table exists). Clients may no longer send
// a `system` prompt — they send `payload.context` (data only), which the server
// embeds inside a server-controlled prompt + TRUST_RULES.
// -----------------------------------------------------------------------------

const { getUserFromRequest, getAdminClient, getUserPlan, ENFORCE_PLAN_LIMITS } = require("./_lib/auth");
const { FREE_CHAT_WEEKLY, countFreeWeek, decideChatLimit } = require("./_lib/coachLimits");
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
const { TRUST_RULES, buildChatSystem, systemBlocks, buildSimulatorSystem, buildCheckinSystem, buildFacilitatorSystem } = require("./_lib/coachPrompt");
const { validateFacilitatorProse, resolveFacilitatorOutput } = require("./_lib/facilitatorGuard");
const { buildSnapshotFactText, validateSnapshotProse, resolveSnapshotOutput } = require("./_lib/snapshotGuard");

// Step 9 defense-in-depth: validate the facilitator's numeric claims against the agenda AFTER
// generation (prompt hardening alone is not a guarantee). If the first reply cites a figure the
// agenda does not state, retry once with a strict correction naming the figure; if that still fails,
// return a safe qualitative fallback. Never displays or persists an unsupported-number response.
async function guardFacilitatorOutput(data, payload, apiKey) {
  const agendaText = payload.context || "";
  const proseOf = (d) => ((d && d.content) || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const first = proseOf(data);
  const firstCheck = validateFacilitatorProse(first, agendaText);
  if (firstCheck.ok) return data;

  const named = firstCheck.violations.map((v) => v.text).slice(0, 5).join("; ");
  const baseMessages = payload.messages || [{ role: "user", content: payload.prompt || "Start the money meeting." }];
  let retryProse = null;
  try {
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: buildFacilitatorSystem(agendaText),
        messages: [
          ...baseMessages,
          { role: "assistant", content: first },
          { role: "user", content: `Your reply used figures the agenda does not state: ${named}. Rewrite it using ONLY numbers written verbatim in the agenda, in the same unit and about the same thing. Do not count, total, average, or compute any ratio or percentage. If an observation needs a number that isn't in the agenda, say it qualitatively. Keep it under 4 sentences.` },
        ],
      }),
    });
    const d2 = await r2.json();
    if (r2.ok) retryProse = proseOf(d2);
  } catch (e) {
    console.error("[coach] facilitator guard retry failed:", e.message);
  }

  const resolved = resolveFacilitatorOutput(agendaText, first, retryProse);
  if (resolved.kind === "first") return data; // defensive; first already failed
  return { ...data, content: [{ type: "text", text: resolved.text }], _guard: resolved.kind };
}

// Same defense-in-depth for chat + checkin: validate the coach's numeric claims against the snapshot
// the client sent (plus numbers the user typed), retry once naming the unsupported figure, else a safe
// qualitative fallback. The client-side reply footer renders below whatever text this returns.
async function guardSnapshotOutput(data, payload, apiKey, type) {
  const proseOf = (d) => ((d && d.content) || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const userText = type === "checkin"
    ? (payload.prompt || "")
    : (payload.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const factText = buildSnapshotFactText(payload.context, userText);
  const first = proseOf(data);
  const firstCheck = validateSnapshotProse(first, factText);
  if (firstCheck.ok) return data;

  const named = firstCheck.violations.map((v) => v.text).slice(0, 5).join("; ");
  const system = type === "checkin" ? buildCheckinSystem(payload.context) : buildChatSystem(payload.context);
  const baseMessages = type === "checkin"
    ? [{ role: "user", content: payload.prompt || "Give me a quick financial check-in summary." }]
    : (payload.messages || []);
  let retryProse = null;
  try {
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: type === "checkin" ? 400 : 1024,
        system,
        messages: [
          ...baseMessages,
          { role: "assistant", content: first },
          { role: "user", content: `Your reply used figures not present in my data: ${named}. Rewrite it citing ONLY numbers written verbatim in the snapshot above, or numbers I typed in my message, in the same unit and about the same thing. Do not compute a surplus, total, average, ratio or percentage from my numbers, and do not state a program limit or rate that isn't in the snapshot. If a figure isn't there, say so or describe it qualitatively. Keep it concise.` },
        ],
      }),
    });
    const d2 = await r2.json();
    if (r2.ok) retryProse = proseOf(d2);
  } catch (e) {
    console.error("[coach] snapshot guard retry failed:", e.message);
  }

  const resolved = resolveSnapshotOutput(factText, first, retryProse);
  if (resolved.kind === "first") return data; // defensive; first already failed
  return { ...data, content: [{ type: "text", text: resolved.text }], _guard: resolved.kind };
}
const { isLiveCoachType } = require("./_lib/coachTypes");

// Path B abuse ceiling: max `chat` messages per user per day. Generous on purpose
// — this is a cost/DoS backstop, not the product limit. Plan-aware free=1/day
// will layer on once a server plan source (profiles table) exists.
const CHAT_DAILY_CEILING = 50;

// Sprint Q item 11: plan-aware free-tier daily Coach limit (server-authoritative via the profiles
// table). Matches the product's free tier; trial/plus/pro/founder get the abuse ceiling above.
// FLAG: bump this if 1/day proves too tight for free users.
// The free limit is FREE_CHAT_WEEKLY (2 a week, Monday 00:00 UTC) and lives in _lib/coachLimits.js.
// It was 1 a DAY here while the client and DECISIONS.md item 2 both said 2 a week.

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

const { corsHeadersFor } = require("./_lib/cors");

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

  // ── Sprint Z3 #2: server-enforced consent GATE — require AFFIRMATIVE consent before any AI path ───
  // Direct profiles read (NOT inferred from getUserPlan). The gate turns on a distinction the previous
  // version collapsed:
  //   "we couldn't check"        (read error / thrown query) → FAIL OPEN (logged). A transient DB blip
  //                              must not take AI down for everyone — a defensible availability tradeoff.
  //   "we checked, and there is  → BLOCK. A SUCCESSFUL read is authoritative. Consent requires a
  //    no consent on file"          POSITIVE ai_third_party_consent_at with no later revoke; a missing
  //                                 profiles row, a null consent_at, or a revoke all mean "not granted".
  // The old gate selected only revoked_at, so a user who never consented (consent_at null, revoked_at
  // null) and a user with no row at all sailed through — indistinguishable from a real grant.
  try {
    const admin = getAdminClient();
    const { data: prof, error: cErr } = await admin
      .from("profiles")
      .select("ai_third_party_consent_at, ai_third_party_consent_revoked_at")
      .eq("user_id", user_id)
      .maybeSingle();
    if (cErr) {
      // Couldn't check — fail open. NOT the same as "checked and found no consent".
      console.error("[coach] consent check read error (failing open):", cErr.message);
    } else {
      // Checked. accept_consent writes consent_at and clears revoked_at; revoke_consent writes
      // revoked_at. So a live grant is: consent_at present AND not superseded by a later revoke. The
      // timestamp comparison is belt-and-suspenders in case a revoke ever coexists with a grant.
      const grantedAt = prof && prof.ai_third_party_consent_at;
      const revokedAt = prof && prof.ai_third_party_consent_revoked_at;
      const hasConsent = !!grantedAt && (!revokedAt || new Date(revokedAt) < new Date(grantedAt));
      if (!hasConsent) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "ai_consent_required" }) };
      }
    }
  } catch (e) {
    console.error("[coach] consent check threw (failing open):", e.message);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[coach] ANTHROPIC_API_KEY is not set");
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server configuration error: missing API key" }) };
  }

  // Step 2: reject any non-live type before dispatch (plan/insights/buckets/tax removed).
  if (!isLiveCoachType(type)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "unknown_type", message: `Unsupported coach type: ${type}` }) };
  }

  let anthropicBody;

  switch (type) {

    case "chat":
      if (!payload.messages || !Array.isArray(payload.messages)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "payload.messages must be an array" }) };
      }
      // Abuse control — count coach chat messages. (Step 2 removed the dead unmetered "plan" alias;
      // only "chat" reaches this branch now, so metering is unconditional.)
      {
        // Sprint Z #8: per-IP backstop FIRST, independent of Supabase. Counts every request, so it
        // still limits abuse even if the per-user counter/DB is down.
        const ip = clientIp(event);
        let ipCount = null;
        try { ipCount = await bumpIpUsage(ip); }
        catch (e) { console.error("[coach] IP backstop unavailable:", e.message); }

        let userRpcOk = false;
        try {
          // Sprint Q item 11: plan-aware limit from the profiles table (server-authoritative, NOT
          // client-sent). Free → FREE_CHAT_WEEKLY a week; trial/plus/pro/founder → the abuse ceiling only.
          const { unlimited } = await getUserPlan(user_id);
          const admin = getAdminClient();
          // The abuse ceiling, unchanged: every account is counted per day by the existing
          // day-keyed counter, and CHAT_DAILY_CEILING still applies to all of them.
          const { data: usedToday, error: rlError } = await admin.rpc("increment_coach_usage", { p_user: user_id });
          if (rlError) throw rlError;
          userRpcOk = true;
          // The free limit, 2 a week on the Monday 00:00 UTC window (migration 0008). Counted only
          // for accounts the free limit can apply to, so nothing is written for a trial, a paid plan
          // or a founder, and nothing at all while the flag is off.
          //
          // countFreeWeek NEVER THROWS. If it did, the failure would be caught below by the handler
          // that exists for the day-keyed counter being down, whose answer is to let the request
          // through under an emergency per-IP cap — and a free account would land on the 50-a-day
          // abuse ceiling instead of 2 a week. The weekly counter fails closed on its own instead:
          // weeklyCounterOk false refuses a free message with the ordinary limit message. Founders,
          // paid plans and live trials never enter this branch, so they can never be blocked by it.
          let usedWeek = null;
          let weeklyCounterOk = true;
          if (ENFORCE_PLAN_LIMITS && !unlimited) {
            const wk = await countFreeWeek(admin, user_id);
            usedWeek = wk.usedWeek;
            weeklyCounterOk = wk.weeklyCounterOk;
          }
          const decision = decideChatLimit({
            enforce: ENFORCE_PLAN_LIMITS, unlimited,
            usedToday, dailyCeiling: CHAT_DAILY_CEILING,
            usedWeek, weeklyCounterOk, freeWeekly: FREE_CHAT_WEEKLY,
          });
          if (!decision.allowed) {
            return {
              statusCode: 429,
              headers: corsHeaders,
              body: JSON.stringify({ error: "rate_limited", message: decision.message }),
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
              body: JSON.stringify({ error: "rate_limited", message: "Coach is briefly unavailable. Please try again in a few minutes." }),
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
        system: buildSimulatorSystem(),
        messages: [{ role: "user", content: payload.prompt || "Explain this financial scenario." }],
      };
      break;

    case "checkin":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: buildCheckinSystem(payload.context),
        messages: [{ role: "user", content: payload.prompt || "Give me a quick financial check-in summary." }],
      };
      break;

    case "facilitator":
      // Step 9: the Meet money-meeting facilitator. Receives a pre-computed agenda whose every figure
      // is engine output; it facilitates and NEVER produces a number.
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: buildFacilitatorSystem(payload.context),
        messages: payload.messages || [{ role: "user", content: payload.prompt || "Start the money meeting." }],
      };
      break;

    case "document":
      anthropicBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        temperature: 0,
        system: systemBlocks("You are a tax document parser. Extract financial data and return only valid JSON. No markdown." + TRUST_RULES),
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

    // Deterministic numeric guard before the reply ships: facilitator against the agenda; chat and
    // checkin against the snapshot the client sent (validate → retry once → safe fallback). Simulator
    // and document-import are unchanged.
    let finalData = data;
    if (type === "facilitator") finalData = await guardFacilitatorOutput(data, payload, apiKey);
    else if (type === "chat" || type === "checkin") finalData = await guardSnapshotOutput(data, payload, apiKey, type);

    console.log(`[coach] OK — stop="${finalData.stop_reason}" tokens=${finalData.usage?.output_tokens}${finalData._guard ? ` guard=${finalData._guard}` : ""}`);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(finalData) };

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
