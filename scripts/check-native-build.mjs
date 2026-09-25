#!/usr/bin/env node
// scripts/check-native-build.mjs
// -----------------------------------------------------------------------------
// A STORE BUILD MUST NOT SHIP WITHOUT ITS CONFIGURATION.
//
// The web app gets VITE_* variables from Netlify at deploy time. A native build gets them from
// whatever shell happens to run `vite build` — and when they are absent, Vite does not complain.
// It replaces every `import.meta.env.VITE_SUPABASE_URL` with `undefined`, the build succeeds, the
// bundle is the right size, and `cap sync` copies it happily into the app. The first thing anyone
// sees is a white screen, because createClient(undefined, undefined) throws while the module graph
// is still being evaluated, before React has mounted anything that could report it.
//
// That is what shipped as iOS 1.0.0 (526891) and Android 1.0.0 (2) on 2026-09-25.
//
// Two checks, because they fail in different ways:
//   --env       before the build: the variables Vite WILL see. Catches the empty shell early.
//   --artifact  after the build: the variables actually IN dist/. Catches a variable that was set
//               but not picked up — a typo'd name, the wrong mode, an .env outside envDir.
//
// Values are never printed. Only SET or MISSING, and only the names.
// -----------------------------------------------------------------------------
import { loadEnv } from "vite";
import fs from "node:fs";
import path from "node:path";

// Without these the app cannot start at all. VITE_SENTRY_DSN is deliberately NOT here: error
// reporting no-ops without it, which is a degraded build rather than a broken one.
const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

const mode = process.argv.includes("--artifact") ? "artifact" : "env";
const root = process.cwd();
const env = loadEnv(process.env.NODE_ENV || "production", root, "");
const die = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

const missing = REQUIRED.filter((k) => !String(env[k] || "").trim());
for (const k of REQUIRED) console.log(`  ${missing.includes(k) ? "MISSING" : "SET    "}  ${k}`);

if (missing.length) {
  die(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set, so this build would ` +
      `render a white screen on a phone.\n    Set them in the shell or in an .env file Vite reads ` +
      `from this directory, then build again.\n    Never commit the values.`);
}

if (mode === "artifact") {
  const dir = path.join(root, "dist", "assets");
  if (!fs.existsSync(dir)) die("dist/assets does not exist — run the build before this check.");
  const js = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f));
  if (!js.length) die("dist/assets contains no JavaScript — the build produced nothing to check.");
  const blob = js.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  // The literal each variable's value should have been baked into. Compared, never printed.
  const absent = REQUIRED.filter((k) => !blob.includes(String(env[k]).trim()));
  for (const k of REQUIRED) console.log(`  ${absent.includes(k) ? "NOT IN BUNDLE" : "in bundle    "}  ${k}`);
  if (absent.length) {
    die(`${absent.join(", ")} ${absent.length === 1 ? "is" : "are"} set but did not reach the ` +
        `bundle.\n    Vite reads .env from its own root, and only names beginning with VITE_ are ` +
        `exposed to client code.\n    Check the spelling of the name and where the .env file sits.`);
  }
}

console.log(`  ✓ native build check passed (${mode})\n`);
