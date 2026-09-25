# Flourish — Project Context for Claude Code

## Hard rules (never break)
1. **Never push to `main`, never merge, never deploy, never change Netlify settings.** Work on a branch and open a PR. Amanda merges and deploys.
2. **Production keys never go on this Mac. Staging or test keys only.** Never copy the production `ANTHROPIC_API_KEY` into any local file. The server variable is `ANTHROPIC_API_KEY` — never `VITE_`-prefixed, because Vite inlines anything `VITE_*` into the browser bundle. No key goes into client code, build output, logs or commits. Never print the values in `.env` or `.env.local`; report only that a line is present.
3. **Synthetic test data only** for anything financial. Never Amanda's real financial data, and never a real user's.
4. **Migrations:** add a new file in `supabase/migrations/`. It goes to staging first; Amanda applies it to production by hand in the Supabase SQL editor. Any new table in the `public` schema needs explicit `GRANT`s in the same migration file. Never run `supabase login` or `supabase link` against production.
5. **No AI-generated financial figures.** Every number a user sees is computed in JavaScript. The model may only write prose about numbers it was handed.
6. **Do not remove the US architecture. Do not build Kids any further. Do not weaken or delete tests. No broad search-and-replace** — make targeted edits.
7. **Never write `cd <dir> && rm -rf *`.** If the `cd` fails the `rm` destroys whatever directory the shell is actually in. For scratch work use `DIR=$(mktemp -d)` and leave it for the system to clear.
8. **Before saying "the app does not do X", search `src/App.jsx` as well as `src/lib/`.** App.jsx holds most of the product; absence from `src/lib/` proves nothing.
9. **The test gate must pass before any PR:**
   ```sh
   npm run test:math
   ```
   `.github/workflows/math-lock.yml` runs `npm ci` and then this command on every push and PR to `main`. On `main` today it is 72 suites and 2,905 assertions, all passing. `npm ci` is required first — some suites now import modules that pull in `@capacitor/*`, so a bare checkout fails to resolve them.
10. **Review: one review round per change.** Only HIGH findings block a merge. MEDIUM and LOW go to `docs/product/KNOWN-DEFECTS.md`.

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
- Default branch: `main`
- Netlify deploys automatically when `main` moves — which is exactly why nothing here is ever pushed to `main` directly.

## File structure
- `src/App.jsx` — single-file monolith (~15,000 lines)
- `src/main.jsx` — entry point
- `src/lib/financialCalculations.js` — pure scenario math (Phase 1)
- `src/lib/usageLimits.js` — plan tiers + usage counters
- `netlify/functions/coach.js` — AI proxy
- `netlify/functions/plaid.js` — Plaid proxy
- `netlify/functions/plaid-webhook.js` — Plaid webhooks
- `netlify/functions/beta.js` — beta code validation + gated signup

## Working environment
- OS: macOS (Apple Silicon)
- Shell: zsh
- Local path: `~/Projects/flourish-app`

## Branch workflow — three SEPARATE commands, never chained with &&
```
git checkout -b <branch>        # never work on main
git add <specific files>
git commit -m "message"
git push -u origin <branch>
```
Always specify exact files in `git add`. Never `git add .`. Then give Amanda the PR link. Never push to `main`, never merge, never deploy.

## Native builds (Capacitor) — iOS and Android
See `docs/ops/NATIVE-BUILDS.md` for ids, versions, the Android JDK 21 requirement, and
the store accounts. Short version: **both store accounts already exist and are paid**
(Apple Team ID `V8B8MR88SL`; the Play account is the one that ships GrowSmart), so no
plan needs to budget for them again. Android is `com.flourishmoney.app`, iOS is
`app.flourishmoney`; they differ deliberately.

## iOS build (Capacitor)
Capacitor 8.4.2 wraps the web app as a native iOS app — appId `app.flourishmoney`, SPM-based (open `ios/App/App.xcodeproj`; there is **no** `.xcworkspace`). The app bundles `dist/` (no `server.url` in `capacitor.config.json`). After any web change, rebuild + sync + run:
```
npm run build       # build the web app into dist/
npx cap sync ios    # copy dist/ into the native project + refresh plugins
npx cap run ios     # build & run on a simulator/device
                    # (or: npx cap open ios → then Build & Run ▶ in Xcode)
```
Android is the same flow with `npx cap sync android`, but needs JDK 21 and
`ANDROID_HOME` exported — see `docs/ops/NATIVE-BUILDS.md`.
Native-only behaviour is gated by `isCapacitorIOS()`: the app boots into login/signup (skips the "coming soon" waitlist landing), and an iOS-only "Try demo" button gives App Store reviewers access without a beta code.

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

### Engines (now in `src/lib/`, not App.jsx — search by name, never by line number)
- **FinancialCalcEngine** — `src/lib/financialCalculations.js` — `netWorth`, `cashFlow`, `savingsRate`, `debtRatio`, `emergencyFundMonths`, `avgDailySpend`
- **SafeSpendEngine** — `src/lib/safeSpendEngine.js` — `calculate(data)` returns `{balance, upcomingBills, debtPayments, safetyBuf, savingsAlloc, safeAmount, riskLevel, overdraft, soonBills}`
- **ForecastEngine** — `src/lib/forecastEngine.js` — `generate(data, days=90)` for daily cash-flow projection
- **calcHealthScore(data)** — `src/lib/decisionEngine.js` — financial health 0–100

App.jsx imports these. Do not re-implement an engine inside App.jsx.

### AI Coach (Netlify Function)
- File: `netlify/functions/coach.js`
- Model: `claude-sonnet-4-6`
- API version header: `2023-06-01`
- Live `type` values: `chat`, `simulator`, `checkin`, `document`, `facilitator` — the single source of truth is `LIVE_COACH_TYPES` in `netlify/functions/_lib/coachTypes.js`, and coach.js returns 400 for anything else. `plan`, `insights`, `buckets` and `tax` were removed: they asked the model to produce figures.
- Sent from the frontend: `chat`, `simulator`, `checkin`, `facilitator`
- All branches have TRUST_RULES appended to the system prompt

### Trust layer (Phase 1)
- All financial numbers come from JS, not Claude
- Coach receives pre-computed values via `buildContext` (search by name in App.jsx)
- Simulator receives a frozen summary via `summarizeScenarioForCoach`
- Claude only writes prose explanations — never inventions

### Paywall (Phase 2)
- Plan tiers: `"free"` | `"trial"` | `"premium"` | `"beta_founder"`
- Free-tier limits live in `FREE_TIER_LIMITS` (`src/lib/usageLimits.js`): 2 Coach messages per **week** (resets Monday 00:00 UTC) and 1 simulation per day. New signups get a 14-day trial (`TRIAL_DURATION_DAYS`).
- **localStorage grandfathering is DISABLED.** `applyGrandfatherIfEligible()` is a deliberate no-op: the old rule upgraded anyone holding `flourish_coach_history` to permanent `beta_founder`, and since the Coach writes that key on first use it was a 100% paywall bypass. `applyBetaCodeFounderUpgrade()` was deleted for the same reason. Entitlement is whatever the server profile says.
- localStorage keys: `flourish_plan`, `flourish_coach_usage`, `flourish_sim_usage`, `flourish_account_existed_pre_paywall` — all caches, never authority.
- STRIPE_INTEGRATION_POINT comments mark seams for server-side enforcement later

### Auth
- Supabase is auth **and** database. Client-side `supabase.from(` reads are allowed in App.jsx but are **UI-only and never authoritative** — RLS plus the `profiles_guard_privileged()` trigger block client writes to `plan`, `founder_flag`, `trial_started_at` and the AI-consent columns. Anything authoritative (entitlements, consent) is written by a service-role Netlify function.
- AI consent is server-authoritative: `profiles.ai_third_party_consent_at` / `ai_third_party_consent_revoked_at` (migration `0005`), written only via `postCoachConsent()` → `netlify/functions/coach.js`. There is no `ai_disclosure_accepted_at` column — `ai_third_party_consent_at` *is* that timestamp.
- Migrations in `supabase/migrations/` are applied BY HAND in the Supabase SQL editor (no CLI, no db push). The dir is a partial record — `user_data`, `plaid_items`, `coach_usage` have no create-table migration.
- Signup is gated by a beta code validated **server-side only** (`netlify/functions/beta.js`, actions `validate` and `signup`). The code list is the `BETA_CODES` environment variable; no code list exists in client code. `beta.js` also reserves the seat atomically, which closes the user-cap race.
- Login is not gated

## Key learnings
- TDZ crashes are silent until runtime — only `npm run build` catches them
- localStorage drift can cause subtle bugs (key name mismatches, lifetime vs daily counters)
- The simulator and Coach are the differentiators; everything else is supporting
- Don't trust line numbers across sessions — App.jsx shifts; match by content

## Roadmap status
Single source of truth: `docs/ops/OPERATING-PLAN.md`. Do not track phase status here.

## Known defects
Carried, reproduced defects live in `docs/product/KNOWN-DEFECTS.md`. This file holds no backlog.
