# Steps 2–10 — Final Completion Report

**Branch:** `strategy-implementation` @ `2bdfb55` (not merged, not deployed)
**Offline gate:** `npm run test:math` → **1136 assertions / 33 suites / 0 failures**
**Build:** `npm run build` → clean
**Authority:** `docs/product/DECISIONS.md` (overrides older docs)

Status legend: **COMPLETE** · **DEFERRED BY DECISION** (a DECISIONS.md override or Step-1 freeze holds it) · **BLOCKED** (a pre-merge/pre-deploy gate that needs a resource I don't have) · **PARTIAL** (honest: some sub-scope done, some prose polish outstanding — flagged, not hidden).

---

## Step 2 — Remove dead coach types — **COMPLETE**
- `coach.js`: removed `plan`/`insights`/`buckets`/`tax`; added `if (!isLiveCoachType(type)) return 400` before the switch.
- Single source of truth: `netlify/functions/_lib/coachTypes.js` (`LIVE_COACH_TYPES`, `isLiveCoachType`).
- **Tests:** `tests/coachPaths.test.cjs` (dead types rejected, live types dispatch).

## Step 2b / Item 3 — Statement import (transcribe-only + provenance) — **COMPLETE**
- Model transcribes only; `src/lib/statementImport.js` validates every row (verbatim-source match, real in-period date, reconciliation); non-numeric amounts rejected, never coerced to 0.
- Whole import shown; questionable-but-valid selectable; failed rows unselectable until edited; user approves exactly which rows enter; **no write before confirm** (`rowsToImport` is pure).
- **Provenance (item 3):** an edited row is re-validated with `trustAmount` (deterministic), marked `source:"statement-import", edited:true, verbatimSourceMatch:false`, keeps `originalExtracted`, and shows a "✎ edited by you" badge. An edited amount is **never** represented as verbatim-source-matched.
- **Tests:** `tests/statementImport.test.cjs` (incl. the edited-row provenance case, commit `c4b9d38`).

## Step 3 — Pricing — **COMPLETE**
- `src/lib/pricing.js`: CA `$11.99`/mo, `$99.99`/yr, founding `$79.99`; US `$7.99`/`$59.99` behind the country flag (`getPricing`). Paywall reads `pricing.js`.
- **DECISIONS 1:** founding entitlement only (price constant); `beta_founder` tier preserved; billing later.
- Item 5: garbled founding-price comment corrected (`d50bc5e`).
- **Tests:** `tests/pricing.test.cjs` (CA/US values, 31% annual saving, formatting).

## Step 4 — Prompt caching — **COMPLETE (structure)** · **live cache measurement BLOCKED**
- `coachPrompt.js` `systemBlocks(stable, variable)` puts stable rules first with `cache_control:{type:"ephemeral"}`; per-user financial context is a separate **uncached** block wrapped in `<UNTRUSTED_USER_DATA>`. All four system builders use it.
- **Tests:** `tests/coachPrompt.test.cjs` (18/18) asserts the block shape, cache flag placement, and that context is never in the cached block.
- **BLOCKED:** `.env.local` (gitignored ✓, Node v24 `--env-file` supported) contains **no `ANTHROPIC_API_KEY`** (only Supabase VITE vars). So the two-request live `cache_creation_input_tokens` / `cache_read_input_tokens` measurement could not be run. No fabrication.
  - To run when a key is available (synthetic data only, key never in client/build/logs/commits):
    `node --env-file=.env.local tests/coach_qa.cjs`
  - Harness structurally verified: it loads, parses all cases, and exits cleanly reporting the missing key.

## Step 5 — Free-tier coaching limit — **COMPLETE**
- `src/lib/usageLimits.js`: `coachMessagesPerWeek: 2`, resetting weekly via `_weekKey()` (most-recent-Monday UTC). Trial/Plus unlimited. Legacy daily counters still read.
- **Tests:** `tests/usageLimits.test.cjs` (weekly reset, week-key boundaries, legacy shape).

## Step 6 — Five-tab navigation — **COMPLETE**
- `src/lib/navigation.js`: `TABS = [home, watch, do, coach, family]` → **Today / Watch / Do / Learn / Meet**; Watch groups plan+spend, Do groups budget+goals+credit; standalone screens kept reachable.
- **Verified live (item 6):** desktop sidebar + mobile bottom bar both show all five tabs (screenshots below).
- **Tests:** `tests/navigation.test.cjs` (tab-for-screen, reachability of every screen).

## Step 7 — Copy + Today structure + claims — **COMPLETE**
- **Today structure — COMPLETE.** Deterministic priorities card above the hero: **one thing to know** (overdraft/forecast/safe-spend engine output), **one thing you could do** (weekly pacing derived from the engine's safe number), **✓ Calculated by Flourish**, and **Explain this →** into Learn. Everything else stays below. All numbers are engine outputs; no AI. Smoke test surfaced and fixed a $1 hero/card rounding mismatch (`a92576b`). Verified live at mobile + desktop.
- **COPY-CHANGES §5/§7/§8/§11/§12/§13 — COMPLETE.** Approved wording applied per-string to the current architecture, one commit per section, gate + build after each. Discovery was done by a parallel per-section mapping pass; every `find` was grep-verified unique before applying.
  - **§5 Onboarding** (`e0abf76`): "Link your accounts (optional)", read-only connect sub, "🔒 Read-only connection", "Enter it myself", income title CA-gated (`Your paycheques`/`Your income`), "Your credit score (optional)", "Show me today's number →". Done-screen rows N/A (no post-setup summary screen exists).
  - **§7 Watch** (`0b5ed77`): "Watch / The next 90 days…", "Time Machine" + new subtitle "Drag a what-if onto your forecast. Flourish recalculates the line.", Transactions CTA "Explain this", empty states reworded (secondary keeps the statement-import affordance per DECISIONS 4). Verified live: title/subtitle render on Today→Decisions and do **not** contaminate Meet. Forecast-risk row templating left as dynamic engine output (not a copy string).
  - **§8 Do** (`da71483`): "Do / Budget, debts, goals, retirement…", "Debts, highest rate first" + engine-honest caption, "No debts tracked.", "Room Flourish found", "Credit / …Not your bureau score.", credit-gate desc (verified rendering live).
  - **§11 Paywall** (`6a42758`): trial sub, "What Plus adds" downsell, all feature retitles/descs (Coach, Benefits explained, Credit plan, Contribution room, Weekly money meeting, Debt payoff date, Pattern alerts), new **Linked accounts** card, "Start 14 days free →", "Keep the free plan"; CA-only benefit descs behind `isCA` (US branches untouched). Verified live: full feature list + CA pricing render; **no "PIPEDA"**; "Built in Ontario" present.
  - **§12 Settings** (`20b99a3`): toggle "AI Coach" (dropped "enabled"), offline banner "Offline. Coach paused, numbers saved.", and an **added** bank-section sub using DECISIONS-8 factual wording ("Read-only connections through Plaid. Flourish cannot move your money. Unlink any time.") — **not** the doc's barred "regulated data provider".
  - **§13 Legal** (`c33c41e`): Terms services list rewritten + "read-only and cannot initiate payments or transfers", heading "Not a Licensed Adviser" + coach-scope disclaimer, Privacy Data Storage AI-off sentence (true given the Step 8 gate). PIPEDA section left **DEFERRED** for lawyer review; eligibility unchanged.
- **§4 Landing — applicable element COMPLETE (`2bdfb55`); rest DEFERRED BY DECISION.** The landing is now the redesigned **waitlist-first** page (DECISIONS 7). The one §4 element that exists on it — the AI Coach benefit card — now carries the approved honest framing ("It never invents a number and it isn't a licensed adviser"). The read-only trust chip is present; no PIPEDA claim. None of §4's other anchor strings (old hero, pain points, how-it-works steps, pricing grid) exist (mapping pass grep count 0 for each); that copy applies once billing/full-marketing ship — tracked, not lost.
- **Claims honesty (DECISIONS 8) — COMPLETE.** Live trust copy is factual ("Read-only…", "Built in Ontario", "Your bank login is never stored", verified true against `plaid.js`). No "PIPEDA compliant" or "regulated data provider" shipped anywhere; the §12 bank sub and §11 footer both use the DECISIONS-8 factual alternative.
- **CA locale — COMPLETE.** Every Canada-specific string is handled per-string on the existing `profile.country`/`isCA` flag (income title, paycheque labels, paywall benefit descs); US branches and identifiers untouched. No broad replacement.
- **Item 2 — Time Machine "Paycheck" → "Paycheque"** (`0b37b51`): the three user-facing labels (TimeMachine, FinancialTimeline, PlanAhead) now render "Paycheque" for CA and "Paycheck" for US via the country flag. Presentation string only; no What-If math, engine functions, inputs, outputs or tests touched.
- **§14 find-replace — COMPLETE:** "AI-powered" → factual; "Personalized advice" → "coaching from your own numbers"; "incredible!" removed; `paycheck → paycheque` done (item 2); nav "Guidance→Learn"/"Family→Meet" (Step 6/9). Not-applicable rows (with reason): `checking → chequing` (only label already CA-leading; all other "checking" are identifiers/verb); `Chase / Wells Fargo in CA marketing` (US bank list only, absent from CA marketing); `AI Financial Coach → coach` (string not present). Em-dash sweep applied where copy was edited; `behaviour` user-facing spellings sit in the deferred §4 landing prose. Lowercase "flourish" preserved in body copy; waitlist preserved (verified live).

## Step 8 — AI on/off gate — **COMPLETE**
- `src/lib/aiGate.js`: `aiEnabled()` (default ON, fail-safe ON on error); `ensureAiEnabled()` throws **before** any network call. All three inline call sites + chat `send()` gated.
- **Tests:** `tests/aiGate.test.cjs` (default on, off blocks, error → on).

## Step 9 / Item 2 — Meet — **COMPLETE**
- `src/lib/meetingAgenda.js` assembles the agenda from a snapshot without computing any figure; `src/lib/meetSnapshot.js` feeds it **only** engine outputs (Forecast/SafeSpend/decisionEngine) + appData debts/goals.
- **UI (family tab):** solo + couple modes; **free** users get the deterministic agenda + a plain Plus prompt, no facilitation; **trial/premium/beta_founder** can Start the meeting; **AI-off** users get the agenda and no facilitator. Facilitator operates only on the supplied agenda and records `FLOURISH_UPDATE` only after explicit confirmation (`buildFacilitatorSystem`).
- **displayed === generated === sent:** the screen and the facilitator both call `meetAgendaFor(data)`; `agendaToText` contains every displayed item.
- **Verified live (item 6):** Meet renders at mobile + desktop with both engine-computed decision outcomes (screenshots below).
- **Tests:** `tests/meetingAgenda.test.cjs`, `tests/meetSnapshot.test.cjs` (UI-level: displayed agenda === generated === facilitator text). `tests/coach_qa.cjs` extended with facilitator / simulator / checkin cases **each including a number-invention case** (structurally verified; live run BLOCKED with Step 4).

## Step 10 — Kids — **COMPLETE**
- Removed the "Kids Zone" primary entry from the Family tab; `/kids` route and `KidsMiniSite` code retained.

---

## Item 6 — Visual smoke test — **COMPLETE**
Ran the built app (Vite dev, demo/sample data) in-browser and captured all four:

| Screen | Width | Result |
|---|---|---|
| Today | desktop (1280) | Priorities card (know/do/Explain this) above the $2082 hero; CA locale; 5-tab sidebar ✓ |
| Today | mobile (375) | Same card full-width; 5-tab bottom bar; "paycheque" ✓ |
| Meet | desktop | Agenda + "One decision this week" with both computed outcomes; Start the meeting ✓ |
| Meet | mobile | Same, full-width; Meet tab active ✓ |

DOM-verified: `flourish_dash_tab="today"` renders `One thing to know` / `One thing you could do` / `Explain this →`, card `$2082` == hero `$2082` after the rounding fix.

---

## Gate discipline
Every commit ran `npm run test:math` (offline) + `npm run build` before landing; no test was weakened or deleted. Coach QA (`test:coach`) is live-API and excluded from the offline gate by design; its new cases are structurally verified and its live run is the one BLOCKED item, pending an `ANTHROPIC_API_KEY`.

## Pre-merge / pre-deploy checklist (open items)
1. **BLOCKED:** live coach QA + prompt-cache token measurement — needs `ANTHROPIC_API_KEY` in `.env.local` (never a `VITE_`-prefixed name; never in client/build/logs/commits). Run: `node --env-file=.env.local tests/coach_qa.cjs`.
2. **DEFERRED BY DECISION:** §4 landing full-marketing copy (pain points, how-it-works, pricing grid) applies only once the waitlist page is replaced with the full marketing/billing landing (DECISIONS 7). Waitlist-page copy is done.
3. **Legal review** of the Privacy Policy PIPEDA section (left flagged, untouched — DECISIONS 8).
