// src/lib/notifications.js
// -----------------------------------------------------------------------------
// Flourish — local-notification plumbing (Stage 1: permission + scheduling API only).
//
// Stage two calls ONLY the wrappers in this file, never @capacitor/local-notifications
// directly. Nothing here schedules a notification on its own, and — critically — the
// permission prompt is fired ONLY from requestNotificationPermission(), which callers must
// invoke from an explicit user action. It is never called on launch/first-run.
//
// iOS allows exactly ONE permission prompt per install: a cold, automatic ask gets denied and
// can never be re-asked in-app. So requestNotificationPermission() checks state first and only
// reaches the system prompt when the state is still "prompt".
// -----------------------------------------------------------------------------

import { LocalNotifications } from "@capacitor/local-notifications";

// Native only. On web/desktop every function below is a safe no-op (the plugin has a web shim,
// but the notification permission model is iOS/Android-specific).
function isNative() {
  try { return typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true; }
  catch { return false; }
}

// The four notification categories (mirror profile.notifications toggles). Stage two decides what
// to schedule per type; this list also drives cancelAllOfType tagging.
export const NOTIF_TYPES = ["billDue", "lowBalance", "unusualAmount", "meetingReminder"];

// ── Permission ───────────────────────────────────────────────────────────────
// READ-ONLY current state — safe to call ANYWHERE (never prompts). Use this to render UI.
// Returns { status, granted } where status ∈ "granted"|"denied"|"prompt"|"unsupported"|"error".
export async function getNotificationPermission() {
  if (!isNative()) return { status: "unsupported", granted: false };
  try {
    const cur = await LocalNotifications.checkPermissions();
    return { status: cur.display, granted: cur.display === "granted" };
  } catch (e) {
    return { status: "error", granted: false, error: e?.message || String(e) };
  }
}

// EXPLICIT-ACTION ONLY — call this from a button tap, never automatically. Returns:
//   { status, granted, mustUseSettings, prompted }
//   granted        → already/now allowed; caller may schedule.
//   mustUseSettings → denied; the system won't prompt again, so UI should deep-link to iOS Settings.
//   prompted       → the one-time system prompt was actually shown this call (caller should persist
//                    profile.notifications.permissionAsked = true).
export async function requestNotificationPermission() {
  if (!isNative()) return { status: "unsupported", granted: false, mustUseSettings: false, prompted: false };
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === "granted") return { status: "granted", granted: true, mustUseSettings: false, prompted: false };
    if (cur.display === "denied")  return { status: "denied",  granted: false, mustUseSettings: true,  prompted: false };
    // "prompt" / "prompt-with-rationale" → this is the single allowed system ask.
    const res = await LocalNotifications.requestPermissions();
    const granted = res.display === "granted";
    return { status: res.display, granted, mustUseSettings: res.display === "denied", prompted: true };
  } catch (e) {
    return { status: "error", granted: false, mustUseSettings: false, prompted: false, error: e?.message || String(e) };
  }
}

// ── Stable id scheme ──────────────────────────────────────────────────────────
// Capacitor requires a NUMERIC notification id. We derive a STABLE one from a string key
// ("<type>:<entityId>:<slot>") via FNV-1a, so the same logical notification always maps to the same
// id. Rescheduling with that id OVERWRITES the pending one — e.g. editing a bill's amount reschedules
// in place instead of duplicating. `slot` disambiguates multiple notifications for one entity
// (e.g. a 3-days-before vs day-of reminder for the same bill).
export function notifId(type, entityId = "", slot = 0) {
  const key = `${type}:${entityId}:${slot}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 2000000000) + 1; // 1 .. 2e9 — positive, within Capacitor's 32-bit range
}

// ── Scheduling wrappers (stage two calls THESE) ───────────────────────────────
// `id` should come from notifId(...). `type` (one of NOTIF_TYPES) is stored in `extra` so
// cancelAllOfType can find every notification of a category.
export async function scheduleNotification({ id, type, title, body, at, sound = null }) {
  if (!isNative() || !(at instanceof Date) || isNaN(at.getTime())) return false;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: title || "Flourish",
        body: body || "",
        schedule: { at },
        sound: sound || undefined,
        extra: type ? { type } : undefined,
      }],
    });
    return true;
  } catch { return false; }
}

export async function cancelNotification(id) {
  if (!isNative() || id == null) return;
  try { await LocalNotifications.cancel({ notifications: [{ id }] }); } catch {}
}

// Every pending notification (across all types). Also used by cancelAllOfType.
export async function listScheduled() {
  if (!isNative()) return [];
  try { const r = await LocalNotifications.getPending(); return r?.notifications || []; } catch { return []; }
}

// Cancel every pending notification tagged with this type (via extra.type set in scheduleNotification).
export async function cancelAllOfType(type) {
  if (!isNative() || !type) return;
  try {
    const pending = await listScheduled();
    const toCancel = pending.filter(n => n.extra && n.extra.type === type).map(n => ({ id: n.id }));
    if (toCancel.length) await LocalNotifications.cancel({ notifications: toCancel });
  } catch {}
}
