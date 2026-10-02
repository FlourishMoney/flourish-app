// src/lib/feedback.js
// -----------------------------------------------------------------------------
// FEEDBACK, SAVED TO OUR OWN SUPABASE (tester suggestions, item 6).
//
// Two ways in, one table (supabase/migrations/0013_feedback.sql):
//   • "Send feedback" in Settings → Help & Support: a kind (idea, problem or praise) and a message;
//   • a one-question check-in, once, on or after day 7 from signup: free text, skippable.
// Signed out (or in the demo, which is signed out) nothing is written: submitFeedback returns before
// it touches the client, and the table's only policy lets a signed-in person insert their own rows.
// -----------------------------------------------------------------------------

export const FEEDBACK_KINDS = [
  { value: "idea", label: "Idea" },
  { value: "problem", label: "Problem" },
  { value: "praise", label: "Praise" },
];
export const WEEK_ONE_KIND = "week_one";
export const WEEK_ONE_QUESTION = "What did Flourish help you understand about your money this week?";
export const MAX_MESSAGE = 2000;
export const WEEK_ONE_DAYS = 7;

const KINDS = new Set([...FEEDBACK_KINDS.map((k) => k.value), WEEK_ONE_KIND]);
const PLATFORMS = new Set(["ios", "android", "web"]);

// The row exactly as the table takes it, or null if it cannot be one.
export function feedbackRow({ userId, kind, message, appVersion = null, platform = null } = {}) {
  const text = String(message ?? "").trim();
  if (!userId || !KINDS.has(kind) || !text || text.length > MAX_MESSAGE) return null;
  return {
    user_id: userId,
    kind,
    message: text,
    app_version: appVersion ? String(appVersion).slice(0, 40) : null,
    platform: PLATFORMS.has(platform) ? platform : null,
  };
}

// { ok } or { ok:false, reason }. Writes nothing unless someone is signed in.
export async function submitFeedback({ client, userId, kind, message, appVersion, platform } = {}) {
  if (!userId) return { ok: false, reason: "signed_out" };
  const row = feedbackRow({ userId, kind, message, appVersion, platform });
  if (!row) return { ok: false, reason: "invalid" };
  if (!client || typeof client.from !== "function") return { ok: false, reason: "no_client" };
  try {
    const { error } = await client.from("feedback").insert(row);
    return error ? { ok: false, reason: "error" } : { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// The day-7 question: shown once, on the first visit on or after day 7 from signup, to a signed-in
// household that has neither answered nor skipped it. Never in the demo.
export function weekOneDue({ signedUpAt, now = new Date(), done = false, demo = false, signedIn = false } = {}) {
  if (demo || done || !signedIn || !signedUpAt) return false;
  const start = new Date(signedUpAt).getTime();
  if (!Number.isFinite(start)) return false;
  return new Date(now).getTime() - start >= WEEK_ONE_DAYS * 24 * 60 * 60 * 1000;
}
