// tests/freeV1Words.test.cjs
// -----------------------------------------------------------------------------
// FREE V1 ON THE WEBSITE: THE WORD SLOTS, AND THE LOCK THAT KEEPS THEM FROM SHIPPING (2026-11-23).
//
// Every new or changed line for the free plan on the website is a slot in src/lib/freeWords.js (the server's in
// netlify/functions/_lib/freeWords.js), listed in docs/product/FREE-V1-WORDS.md. Each is a placeholder until the
// founder's approved words are pasted in.
//   1  the slots and the words doc list the same ids, and say the same line
//   2  each slot is used where the doc says it shows (and the store apps keep their own text)
//   3  the Terms' new date reaches the page and the consent record
//   4  a filled slot is within its length limit, with no em or en dash
//   5  THE LOCK: this FAILS while any slot is a placeholder or the Terms' date is unset. It is meant to: the gate, and
//      the pull request's `math` check, stay red until every word is in. The production build refuses them too.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const APP = read("src", "App.jsx");
const PLAID = read("netlify", "functions", "plaid.js");
const DOC = read("docs", "product", "FREE-V1-WORDS.md");
const PLACEHOLDER = /\[WORDS:\s*free-/;

(async () => {
  const t = create();
  const W = await import("../src/lib/freeWords.js");
  const S = require("../netlify/functions/_lib/freeWords.js");
  const ALL = { ...W.FREE_WORDS, ...S.FREE_SERVER_WORDS };

  // ── 1. the slots and the doc ─────────────────────────────────────────────────────────────────────
  const rows = [...DOC.matchAll(/^\| `(free-[a-z0-9-]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\d+) \|$/gm)]
    .map((m) => ({ id: m[1], where: m[2].trim(), line: m[4].trim(), limit: Number(m[5]) }));
  t.eq(rows.map((r) => r.id).sort(), Object.keys(ALL).sort(), "1a the words doc lists exactly the slots in the two words files");
  t.eq(Object.keys(ALL).length, 13, "1b (not vacuous: thirteen slots)");
  t.ok(rows.every((r) => r.line === ALL[r.id]), "1c each slot's line in the doc is its line in the code, word for word");

  // ── 2. each slot where it shows ──────────────────────────────────────────────────────────────────
  const ob = APP.slice(APP.indexOf("function Onboarding({"), APP.indexOf("function Onboarding({") + 40000);
  t.ok(/data-free-bank=""[\s\S]{0,400}freeWords\("free-bank-line"\)[\s\S]{0,300}freeWords\("free-bank-button"\)/.test(ob),
    "2a onboarding's bank step: the free-bank line and its button");
  t.ok(/setPlanBlocked\(true\)/.test(ob) && /if\(!isNativeApp\(\) && \/plan_limit\/\.test\(String\(err\?\.message\|\|""\)\)\)\{ setPlanBlocked\(true\)/.test(ob),
    "2b …shown when the website's server says plan_limit at the link token, never \"Couldn't reach your bank\"");
  t.ok(/\{!bankOutcome&&!planBlocked&&<button/.test(ob), "2c …and the Connect button that cannot work steps aside");
  t.ok(/const freeBankDialog = async \(\)=>\{[\s\S]{0,300}freeWords\("free-bank-line"\)[\s\S]{0,200}confirmLabel: freeWords\("free-bank-button"\) \}\)\) openUpgrade\(\);/.test(APP),
    "2d outside onboarding: the same line, and its button opens the plans");
  t.eq((APP.match(/if\(isFreeBankRefusal\(err\)\)\{ freeBankDialogRef\.current\(\); return; \}/g) || []).length, 3,
    "2e …from Settings' new bank, a reconnect with no bank, and a refused exchange");
  t.ok(/const isFreeBankRefusal = \(err\) => !isNativeApp\(\) && \/plan_limit\//.test(APP), "2f …on the website only (a store app keeps FREE_BANK_LINE)");
  t.eq((PLAID.match(/freeServerWords\("free-server-bank"\)/g) || []).length, 3, "2g the server's slot: the link token, the exchange and the old-bank import");
  const { UPGRADE_COPY } = await import("../src/lib/upgradeFlow.js");
  t.eq(UPGRADE_COPY.bullets[2], W.freeWords("free-plans-bullet-bank"), "2h the plans screen's third bullet");
  const { PLUS_INCLUDES } = await import("../src/lib/plusIncludes.js");
  t.eq(PLUS_INCLUDES[2], W.freeWords("free-includes-bank"), "2i the locked screens' bank line");
  t.ok(/const freePlansClose = \(!isNativeApp\(\) && !isPremium && !billingStatus\?\.paid && !billingStatus\?\.covered_by\) \? freeWords\("free-plans-close"\) : "Close";/.test(APP)
    && (APP.match(/closeLabel=\{freePlansClose\}/g) || []).length === 2 && /\{!required&&<button onClick=\{onClose\}[^>]*>\{closeLabel\}<\/button>\}/.test(APP),
    "2j the plans screen's close button, for an account without a plan (a paying one keeps \"Close\")");
  t.ok(/: billingUi\.mode==="manage"\s*\? "Change your card or cancel\."\s*: freeWords\("free-settings-plan-line"\)\}/.test(APP), "2k Settings' plan card line");
  t.ok(/\(tpfOn && !isNativeApp\(\)\) \? freeWords\("free-signup-title"\) : switchWords\("trialfirst-signup-title", tpfOn\)/.test(APP), "2l the website's sign-up heading (a store app keeps its own)");
  t.eq((APP.match(/freeWords\("free-landing-line"\)/g) || []).length, 2, "2m the landing's line, top and bottom");
  t.ok(!/trialWords\("trialfirst-landing"\)/.test(APP), "2n …and the old line is no longer shown");
  const META = await import("../scripts/trial-first-meta.mjs");
  t.eq(META.META_ON, W.freeWords("free-page-description"), "2o the page description's sentence");
  const html = read("index.html");
  const on = META.trialFirstMeta(html, { TRIAL_PLAN_FIRST: "true", TRIAL_PLAN_FIRST_SINCE: "2026-11-18T18:55:00Z" });
  t.eq((on.match(new RegExp(W.freeWords("free-page-description").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 2, "2p …in both descriptions while plans come first");
  const F = await import("../src/lib/freePlan.js");
  const web = F.trialFirstTermsSection7("2026-11-18T18:55:00Z", { web: true }).join(" ");
  t.ok(web.includes(W.freeWords("free-terms-7-new-account")) && web.includes(W.freeWords("free-terms-7-bank-end")) && !web.includes("A new account chooses a plan to keep using flourish."),
    "2q the website's Terms section 7: the new-account sentence and the bank sentence, not \"chooses a plan to keep using\"");
  t.ok(!/then moves to the free plan: 2 coach messages a week, 1 What-If a day, 1 connected bank/.test(web), "2r …and not the free plan with \"1 connected bank\"");
  const store = F.trialFirstTermsSection7("2026-11-18T18:55:00Z").join(" ");
  t.ok(store.includes("A new account chooses a plan to keep using flourish.") && !PLACEHOLDER.test(store), "2s a store app's Terms are today's, with no slot");
  t.ok(/trialFirstTermsSection7\(tpfSince, \{ web: !isNativeApp\(\) \}\)/.test(APP), "2t the Terms page asks for the website's text on the website");
  t.ok((APP.match(/setPlansOverOnboarding\(true\)/g) || []).length === 1 && /onOpenPlans=\{\(!isNativeApp\(\) && billingUi\.show\) \? \(\)=>\{ if\(user\?\.id\) notePlansOffered\(deviceStorage\(\), user\.id\); setPlansOverOnboarding\(true\); \} : null\}/.test(APP)
    && /\{plansOverOnboarding && billingUi\.show && !isNativeApp\(\) && \(/.test(APP),
    "2u the plans over onboarding open only from the bank step's button (never the founding link or a Stripe return), and count as this device's one offer");
  t.ok(/useEffect\(\(\)=>\{ if\(bankMayConnect && planBlocked\)\{ setPlanBlocked\(false\); setLinkToken\(null\); if\(step===1\) fetchLinkToken\(\); \} \},\[bankMayConnect\]\);/.test(APP)
    && /bankMayConnect=\{!!\(billingStatus\?\.paid \|\| billingStatus\?\.covered_by\)\}/.test(APP),
    "2v once the server says paid or covered, a free-plan refusal at the bank step is cleared and the link token asked again");

  // ── 3. the Terms' new date ───────────────────────────────────────────────────────────────────────
  t.ok(/const extraDay = withGiftDate\(withGiftDate\("", giftDay\), isNativeApp\(\) \? null : FREE_TERMS_DATE\) \|\| null;/.test(APP), "3a the website's Terms are dated FREE_TERMS_DATE once set");
  t.ok(/freeTermsDate: isNativeApp\(\) \? null : FREE_TERMS_DATE,/.test(APP), "3b …and the consent step records the same date");
  const L = await import("../src/lib/legalConsent.js");
  const fetchImpl = async (u) => ({ ok: true, json: async () => (/trial-plan-first/.test(u) ? { on: true, since: "2026-11-18T18:55:00Z" } : {}) });
  const v1 = await L.currentLegalVersions({ fetchImpl, termsDatedBySwitch: true, giftDate: "2026-11-20" });
  const v2 = await L.currentLegalVersions({ fetchImpl, termsDatedBySwitch: true, giftDate: "2026-11-20", freeTermsDate: "2026-12-01" });
  t.eq([v1.terms_version, v2.terms_version, v2.privacy_version === v1.privacy_version], ["2026-11-20", "2026-12-01", true], "3c the Terms' version moves to the new date; the Privacy Policy's does not");

  // ── 4. a filled slot's length and dashes ─────────────────────────────────────────────────────────
  for (const r of rows) {
    if (PLACEHOLDER.test(ALL[r.id])) continue;
    t.ok(ALL[r.id].length <= r.limit, `4a ${r.id}: within ${r.limit} characters (${ALL[r.id].length})`);
    t.ok(!/[–—]/.test(ALL[r.id]), `4b ${r.id}: no em or en dash`);
  }

  // ── 5. THE LOCK ──────────────────────────────────────────────────────────────────────────────────
  const pending = Object.keys(ALL).filter((id) => PLACEHOLDER.test(ALL[id]));
  const check = spawnSync(process.execPath, [path.join(REPO, "scripts", "check-pending-words.mjs"), "src", "netlify/functions"], { cwd: REPO, encoding: "utf8" });
  const refused = [...(check.stderr || "").matchAll(/\[WORDS: (free-[a-z0-9-]+)\]/g)].map((m) => m[1]).sort();
  t.eq(refused, pending.slice().sort(), "5a (the production build refuses exactly the slots still waiting)");
  t.eq(pending, [], `5b EVERY FREE V1 WORD IS IN. Still a placeholder: ${pending.join(", ") || "none"}. Paste the approved words into src/lib/freeWords.js, netlify/functions/_lib/freeWords.js and docs/product/FREE-V1-WORDS.md`);
  t.ok(typeof W.FREE_TERMS_DATE === "string" && /^\d{4}-\d{2}-\d{2}$/.test(W.FREE_TERMS_DATE), `5c THE TERMS' NEW DATE IS SET (FREE_TERMS_DATE in src/lib/freeWords.js is ${JSON.stringify(W.FREE_TERMS_DATE)})`);

  t.summary("freeV1Words.test");
})();
