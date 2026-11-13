// scripts/trial-first-meta.mjs
// -----------------------------------------------------------------------------
// index.html'S META DESCRIPTION FOLLOWS TRIAL_PLAN_FIRST, AT BUILD TIME (2026-11-13).
//
// index.html is a static file: search engines and link previews read it with no script run, so it cannot ask the
// server whether the switch is on, as the landing does. But the switch itself only takes effect with a deploy (Netlify
// gives a function the variables of its own deploy), and that deploy builds this file. So the build reads the same two
// variables by the same rule as the server (netlify/functions/_lib/planRules.js trialPlanFirstSince) and, while the
// switch is on, ends the two descriptions with the approved sentence (Amanda, 2026-11-11) in place of
// "Every feature free for 14 days." Off, or either variable wrong: the file is returned exactly as it is.
//
// The variables must be visible to builds (Netlify's default scope is all scopes). docs/ops/TRIAL-FIRST-GO-LIVE.md
// checks the published page's source after the switch's deploy.
// -----------------------------------------------------------------------------
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { trialPlanFirstSince } = require("../netlify/functions/_lib/planRules.js");

export const META_OFF = "Every feature free for 14 days.";
export const META_ON = "Eligible new subscribers get 14 days free, then the plan renews at the listed price unless cancelled.";

const TAG = /(<meta (?:name="description"|property="og:description") content="[^"]*?)Every feature free for 14 days\.(" \/>)/g;

/** index.html as it ships: unchanged while the switch is off; the approved sentence in both descriptions while on. */
export function trialFirstMeta(html, env = process.env) {
  if (typeof html !== "string" || trialPlanFirstSince(env) === null) return html;
  return html.replace(TAG, (_, before, after) => `${before}${META_ON}${after}`);
}

/** The Vite plugin (vite.config.js). */
export function trialFirstMetaPlugin(env = process.env) {
  return { name: "trial-first-meta", transformIndexHtml: (html) => trialFirstMeta(html, env) };
}
