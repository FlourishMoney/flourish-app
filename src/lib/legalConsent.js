// src/lib/legalConsent.js
// -----------------------------------------------------------------------------
// THE CONSENT STEP'S RECORD (1.1.7, 2026-11-12). Tapping Get started on the consent step that opens onboarding is recorded
// against the account (netlify/functions/beta.js record_consent, migration 0049 legal_consents): the consent id (the server
// keeps the words for it), the date of the Terms and of the Privacy Policy as those pages show them at that moment, when
// the step was shown (shown_at) and when Get started was tapped (agreed_at, kept as recorded_at). Onboarding never waits
// on it: the record is kept on the device first and sent in the background, and a send that fails is tried again on the
// next launch, with the same times and the same dates.
// shown_at is when the step first appeared in this run of the app (opening the Terms or the Privacy Policy from it and
// coming back keeps it); after the app is closed, the step's next appearance is the time.
// -----------------------------------------------------------------------------
import { askTrialPlanFirst } from "./trialPlanFirst.js";
import { PRIVACY_117_DATE, privacyDate } from "./privacy117Words.js";

export const CONSENT_ID = "onboarding-2026-11-12";
// The pages' own dates when nothing newer applies: the Terms' "Last updated October 14, 2026" and the Privacy Policy's
// 1.1.7 date (lib/privacy117Words.js; tests/legalConsent.test.cjs holds these equal to the pages).
export const TERMS_BASE_DATE = "2026-10-14";
export const PRIVACY_BASE_DATE = PRIVACY_117_DATE;

const key = (uid) => `flourish_consent_pending:${uid}`;
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The later of a page's own date and giftDate: the gift words' date (lib/giftReturn.js GIFT_LEGAL_DATE) on the website, null in a store app (its pages carry no gift words). */
export function withGiftDate(day, giftDate) {
  return isDate(giftDate) && giftDate > day ? giftDate : day;
}
/** The Terms' date as the page shows it: the trial-plan-first switch's date where the page uses it (lib/freePlan.js section 7), else the base date; then the gift date if that is later. */
export function termsVersion(tpfSince, datedBySwitch, giftDate = null) {
  const t = Date.parse(tpfSince || "");
  return withGiftDate(datedBySwitch && Number.isFinite(t) ? localDate(new Date(t)) : TERMS_BASE_DATE, giftDate);
}
/** The Privacy Policy's date as the page shows it: the later of the newsletter launch's date and the 1.1.7 date; then the gift date if that is later. */
export function privacyVersion(policyDate, giftDate = null) { return withGiftDate(privacyDate(policyDate), giftDate); }

/** Both, asked of the same places the pages ask. Never throws; an unanswered question gives the page's own fallback. */
// freeTermsDate (free v1 on the website, 2026-11-23, lib/freeWords.js FREE_TERMS_DATE): the website's Terms' new date once
// set; the Terms only, the Privacy Policy does not change with it. null (the default, and every store app): as before.
export async function currentLegalVersions({ fetchImpl = globalThis.fetch, apiBase = "", termsDatedBySwitch = false, giftDate = null, freeTermsDate = null } = {}) {
  let policyDate = null, tpf = null;
  await Promise.all([
    Promise.resolve().then(() => fetchImpl(`${apiBase}/api/newsletter`)).then((r) => (r && r.ok ? r.json() : null)).then((j) => { policyDate = j && j.policyDate; }).catch(() => {}),
    askTrialPlanFirst(fetchImpl, apiBase).then((a) => { tpf = a; }).catch(() => {}),
  ]);
  return { terms_version: withGiftDate(termsVersion(tpf && tpf.since, termsDatedBySwitch, giftDate), freeTermsDate), privacy_version: privacyVersion(policyDate, giftDate) };
}

// When the consent step first appeared, per account, for this run of the app only (never stored).
const shownAt = new Map();
/** The consent step is on screen: keep the first time for this account. Returns it. */
export function markConsentShown(uid, now = Date.now()) {
  if (!uid) return null;
  if (!shownAt.has(uid)) shownAt.set(uid, new Date(now).toISOString());
  return shownAt.get(uid);
}

const read = (storage, uid) => { try { const v = JSON.parse(storage.getItem(key(uid)) || "null"); return v && v.consent_id ? v : null; } catch { return null; } };
const write = (storage, uid, v) => { try { storage.setItem(key(uid), JSON.stringify(v)); } catch { /* sent now, or not kept */ } };
const clear = (storage, uid) => { try { storage.removeItem(key(uid)); } catch { /* fine */ } };

/**
 * Send the kept record, if there is one. Resolves "recorded" (or there was nothing to send), "kept" (to try again on the next
 * launch), or "dropped" (the server refused it as malformed, so sending again would not help). Never throws.
 */
export async function flushLegalConsent({ uid, storage, getJwt, fetchImpl = globalThis.fetch, apiBase = "", termsDatedBySwitch = false, giftDate = null, freeTermsDate = null }) {
  if (!uid || !storage) return "kept";
  const rec = read(storage, uid);
  if (!rec) return "recorded";
  try {
    if (!isDate(rec.terms_version) || !isDate(rec.privacy_version)) {
      Object.assign(rec, await currentLegalVersions({ fetchImpl, apiBase, termsDatedBySwitch, giftDate, freeTermsDate }));
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
  if (!read(storage, uid)) {
    const agreed = new Date(now).toISOString();
    const shown = shownAt.get(uid);
    write(storage, uid, { consent_id: CONSENT_ID, shown_at: shown && shown <= agreed ? shown : agreed, agreed_at: agreed });
    shownAt.delete(uid);
  }
  return flushLegalConsent(opts);
}
