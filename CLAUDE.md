# Flourish — Project Context for Claude Code

## What this app is
Flourish Money — AI-powered personal finance app for Canadian and US users. Live beta at flourishmoney.app, currently capped at 30 users. Operated by GrowSmart Inc. (kept legally and financially separate).

## Tech stack
- React 18 + Vite 5 (single-page app)
- Supabase — auth + database
- Plaid — banking data (production-approved CA + US)
- Anthropic Claude API — AI coach via Netlify Function
- Netlify — hosting + serverless functions
- lucide-react — icons

## Repo
- GitHub: `FlourishMoney/flourish-app`
- Local branch: `master`
- Remote branch: `main`
- Deploy: auto on push to `main`

## File structure
- `src/App.jsx` — single-file monolith (~12,000 lines)
- `src/main.jsx` — entry point
- `src/lib/financialCalculations.js` — pure scenario math (Phase 1)
- `src/lib/usageLimits.js` — plan tiers + daily counters (Phase 2)
- `netlify/functions/coach.js` — AI proxy
- `netlify/functions/plaid.js` — Plaid proxy
- `netlify/functions/plaid-webhook.js` — Plaid webhooks

## Working environment
- OS: Windows
- Shell: bash (PowerShell blocked by execution policy)
- Local path: `C:\Users\simpl\OneDrive\Documents\Flourish\App\flourish-netlify-v5`

## Deploy workflow — three SEPARATE commands, never chained with &&
git add <specific files>
git commit -m "message"
git push origin master:main
Always specify exact files in `git add`. Never `git add .`.

## Delivery constraints (NON-NEGOTIABLE)
- Code must be delivered as individually copyable, clearly labeled blocks — never full file dumps. The user works with one functional hand; this is an accessibility requirement, not a stylistic preference.
- Never auto-commit or auto-push. The user authorizes deploys explicitly.
- Never run `git config` changes without explicit authorization.
- When you encounter unexpected git state, STOP and report — do not "fix" autonomously.

## Pre-delivery checklist
1. Read every function touched; check braces/parens/JSX tags
2. `npm run build` — must show zero errors
3. Verify React hooks are above any early/conditional returns (TDZ prevention)
4. Bundle hash should change if code is added; identical hash means tree-shaken or no real change
5. Only present files after build passes

## Key architectural facts

### Engines (in src/App.jsx, do not duplicate in lib/)
- **FinancialCalcEngine** (line ~2386) — `netWorth`, `cashFlow`, `savingsRate`, `debtRatio`, `emergencyFundMonths`, `avgDailySpend`
- **SafeSpendEngine** (line ~2506) — `calculate(data)` returns `{balance, upcomingBills, debtPayments, safetyBuf, savingsAlloc, safeAmount, riskLevel, overdraft, soonBills}`
- **ForecastEngine** (line ~2580) — `generate(data, days=90)` for daily cash-flow projection
- **calcHealthScore(data)** (line ~2902) — financial health 0–100

### AI Coach (Netlify Function)
- File: `netlify/functions/coach.js`
- Model: `claude-sonnet-4-6`
- API version header: `2023-06-01`
- Accepted `type` values: `chat`, `plan`, `simulator`, `checkin`, `insights`, `buckets`, `tax`, `document`
- Currently used from frontend: `chat`, `simulator`, `checkin` only
- All branches have TRUST_RULES appended to system prompt

### Trust layer (Phase 1)
- All financial numbers come from JS, not Claude
- Coach receives pre-computed values via buildContext (line ~9810)
- Simulator receives frozen summary via summarizeScenarioForCoach
- Claude only writes prose explanations — never inventions

### Paywall (Phase 2)
- Plan tiers: `"free"` | `"premium"` | `"beta_founder"`
- Daily limits: 5 Coach msgs, 3 simulations on free tier
- Grandfather: anyone with `flourish_coach_msgs` or `flourish_coach_history` in localStorage gets `beta_founder` permanently
- localStorage keys: `flourish_plan`, `flourish_coach_usage`, `flourish_sim_usage`, `flourish_account_existed_pre_paywall`
- STRIPE_INTEGRATION_POINT comments mark seams for server-side enforcement later

### Auth
- Supabase auth only (no `supabase.from(` calls in App.jsx)
- Signup gated by BETA_CODES list (line ~11042 in AuthScreen)
- Login is not gated

## Key learnings
- TDZ crashes are silent until runtime — only `npm run build` catches them
- localStorage drift can cause subtle bugs (key name mismatches, lifetime vs daily counters)
- The simulator and Coach are the differentiators; everything else is supporting
- Don't trust line numbers across sessions — App.jsx shifts; match by content

## Roadmap status (as of latest commit)
- ✅ Phase 1A — Coach trust layer
- ✅ Phase 1B — Simulator trust layer
- ✅ Phase 2 — Paywall structure + grandfathering
- ✅ Phase 1C-A — Coach affordability awareness
- ✅ FLOURISH_UPDATE wiring + regex fix
- ⏭️ Phase 1C-B — JS-side intent detection (next)
- ⏳ Phase 3 — Onboarding + dashboard hierarchy + Time Machine/Simulator unification

## Backlog
- Investigate savings-delay rendering quirk in simulator
- Wire promo codes to `applyBetaCodeFounderUpgrade()` instead of premium
- AICoach `FREE_LIMIT = 5` should pull from `FREE_TIER_LIMITS.coachMessagesPerDay`
- WhatIfSimulator presets 4 & 5 (debt + investment) — wire to `simulateDebtPayoffBoost` / `simulateInvestmentGrowth`
- Consolidate `PROMO_CODES` and `BETA_CODES` into single source
- Clean up two pre-existing deleted zips in working tree
- Update or delete stale Vercel-era DEPLOY.md
- Plaid product expansion research (RBC Direct Investing etc.)
