// tests/consentHeal.test.cjs
// -----------------------------------------------------------------------------
// AI-consent client self-heal decision core (src/lib/consentHeal.js).
//
// The self-heal recovers a user whose consent was granted but whose server write was lost, WITHOUT
// becoming a bypass. These tests pin the guardrails:
//   * fires ONLY when local state shows prior acceptance;
//   * never fires when local state shows no acceptance (routes to disclosure instead);
//   * fires at most once per session;
//   * acceptAIDisclosure must not proceed when a logged-in user's write failed.
// -----------------------------------------------------------------------------
"use strict";

const { create } = require("./_runner.cjs");

(async () => {
  const { decideConsentAction, canProceedAfterAccept } = await import("../src/lib/consentHeal.js");
  const t = create();

  // ── Not a consent block → "none" ───────────────────────────────────────────────────────────────
  t.eq(decideConsentAction({ status: 200, errorCode: undefined, localAccepted: true, healedThisSession: false }),
       "none", "a 200 is not a consent block — proceed normally");
  t.eq(decideConsentAction({ status: 429, errorCode: "rate_limited", localAccepted: true, healedThisSession: false }),
       "none", "a 429 rate-limit is not a consent block");
  t.eq(decideConsentAction({ status: 403, errorCode: "some_other_403", localAccepted: true, healedThisSession: false }),
       "none", "a 403 that is NOT ai_consent_required is left alone — self-heal is scoped to the consent code only");
  t.eq(decideConsentAction({ status: 401, errorCode: "ai_consent_required", localAccepted: true, healedThisSession: false }),
       "none", "a 401 (e.g. the demo path with no JWT) is not the consent gate and does not self-heal");

  // ── (1) Self-heal FIRES when local state shows prior acceptance ─────────────────────────────────
  t.eq(decideConsentAction({ status: 403, errorCode: "ai_consent_required", localAccepted: true, healedThisSession: false }),
       "heal",
       "granted locally + server has no record + first attempt this session -> HEAL. This is the exact " +
       "lost-write recovery case: the user consented, but the fire-and-forget POST never landed.");

  // ── (2) Self-heal does NOT fire when local state shows NO acceptance ────────────────────────────
  t.eq(decideConsentAction({ status: 403, errorCode: "ai_consent_required", localAccepted: false, healedThisSession: false }),
       "disclose",
       "NOT accepted locally -> DISCLOSE, never heal. A user who never consented must go through the " +
       "disclosure screen; silently re-consenting them would turn the gate into a bypass.");
  t.eq(decideConsentAction({ status: 403, errorCode: "ai_consent_required", localAccepted: false, healedThisSession: true }),
       "disclose", "no local acceptance still routes to disclosure regardless of the session flag");

  // ── (3) Self-heal STOPS after one attempt ──────────────────────────────────────────────────────
  t.eq(decideConsentAction({ status: 403, errorCode: "ai_consent_required", localAccepted: true, healedThisSession: true }),
       "disclose",
       "accepted locally but a heal was ALREADY tried this session and still 403 -> DISCLOSE, not heal. " +
       "No re-post/retry loop; the disclosure screen is the terminal fallback.");

  // Simulate the full session sequence a client walks through, to prove it converges rather than loops.
  {
    let healed = false;
    const decide = () => decideConsentAction({
      status: 403, errorCode: "ai_consent_required", localAccepted: true, healedThisSession: healed,
    });
    const first = decide();
    t.eq(first, "heal", "session step 1: first 403 with local acceptance -> heal");
    if (first === "heal") healed = true;               // client burns its one attempt
    const second = decide();
    t.eq(second, "disclose", "session step 2: still 403 after the heal -> disclose (loop cannot recur)");
    // A third evaluation must also be disclose — never flips back to heal within the session.
    t.eq(decide(), "disclose", "session step 3: remains disclose; the attempt is not replenished mid-session");
  }

  // ── (4) canProceedAfterAccept — acceptAIDisclosure must not proceed on a failed logged-in write ──
  t.eq(canProceedAfterAccept({ hadJwt: true, ok: true }), true,
       "logged-in user, server acknowledged the write -> proceed");
  t.eq(canProceedAfterAccept({ hadJwt: true, ok: false }), false,
       "logged-in user, server write FAILED -> do NOT proceed. Proceeding here is exactly what created " +
       "the lockout: the client would believe consent was recorded when it was not.");
  t.eq(canProceedAfterAccept({ hadJwt: false, ok: false }), true,
       "anonymous/demo path (no JWT, nothing to record) -> proceed; there is no server user to gate");
  t.eq(canProceedAfterAccept({ hadJwt: false, ok: true }), true,
       "no JWT with an incidental ok is still the proceed (demo) case");

  // ── The two mechanisms compose: a lost write self-heals, a never-granted never does ─────────────
  {
    // Lost-write user: accepted locally (localAccepted true). First 403 -> heal -> re-post succeeds.
    const lostWrite = decideConsentAction({ status: 403, errorCode: "ai_consent_required", localAccepted: true, healedThisSession: false });
    t.eq(lostWrite, "heal", "lost-write user recovers via heal");
    // Never-granted user: same 403, but no local acceptance -> disclose, no matter what.
    const neverGranted = decideConsentAction({ status: 403, errorCode: "ai_consent_required", localAccepted: false, healedThisSession: false });
    t.eq(neverGranted, "disclose", "never-granted user is always routed to disclosure — the second never masquerades as the first");
    t.ok(lostWrite !== neverGranted, "the two populations are handled differently, which is the whole safety property");
  }

  t.summary("consentHeal.test");
})();
