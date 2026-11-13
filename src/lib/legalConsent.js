// src/lib/legalConsent.js
// -----------------------------------------------------------------------------
// THE CONSENT STEP'S RECORD (1.1.7, 2026-11-12). Tapping Get started on the consent step that opens onboarding is recorded
// against the account (netlify/functions/beta.js record_consent, migration 0049 legal_consents): the consent id (the server
// keeps the words for it), the date of the Terms and of the Privacy Policy as those pages show them at that moment, and
// when. Onboarding never waits on it: the record is kept on the device first and sent in the background, and a send that
// fails is tried again on the next launch, with the same time and the same dates.
// -----------------------------------------------------------------------------
import { askTrialPlanFirst } from "./trialPlanFirst.js";

export const CONSENT_ID = "onboarding-2026-11-12";
// The pages' own dates when nothing newer applies: the Terms' "Last updated October 14, 2026" and the Privacy Policy's
// "October 26, 2026" (App.jsx; tests/legalConsent.test.cjs holds these equal to the pages).
export const TERMS_BASE_DATE = "2026-10-14";
export const PRIVACY_BASE_DATE = "2026-10-26";

const key = (uid) => `flourish_consent_pending:${uid}`;
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Terms' date as the page shows it: the trial-plan-first switch's date where the page uses it (lib/freePlan.js section 7), else the base date. */
export function termsVersion(tpfSince, datedBySwitch) {
  const t = Date.parse(tpfSince || "");
  return datedBySwitch && Number.isFinite(t) ? localDate(new Date(t)) : TERMS_BASE_DATE;
}
/** The Privacy Policy's date as the page shows it: the newsletter launch's date once it exists, else the base date. */
export function privacyVersion(policyDate) { return isDate(policyDate) ? policyDate : PRIVACY_BASE_DATE; }

/** Both, asked of the same places the pages ask. Never throws; an unanswered question gives the page's own fallback. */
export async function currentLegalVersions({ fetchImpl = globalThis.fetch, apiBase = "", termsDatedBySwitch = false } = {}) {
  let policyDate = null, tpf = null;
  await Promise.all([
    Promise.resolve().then(() => fetchImpl(`${apiBase}/api/newsletter`)).then((r) => (r && r.ok ? r.json() : null)).then((j) => { policyDate = j && j.policyDate; }).catch(() => {}),
    askTrialPlanFirst(fetchImpl, apiBase).then((a) => { tpf = a; }).catch(() => {}),
  ]);
  return { terms_version: termsVersion(tpf && tpf.since, termsDatedBySwitch), privacy_version: privacyVersion(policyDate) };
}

const read = (storage, uid) => { try { const v = JSON.parse(storage.getItem(key(uid)) || "null"); return v && v.consent_id ? v : null; } catch { return null; } };
const write = (storage, uid, v) => { try { storage.setItem(key(uid), JSON.stringify(v)); } catch { /* sent now, or not kept */ } };
const clear = (storage, uid) => { try { storage.removeItem(key(uid)); } catch { /* fine */ } };

/**
 * Send the kept record, if there is one. Resolves "recorded" (or there was nothing to send), "kept" (to try again on the next
 * launch), or "dropped" (the server refused it as malformed, so sending again would not help). Never throws.
 */
export async function flushLegalConsent({ uid, storage, getJwt, fetchImpl = globalThis.fetch, apiBase = "", termsDatedBySwitch = false }) {
  if (!uid || !storage) return "kept";
  const rec = read(storage, uid);
  if (!rec) return "recorded";
  try {
    if (!isDate(rec.terms_version) || !isDate(rec.privacy_version)) {
      Object.assign(rec, await currentLegalVersions({ fetchImpl, apiBase, termsDatedBySwitch }));
      write(storage, uid, rec);
    }
    const jwt = await getJwt();
    if (!jwt) return "kept";
    const r = await fetchImpl(`${apiBase}/api/beta`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: "record_consent", ...rec }) });
    if (r && r.ok) { clear(storage, uid); return "recorded"; }
    if (r && r.status === 400) { clear(storage, uid); return "dropped"; }
    return "kept";
  } catch { return "kept"; }
}

/** Get started was tapped: keep the record on the device at once, then send it. */
export function recordLegalConsent(opts) {
  const { uid, storage, now = Date.now() } = opts || {};
  if (!uid || !storage) return Promise.resolve("kept");
  if (!read(storage, uid)) write(storage, uid, { consent_id: CONSENT_ID, shown_at: new Date(now).toISOString() });
  return flushLegalConsent(opts);
}
