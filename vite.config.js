import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// ── Build stamp ──────────────────────────────────────────────────────────────
// Bake the git commit SHA into the bundle so a deployed web build and a Capacitor iOS build can be
// compared for drift: iOS bundles this same dist/ via `cap sync`, so if the App Store build shows a
// different SHA than flourishmoney.app, they are out of sync. Precedence:
//   1. VITE_BUILD_SHA — explicit override; scripts/ship-ios.sh passes the exact SHA it is shipping.
//   2. COMMIT_REF     — Netlify sets this to the full deploy SHA for the web build.
//   3. git rev-parse  — a plain local build.
//   4. "unknown"      — no git and no env (should not happen in a real build).
function resolveBuildSha() {
  const explicit = process.env.VITE_BUILD_SHA
  if (explicit && explicit.trim()) return explicit.trim().slice(0, 7)
  const netlify = process.env.COMMIT_REF
  if (netlify && netlify.trim()) return netlify.trim().slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    return 'unknown'
  }
}

const BUILD_SHA = resolveBuildSha()

export default defineConfig({
  plugins: [react()],
  // Static replacement — bakes the literal SHA in wherever the app reads import.meta.env.VITE_BUILD_SHA.
  // Only this exact member is defined, so other import.meta.env reads (Supabase, Sentry) are untouched.
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(BUILD_SHA),
  },
  // Sprint 6b: strip console.log/info/warn/debug from PRODUCTION bundles. esbuild marks these
  // as side-effect-free (their return is always unused) and dead-code-eliminates them during
  // the build's minify step — dev (no minify) keeps all logs. console.error is intentionally
  // KEPT for genuine error reporting. No terser dependency needed.
  esbuild: {
    pure: ['console.log', 'console.info', 'console.warn', 'console.debug'],
  },
  // In dev, proxy /api/* to Vercel dev server (or local functions)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
