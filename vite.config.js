import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
