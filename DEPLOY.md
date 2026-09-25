# Deploy & merge gates — Flourish Money

## 🔒 MATH-LOCK gate (required before any merge to `main`)

Financial math correctness is enforced by tests, not vibes. **`npm run test:math` must pass before any merge to `main`.** Three audit rounds each found math bugs by hand; this gate replaces whack-a-mole with systematic coverage.

```sh
npm run test:math
```

Runs 72 suites. **`npm ci` first** — the gate is no longer dependency-free: suites now reach code that
imports `@capacitor/*` (for example `forecastNaN` → `notificationPlanner` → `notifications`), and without
`node_modules` the run dies with `ERR_MODULE_NOT_FOUND` in about eleven seconds — a failure that looks
nothing like a failing test. `.github/workflows/math-lock.yml` installs first for exactly this reason.

The three suites below are the original core; the rest are listed in `package.json`'s `test:math`:

| Suite | File | Covers |
|---|---|---|
| Unit | `tests/math.test.cjs` | Every pure lib fn + branch: currency precision (exact multi-year amortization), cadence (weekly→annual + rollovers + paid-N-days-ago), DST transitions, month boundaries (Feb 28/29, 30/31, year-end), empty/zero/negative/NaN, classifiers, engines, and the amount-parsing contract. Dates and catOverrides are **frozen** (passed explicitly); assertions are **exact**. **Known gap (flagged in the suite):** amounts are parsed with `parseFloat` (machine-decimal only; en-CA/en-US share `.`-decimal/`,`-thousands). Comma-*grouped* input would truncate (`"1,234.56" → 1`); inputs reach the lib as machine-decimal (Plaid numbers + sanitized UI), so this is a documented contract, not an active bug — sanitize at the input boundary if that ever changes. |
| Integration | `tests/pipeline.test.cjs` | Full pipeline `Plaid → normaliseTxns → markTransfers → sync-merge → detectRecurringBills → SafeSpend/Forecast` on frozen fixtures: pending→posted, deleted, modified, multi-bank merge, transfers, recurring across cadences. |
| Invariants | `tests/math-invariants.test.cjs` | Property tests over a **seeded** PRNG (deterministic): Σ bill monthly = total; safe + committed = balance; debt-payoff interest > 0 when it amortizes; biweekly next-due on the 14-day phase; `toMonthly` linearity; netWorth = assets − liabilities; markTransfers conserves count + no mutation; merge idempotency; removeByIds correctness; ratios finite + non-negative. |

**The bar: no math change ships that breaks an existing invariant.** If you change anything in `src/lib/`, run `npm run test:math` and keep it green. When you add a calculation, add its test in the same change.

### CI

`.github/workflows/math-lock.yml` runs `npm run test:math` on every push and PR to `main`. Configure branch protection on `main` to require the **MATH-LOCK** check (GitHub → Settings → Branches → Branch protection rules → Require status checks → `math`).

### Optional local pre-commit hook

To catch failures before they leave your machine:

```sh
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/sh
npm run test:math || { echo "✗ MATH-LOCK failed — commit blocked. Fix the math or its test."; exit 1; }
HOOK
chmod +x .git/hooks/pre-commit
```

(Git hooks aren't version-controlled, so each clone opts in once. The GitHub Action is the authoritative gate.)

## Other gates (manual, pre-store-build)

- **Frontend build**: `npm run build` must be clean (zero errors) before shipping `src/App.jsx` changes.
- **Serverless functions**: `node --check netlify/functions/<fn>.js` after edits.
- **Plaid Link + PDF import**: smoke-test on the deploy preview (the hardened CSP dropped `'unsafe-eval'`; pdf.js is self-hosted) before an App Store build.
- **AI Coach**: `ANTHROPIC_API_KEY=… npm run test:coach` exercises the coach prompt/safety suite (uses real API credits).
