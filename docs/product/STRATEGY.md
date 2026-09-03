# Flourish Money: Strategy (approved 2026-09-03)

## Product promise
Flourish tells you what your money means, what needs your attention, and what to do next.

Safe-to-spend gets people to open it every day. The coach makes it understandable. The money meeting makes it useful to a household. The planning engines help them change their future.

## Focus
Canada first. An AI money coach for overwhelmed households. Three loops: daily safe to spend, weekly money meeting, plain-language coaching. Five tabs: Today, Watch, Do, Learn, Meet. Trust posture: read-only, no money movement, AI can be turned off, not a licensed adviser. Voice: direct, smart, Canadian. Screen-by-screen copy and the approved coach rules are in COPY-CHANGES.md.

## Four amendments (approved)
1. Coach role. Flourish's deterministic engines are the sole source of financial figures. The coach explains those figures, identifies patterns, compares options, prioritizes issues, asks questions, challenges unsustainable behaviour and helps the user decide. It must not independently invent or calculate figures, and must not make regulated investment, legal or individualized tax recommendations.
2. Preserve product intelligence. The five-tab redesign is information architecture, not feature deletion. Decision Engine, Autopilot, What-If, Financial Time Machine, opportunity detection, budgets, categories, debt modelling, goals, health score, retirement tools, forecasts and transaction analysis all stay and feed the five tabs.
3. Canada-first, not Canada-only. Canadianize launch marketing and default onboarding to Canada. Keep every US code path behind the country flag. Terms eligibility stays Canada or US unless a separate decision is made to technically block US signups.
4. Meet as the signature feature. Agenda generated from the household's actual week using engine outputs: wins, changes, upcoming risks, debt and goal progress, one or two decisions with both computed outcomes. The coach facilitates around those facts and never invents results.

## Source-of-truth warning
The claude.ai project's copies of App.jsx, App.jsx.bak and coach.js are from 2026-03-29 and are stale. The current working repo (the one Claude Code has) is the only code source of truth. Its What-If flow reportedly computes figures in JavaScript (simulatePurchaseImpact, calculateScenarioVerdict) with the model writing prose only. COPY-CHANGES.md quotes old copy and old line numbers; resolve every location from the current code.

## Where it stands
- Built, beta-ready, not live to paying users. No billing integration. Pricing was inconsistent in the March copy ($9.99 CAD / $7.99 USD in Paywall, $14.99 on landing page); confirm against current code.
- Substantial machinery exists: five engines (calc, safe-spend, 90-day forecast, behaviour, health score) plus Autopilot, Decision Engine, Time Machine with What-If overlay, opportunity detection, debt and retirement modelling, Plaid, Supabase sync, coach proxy, trial/premium state.
- Unit economics (Flourish_Unit_Economics.xlsx): free users who link banks and use the coach indefinitely cost more than a paid user earns; caching the coach prompt and limiting free-tier link duration turns net margin positive; breakeven near 15 paying users.

## Implementation order (approved)
1. Verify What-If: confirm the working flow computes figures outside the model; check for older duplicate simulator paths. If correct, leave the flow intact and only update approved copy around it.
2. Audit and lock down every AI path (chat, checkin, simulator, plan, insights, buckets, tax, document, anything newer). Remove dead paths; live paths follow parse, deterministic compute, coach explains.
3. Reconcile pricing: one source of truth in code; do not invent a final price if undecided; report values needing a decision.
4. Coach role and rules, reply footer, engine/coach labels.
5. Five-tab information architecture, feature-preserving.
6. Canada-first copy (CA locale only), US paths intact.
7. AI opt-out in Settings; Meet works with AI off using the deterministic agenda.
8. Meet as the signature feature: deterministic agenda, coach facilitates only.
9. Do not gate Plaid yet.
10. Kids: remove primary entry points only; keep route and code.

## Trial and free-tier economics (open decision)
Candidate structure: 14-day trial includes linked accounts; Free after trial is manual entry; Plus keeps live links. Rationale: the positioning depends on Flourish knowing the household's situation without data entry, so activation needs linked banking in the first session. Model estimate: a trial user with 2.5 linked accounts costs roughly $0.50 in Plaid for 14 days plus a few cents of coach usage, so at 8% conversion the link-during-trial cost is about $6 to $12 per paying user against a lifetime contribution near $133. Cheap relative to activation risk; confirm with beta data. Not approved for implementation yet.

Later: billing (Stripe Checkout, Customer Portal, webhook to Supabase, trial owned by Stripe), prompt caching and Haiku for free tier, Canada wedge engines (CCB clawback, RRSP vs TFSA vs FHSA, RESP/CESG, benefit calendar) as free shareable URLs, trust signals, and replacing model assumptions with beta data before any acquisition spend.

## What not to do
- Do not implement against the March project copy or its line numbers.
- Do not rewrite What-If or any correct deterministic logic to match old docs.
- Do not delete or bury any engine.
- Do not let the AI produce a number. If a figure is needed, build the engine for it.
- Do not turn the coach into a disclaimer machine.
- Do not remove US code paths or change Terms eligibility.
- Do not gate Plaid from day one without thinking through activation.
- Do not build Kids further now.
- Do not switch to Flinks at this scale ($500/mo minimum, 1-year contract).
- Do not run ads until trust signals and billing exist.

## Cost facts (Sep 2026)
- Stripe Canada: 2.9% + $0.30 domestic; +1.5% intl, +1% FX.
- Claude Sonnet: $3/$15 per M tokens, cache reads 10%. Haiku 4.5: $1/$5.
- Plaid: Transactions billed monthly per Item, rates unpublished (~$0.30/account/mo commonly cited). Trial capped at 10 Production Items.
- Flinks: $500/mo for 200 connections, annual contract.
