# Steps 2–10 — Final Completion Report

**Branch:** `strategy-implementation` @ `a92576b` (not merged, not deployed)
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

## Step 7 — Copy + Today structure + claims — **COMPLETE (structure, Today, claims, applicable §14)** · **PARTIAL (marketing/onboarding/legal prose polish)**
- **Today structure — COMPLETE.** Deterministic priorities card above the hero: **one thing to know** (overdraft/forecast/safe-spend engine output), **one thing you could do** (weekly pacing derived from the engine's safe number), **✓ Calculated by Flourish**, and **Explain this →** into Learn. Everything else stays below. All numbers are engine outputs; no AI. Smoke test surfaced and fixed a $1 hero/card rounding mismatch (`a92576b`).
- **Claims honesty (DECISIONS 8) — COMPLETE.** Live trust copy: "🔒 Read-only. Flourish can't move your money.", "🇨🇦 Built in Ontario", "🔑 Your bank login is never stored" (verified true against `plaid.js` — no credentials handled). No "PIPEDA compliant" / "regulated data provider" shipped. Privacy Policy PIPEDA section left untouched, flagged for legal.
- **§14 find-replace applied where applicable — COMPLETE:** "AI-powered coaching/detection" → factual; "Personalized advice" → "coaching from your own numbers" (2 sites); "incredible!" hype removed; nav "Guidance→Learn" and "Family→Meet" (Step 6/9). Lowercase "flourish" preserved in body copy. Waitlist structure preserved (verified live).
- **CA locale — COMPLETE for touched strings:** handled per-string on the existing `profile.country` flag (e.g. the coach CTA renders `RRSP/TFSA` for CA vs `401k/IRA` for US); new Today copy uses "paycheque". No broad replacement; no US behaviour or identifiers changed.
- **§14 items skipped, with reason:**
  - `checking → chequing`: the only user-facing label is already `"Chequing / Checking"` (CA-leading); every other "checking" is an identifier (`isCheckingAccount`, `type:"checking"`) or the verb ("checking in"). **Not applicable.**
  - `paycheck → paycheque`: the three "Paycheck" labels live in **TimeMachine / What-If**, which **DECISIONS Step 1 freezes** ("What-If stays exactly as it is"). **DEFERRED BY DECISION.**
  - `behavior → behaviour` (user-facing): several occurrences sit inside the §4 landing-marketing prose that is not yet fully reworked; correct handling is per-string locale-aware, which belongs with that prose pass. **PARTIAL** (see below).
  - `em dash → period/comma`: applied opportunistically where I edited copy (debt-free lines); a full sweep is a broad replacement the brief explicitly cautioned against, so not done wholesale. **PARTIAL.**
  - `Chase / Wells Fargo in CA marketing → remove`: present only in the US bank list, never in CA marketing. **Not applicable.**
  - `AI Financial Coach → coach`: string not present. **Not applicable.**
- **PARTIAL — outstanding prose polish (not blocked, not decision-deferred; flagged honestly):** a full line-by-line rewrite of §4 (landing marketing body), §5 (onboarding microcopy), §7 (Watch headers), §8 (Do headers), §12 (Settings prose), §13 (Legal prose) is **not** complete. The claims-critical, structural, and voice-overclaim strings in those sections were done; the remaining work is stylistic polish, not correctness, billing, security, or math. Recommend a dedicated copy pass before launch.

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
1. **BLOCKED:** live coach QA + prompt-cache token measurement — needs `ANTHROPIC_API_KEY` in `.env.local`.
2. **PARTIAL:** dedicated copy pass over §4/§5/§7/§8/§12/§13 prose (incl. per-string `behaviour` locale + em-dash sweep).
3. Legal review of the PIPEDA section (left flagged, untouched).
