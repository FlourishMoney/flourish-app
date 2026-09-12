# Flourish: Implementation Brief (approved 2026-09-03, updated for direct implementation)

Direction: STRATEGY.md and COPY-CHANGES.md are the approved product direction. The current working repo is the only code source of truth. The claude.ai project copies of App.jsx, App.jsx.bak and coach.js are stale (2026-03-29); COPY-CHANGES.md quotes their copy and line numbers, so resolve every location from the current code.

## Mode
Implement directly. No preflight stop is required. Stop and ask only if you find a material conflict between the approved docs and the current code, or anything that could risk data, billing, security, or financial-calculation correctness.

## Implementation order (exact)
1. Verify What-If. Confirm cash impact, health-score delta, savings delay, verdicts, payoff dates and projections are engine outputs, not model outputs. Search for duplicate or older What-If paths. If correct, preserve it and only update approved copy/UI around it.
2. Audit and lock down every AI path. Every /api/coach call, every coach request type, every Anthropic invocation, every prompt that could create financial outputs: chat, checkin, simulator, plan, insights, buckets, tax, document, plus anything newer. No model may generate a dollar amount, percentage, rate, score, date, projection, benefit amount, tax result, payoff result, forecast result or other financial figure. Pattern: parse if needed, deterministic engine computes, coach explains. Remove dead paths; conform live ones.
3. Reconcile pricing. Find every price and trial reference. Centralize into one source of truth. Use one consistent value only if approved; otherwise do not invent, and report the values needing a decision.
4. Coach role and rules (COPY-CHANGES.md section 9), reply footer, and the visible "Calculated by Flourish" / "Your coach" distinction wherever engine output and coach prose appear together.
5. Five-tab information architecture: Today, Watch, Do, Learn, Meet. Navigation and presentation only. Preserve SafeSpendEngine, ForecastEngine, Behaviour engine, health score, Decision Engine, Autopilot, What-If, Financial Time Machine, opportunity detection, budgets, categories, debt modelling, goals, retirement tools, transaction analysis. Re-home under the new tabs with segmented controls or equivalent.
6. Canada-first copy, CA locale only. Keep US code paths, locale data, banks, states, retirement types and tax context behind the country flag.
7. AI opt-out in Settings. When off, skip all coach/Anthropic calls; every deterministic feature keeps working; Meet runs the deterministic agenda without facilitation.
8. Meet as the signature feature. Deterministic weekly agenda from engine outputs: wins, meaningful spending changes, upcoming risks, debt progress, goal progress, one or two decisions with both outcomes computed. Coach facilitates only: reflects, asks one question at a time, compares the two computed trade-offs, records a choice only after explicit confirmation, never invents the result.
9. Do not change Plaid gating unless strictly required to keep the app working.
10. Kids: remove entry points from primary navigation and dashboard; keep route and code.

## Non-negotiables
- Work only from the current working repo. Not the stale March files.
- Do not rewrite correct deterministic financial logic to match old docs.
- No model produces financial figures.
- Do not delete or bury existing product intelligence.
- Do not remove US architecture. Do not change Terms eligibility to Canada-only.
- Do not build Kids further. Do not gate Plaid yet.
- No unrelated refactors. No broad search-and-replace that alters internal identifiers or US locale strings.
- Do not weaken or delete tests to pass.
- Do not change product or legal claims casually. Flag PIPEDA compliance, "regulated data provider", bank coverage and security wording if the implementation or evidence does not support the claim.

## Testing
Run the full existing suite after each logical stage: math-lock, pipeline, invariants, reconciliation, meeting schedule, coach QA. Add tests: AI cannot introduce new financial figures; AI-off mode skips all coach calls; Meet agenda outputs come from deterministic data; five-tab navigation preserves access to every existing feature. Fix regressions before proceeding.

## Working style
Small, reviewable commits or clearly separated change groups on a feature branch. Preserve existing architecture where correct. If the approved docs conflict with newer working code in a way that affects product behaviour, choose the safer/current architecture and flag the conflict in the final report.

## Completion report
Files changed; features changed; AI paths audited and what happened to each; confirmation that deterministic calculations remain outside AI; tests run and results; unresolved pricing decision; legal/trust claims needing verification; Plaid/free-tier decision deferred; product conflicts found between the approved docs and the current code.
