# Known defects — carried, not fixed

Everything here was found, reproduced and verified, then deliberately left alone because it fell
outside the brief that found it. Nothing in this file is speculative. Each entry names the file and
line, what a user actually sees, and what the fix is.

Deliberately **not** a backlog of ideas. If an entry cannot be reproduced any more, delete it.

Last verified against `demo-coach` on 2026-09-16.

---

## 1. "Payday spike habit detected" is calendar days 1–5, not the user's paydays

**Where** `src/lib/decisionEngine.js:106-114` (the ratio), `:159-161` (the cut), `:244` (the banner),
`:254` (the chip). Rendered at `src/App.jsx:1026` ("Safe to spend per day"), `:1087` (banner),
`:1156` (chip).

**What happens** `spikeRatio` compares spend on days 1–5 of the *calendar month* against days 6+. It
never consults `data.incomes`, `findAnchor`, `depositDatesFor` or `isDepositToday` — the engine that
owns when money actually lands. A household paid biweekly on the 10th and 24th, paying rent and doing
a big grocery run on the 1st–3rd, produces a ratio of ~3.0 and reads:

> Payday spike habit detected (+202%). Daily limit reduced by 15% to smooth your cash flow.

for a window containing no deposit at all. The 15% cut to the displayed daily figure is real, and is
applied with no mode gate.

**Worse, it is sometimes silent.** `App.jsx:1087` renders only `plan.alerts[0]`, and the low-balance
warning is pushed first, so when both fire the user sees the cut and not the explanation.

**Fix** Derive the spike window from `incomeSchedule`'s deposit dates, the way every other surface
now does. See also defect 2 below — they are in the same function and should be fixed together.

---

## 2. `decisionEngine` parses transaction dates as UTC, so its own window is off by a day

**Where** `src/lib/decisionEngine.js:107` and `:110` — `const d = new Date(t.date)` on a `YYYY-MM-DD`
string. The same bare form is at `src/lib/financialCalculations.js:1117`.

**What happens** A bare `new Date("2026-09-01")` parses as UTC midnight, which is the previous day in
any timezone west of UTC. Measured in America/Toronto:

```
"2026-09-01" -> getDate() = 31    (noon-safe: 1)
"2026-09-06" -> getDate() =  5    (noon-safe: 6)
```

So the "days 1–5" window is really ISO days 2–6, and **rent paid on the 1st — the single most
canonical payday-spike transaction — is excluded from the spike bucket entirely.**

**Fix** The noon-safe form every sibling engine already uses deliberately: `safeSpendEngine.js:75`,
`incomeSchedule.js:44`, `financialCalculations.js:1061`, `plaidNormalize.js:32/456/502`,
`notificationPlanner.js:106`.

---

## 3. "Projected Overdraft" quotes a minimum from a different window than the overdraft it announces

**Where** `src/App.jsx` — the forecast range at `:6107`, the slice at `:6118`, the sentence at `:6175`.

**What happens** `willGoNegative` comes from `ForecastEngine.generate(data, Math.max(range, 30))` —
up to 30 days — but `minBalance` is `Math.min` over `_forecast.slice(0, range)`, i.e. only the 7 or 14
days on screen. Measured on a real snapshot:

```
willGoNegative(30d): true, first negative on day 22 at -$629
minimum inside the printed 14 days: +$1,183
card renders: "Projected Overdraft — Balance hits $1,183 before your next deposit."
```

A red overdraft warning quoting a healthy positive number. The clause "before your next deposit" is
also unsupported: `minBalance` is a fixed 7/14-day slice with no relation to
`daysToNextFutureDeposit`.

**Fix** Take the minimum from the same window the overdraft was detected in, and either compute the
date of the first negative day or drop the "before your next deposit" clause.

---

## 4. Three Watch surfaces read `incomes[0]` where `primaryIncome()` already owns the answer

**Where** `src/App.jsx:6117`, `:6147`, `:6150`. The owner is
`src/lib/incomeReconcile.js:32`, documented as *"the LARGEST real income, i.e. the paycheque"*.

**What happens** `_ffreq = (data.incomes||[])[0]?.freq` and
`_fPay = perDepositAmount((data.incomes||[])[0])` take the first income record with no type check,
while the forecast table below them sums every income. Income lists are plain append-order
(`App.jsx:3721`, `:9846`) with no ordering guarantee, so a household whose list happens to start with
a small monthly benefit reads "PAY FREQUENCY monthly" and "EST. PAYCHEQUE $560" directly above a
table showing a biweekly $2,840 deposit.

Not reproducible on either demo fixture, whose `incomes[0]` is the employment income — this is a
real-user defect only.

**Fix** Call `primaryIncome()`. This is the governing thesis's exact failure mode: a React surface
re-deriving a financial fact an engine already owns.

---

## 5. A second, unreachable copy of the kids lesson decks

**Where** `src/App.jsx:9288-9303`, inside a `tab==="kids"` block.

**What happens** Nothing, today — the block is dead. The tab state is
`useState("meeting")` (`:8423`) and the only `setTab` (`:8669`) iterates `meetTabs` (`:8664`), which
holds `"meeting"` and optionally `"household"`. `"kids"` is unreachable.

**Why it is here anyway** It is a near-duplicate of the decks in `KidsMiniSite`, including its own
`payWord` call. It is already country-correct, but anyone editing kids lessons can easily edit the
copy nobody sees.

**Fix** Delete it, or route it. Do not leave two copies.

---

## 6. Formatting, cosmetic only — no wrong number, no false statement

Both confirmed, both deliberately deferred as not truth defects.

- `src/App.jsx` savings-opportunity card — `$${(bal||0).toFixed(0)}` renders **"$1840 in savings"**
  with no thousands separator, beside figures that have them. Route through `formatMoney`.
- `src/App.jsx` Watch assumptions strip — **"Est. daily spend $33/day"** is hand-formatted
  (`$${(_favg||0).toFixed(0)}/day`) rather than going through the shared formatter.

---

## 7. `CHILD_TAX_CREDIT` and `SALT_CAP` are defined and never read

**Where** `src/lib/taxData.js:63-64`.

**What happens** Nothing reads them; `/usr/bin/grep -rn` returns only the definitions. Meanwhile the
Child Tax Credit tip at `src/App.jsx:184` hard-codes `"$2,200/child (2025)"` against a key that
carries no `year` field — so the number and the year can drift apart at the next IRS sweep.

**Fix** Either interpolate the tip from the constant, or delete the constants. Do not keep both.

---

## 8. The benefits-checker list is not province-gated

**Where** `src/App.jsx:141` — `CC.CA.benefitsChecker` contains an Ontario Trillium Benefit row shown
to every Canadian.

**What happens** The same defect the *tip* had, in a different array: a household in British Columbia
is told to apply for an Ontario benefit. Fixed for the tip list; this list still has it.

**Fix** Gate the row on `province === "ON"`, as the tip now is.

---

## 9. A welcome email can be sent twice if `welcomed_at` cannot be written for over 24 hours

**Where** `netlify/functions/_lib/waitlistWelcome.js` (`sendWelcomeEmail`, `markWelcomed`) and
`netlify/functions/waitlist-sweep.js`.

**What happens** Sending and recording are two steps. The email goes out, then `welcomed_at` is
stamped. When the stamp fails (a timeout, a 4xx, Supabase unavailable), the row stays `welcomed_at
null` and the sweep picks it up again on its next run. A second send is normally harmless, because
Resend de-duplicates on the `Idempotency-Key` `waitlist-welcome/<row id>` the two paths share.

**Resend holds that key for 24 hours.** Past that window the same key is treated as new, so a row
whose `welcomed_at` has been unwritable for more than a day gets a second copy of the confirmation.
It needs a sustained failure of the write while sending keeps working, which is narrow, but the
person sees a duplicate email and there is nothing in the data to say it already went.

**Detection** `welcomed_at is null` on a row older than a day, while the sweep logs show sends:
```
[waitlist-sweep] {"considered":N,"sent":N,"failed":0,...}
```
with the same count every 15 minutes and no fall in the pending count.

**Fix (suggested, not built)** Record the attempt before the send rather than after it. Add a
nullable `welcome_attempted_at timestamptz`, stamp it immediately before calling Resend, and have the
sweep skip any row whose attempt is under 24 hours old even when `welcomed_at` is still null. Then a
row can never be auto-resent inside the window Resend's key covers, and one that is older than 24
hours is surfaced for a human decision rather than resent automatically.

**Status** Deferred by decision, 2026-09-20, under the rule that only a HIGH finding blocks a merge.
Raised in ChatGPT review round 4 of PR #1.

---

## 10. A failed profile read leaves the cached plan in place, so client-only gates can be bypassed

**Where** `src/App.jsx` (`refreshPlanFromProfile`), and every gate that reads `isPremium` or the
`flourish_plan` key in `localStorage` — `PremiumGate`, the Dashboard upsell, the Coach free-message
counter, `isPremiumOrFounder()`.

**What happens** `refreshPlanFromProfile` reads the `profiles` row and writes what the server says
into state and cache. When the read fails or returns no row it returns `null` and **leaves the cache
alone** — it does not downgrade. That is deliberate and is pinned by assertions 3j–3l in
`tests/entitlementsServerAuthority.test.cjs`: a transient read error must not strip a real founder of
what she has. The cost of that choice is the defect. `flourish_plan` is ordinary `localStorage`, so
anyone can type `localStorage.setItem("flourish_plan","beta_founder")` in a console; if the profile
read then fails, or is never reached, the forged value survives and the client-side gates open.

**What it does NOT do** It buys nothing that costs money to serve. The Coach is the only paid
feature with a server cost, and `netlify/functions/coach.js` decides from the `profiles` row it reads
itself with the secret key — it never trusts a plan sent by the browser. Linked accounts are gated by
Plaid credentials the client does not hold. So the exposure is UI: screens and copy a free account
should not see.

**Detection** Not detectable from the data — a forged cache leaves no server trace. What would show
is a support report of paid screens on a free account, or `[profiles] plan reconcile failed:` in the
browser console alongside premium UI.

**Fix (suggested, not built)** Keep the rule that every paid feature is enforced server-side, and
make the client plan **display only**:
1. Each paid capability is checked by the function that serves it, from the `profiles` row, as
   `coach.js` already does. No new client check is trusted.
2. `flourish_plan` is treated as a cache for rendering, never as an authority — a screen that costs
   money to serve asks the server, and on no answer shows the free view rather than the paid one.
3. When billing exists, the same rule covers checkout: the plan changes only when a server-confirmed
   payment writes the `profiles` row.

**Status** Deferred by decision, 2026-09-21, under the rule that only a HIGH finding blocks a merge.
Raised in the ChatGPT review of PR #2 (`entitlements-server-authority`) as a MEDIUM.

---

## 11. Three test gaps on the entitlements work

**Where** `tests/` and `supabase/migrations/`.

**What happens** The entitlements branch is covered at the unit level — 2,113 gate assertions,
including the real `coach.js` enforcement block and the real `refreshPlanFromProfile` and paywall
handler compiled out of `src/App.jsx`. Three things are still not tested, and each was verified by
hand on the local database instead, which is weaker because nothing re-checks it after a change:

1. **No test runs the migrations with RLS end to end.** `supabase db reset` proved the chain
   `00000` → `0008` applies cleanly, and the `profiles_guard_privileged` trigger was checked both
   ways by hand (a browser-role `trial_ends_at` write was rejected; the same write with the
   service-role claim succeeded). But those checks ran through `psql` as the superuser with
   `set_config('request.jwt.claims', ...)`, not as a real anon/authenticated client through
   PostgREST. A policy that is right under `set_config` and wrong through the API would not be
   caught.
2. **No rollout-order test.** The order is: apply `0007`, then `0008`, then merge and deploy, then
   set `ENFORCE_PLAN_LIMITS`. Nothing enforces or verifies it. The worst case in that order was the
   deploy-before-`0008` window, and that one is now covered — `coachLimits.test` section 7 runs the
   missing-function case — but the ordering itself is a runbook line, not a test.
3. **No checkout test, because there is no checkout.** Billing is planned for 26 Oct. Until then the
   Upgrade button only shows a message (see defect 10 and the HIGH 2 fix on PR #2), so there is no
   payment path, no webhook and no plan write to test.

**Fix (suggested, not built)** For 1, a test that talks to the local stack over PostgREST with the
anon and authenticated keys and asserts each RLS policy from the outside. For 2, fold the order into
`scripts/` as a checked deploy step rather than prose. For 3, write it with the checkout.

**Status** Logged 2026-09-21 from the ChatGPT review of PR #2. Items 1 and 2 are doable now; item 3
waits on billing.

---

## 12. `meetTabsRow.test.cjs` tests extracted source text, not the rendered row

**Where** `tests/meetTabsRow.test.cjs` and `src/App.jsx` (the Meet screen's `meetTabs` row, around line 8705).

**What happens** The test slices the `meetTabs` declaration and its `if(meetTabs.length<2) return null;` guard out of `App.jsx` as text, compiles that slice with `new Function`, and runs it. That proves the guard's logic is right, but not that the rendered row obeys it. If the declaration ever became dead code — moved, shadowed, or no longer what the JSX maps over — the test would keep passing while the screen showed a single already-selected "Money Meeting" button again. The same extract-and-compile pattern is used elsewhere in this suite, so the gap is not unique to this file.

**What it does NOT do** It does not affect users today: the guard is in place and behaves correctly (hidden with `HOUSEHOLD_ENABLED` off, back with two tabs when on). This is a weakness in how well the test would catch a future regression.

**Detection** Not detectable from behaviour. It shows up only if the row is refactored and the test still passes.

**Fix (suggested, not built)** Extract a small pure render helper, for example `meetTabsFor({ isCouple, householdEnabled })` returning the tab list or `null`, into `src/lib/`. Have the JSX call it and map over its result, and test the helper directly with imports rather than by extracting source text. The test then exercises the same code the screen runs.

**Status** Deferred by decision, 2026-09-21, under the rule that only a HIGH finding blocks a merge. Raised as a LOW in the ChatGPT review of PR #3.

---

## 13. The learning loop: eight accepted findings from the PR #10 review

All eight were accepted during the review that returned DO NOT MERGE on PR #10. The two
blockers in that review are fixed on the branch; these are the ones deferred by decision.
Numbered 13a-13h so they can be referred to individually.

### 13a. The merchant-override memo cache is never invalidated on hydrate or wipe

**Where** `src/App.jsx:743` (`let _mcoCache = null;`), cleared only by `bumpMerchantCatOv()`
at `src/App.jsx:745`, called from `recat` and the Remove-rule control.

**What happens** The cache is filled on first read and cleared only by a LOCAL write. Two
paths change `flourish_cat_merchant_overrides` without going through them: cloud hydrate
(`writeSideKeys`, `src/lib/persistence.js:79`) and the shared-device wipe
(`clearAllUserLocal`, same file). After either, the module-level cache still holds the
previous household's rules until the page is reloaded — so signing in on a device that
already had a session can show one household's category rules applied to another's
transactions.

**What it does NOT do** It cannot write the wrong rule to storage; only the resolution in
that page session is stale, and the stored data is correct.

**Fix** Call `bumpMerchantCatOv()` from `writeSideKeys` and `clearAllUserLocal`, or drop the
cache in favour of reading through React state so hydration invalidates it naturally.

### 13b. A correction on a merchant with one transaction silently writes a permanent rule

**Where** `src/App.jsx:6978` — `if (applyToAll || others <= 1)`.

**What happens** Correcting a transaction whose merchant has no other transactions writes a
forward-applying merchant rule with no prompt and no notice. The reasoning is in the code
(with nothing else it could mean, "this merchant is X" is the only reading), but the
household is not told a rule was created, and only finds out when a future charge arrives
already categorised.

**Fix** Either say so in the sheet ("future charges from this merchant will use this too"),
or restrict silent rule-writing to the explicit apply-to-all path.

### 13c. The data export omits merchant overrides

**Where** `src/App.jsx:10238` exports `categoryOverrides: _ls("flourish_cat_overrides", "{}")`
and nothing exports `flourish_cat_merchant_overrides`.

**What happens** The PIPEDA data export is incomplete: the household's merchant rules are
their data and are not in it. They ARE synced (`src/lib/persistence.js` SIDE_KEYS), so this
is an export gap, not a loss.

**Fix** One line beside the existing entry.

### 13d. `billsReconcile` keys bills differently from the rest of the pipeline — a FIRST-SYNC event, not cosmetic

**Severity: this is the one to fix before the answer path is wired.** An earlier version of this
entry called it pre-existing and cosmetic. It is neither. Blocker 1's fix changed the detector's
display name, and `docs`-level "cosmetic" was the wrong reading even before that.

**Where** `src/lib/billsReconcile.js:29` (`billKey`, lowercase + collapse whitespace) versus
`src/lib/billReeval.js:57` (`merchantKey`, which also strips POS prefixes and account numbers via
`plaidNormalize.stripAccountNumber`).

**What happens** A stored bill and the detector's current name for the same merchant can differ —
`"Rogers"` stored, `"Rogers Toronto On"` detected from `"ROGERS 1234 TORONTO ON"`. `billsReconcile`
compares them with its own weaker key, sees no match, and raises BOTH halves: an `appeared` for the
detected name and a `disappeared` for the stored one. One bill, two questions, pointing opposite
ways.

For an existing household this is a **first-sync event**, not a slow drift: the first money meeting
after this ships asks them to add bills they already have, and in the same agenda asks them to
confirm those same bills have ended. Fixes 1-3 (commit `c179383`) make the name match again for the
common shapes — `HYDRO ONE 12345 ON`, `BELL CANADA 1234 QC`, `HYDRO QUEBEC 1234 5678` — and the
compatibility read carries `userBillOverrides` across, but neither covers the bill-name matching
inside `billsReconcile`, and `"ROGERS 1234 TORONTO ON"` still splits.

Pinned by `tests/merchantNameCompat.test.cjs` assertion **e2**, which asserts the CURRENT (wrong)
behaviour so it is visible and counted. Fixing 13d makes that assertion fail; change it to expect
`"(none)"` at the same time.

**Fix** Use `merchantKey` in `billsReconcile` instead of `billKey`. It was written before the
blocker-1 work made `merchantKey` safe; now that it is, there is no reason for a second key.

**SEQUENCING CONSTRAINT — read this before starting 13e or 13f.**

The double-counted bill is **latent today**: `applyBillChange` has no caller, so nothing acts on the
pair. It becomes **live** the moment 13e (writing `meetingRecords`) and 13f (rendering
`agenda.questions`) wire the answer path — at that point a household can accept both halves, adding
a duplicate bill AND removing the real one, and the bill total is wrong in both directions.

So: **fixes 1 to 3 must land before 13e/13f work starts** (they have, in `c179383`), and **13d must
be fixed before 13e/13f ship**, not after. The order is 13d, then 13e/13f, then the migration.

### 13e. Nothing writes `meetingRecords`

**Where** `src/lib/meetSnapshot.js:119` and `:146` read `data.meetingRecords`; no writer exists
in `src/`.

**What happens** The record table, the server writer (`netlify/functions/meeting.js`) and the
reader all exist, but no client code posts an answer or hydrates the rows into `appData`. Until
that is wired, dismissals persist only in the local `billSuggestionDismissed` field and the
next-meeting opening always reports "first money meeting".

**Fix** Post to `/api/meeting` when an agenda question is answered, and hydrate
`meetingRecords` from the `meeting_records` table alongside the rest of the profile read.
Needs migration `0011_meeting_records.sql` applied first.

### 13f. `agenda.questions` is never rendered on the Meet screen

**Where** `src/App.jsx` — zero references to `agenda.questions`; the Meet screen renders wins,
changes, risks, progress and decisions only.

**What happens** The questions reach the agenda object and the facilitator's text context
(`agendaToText`), so the model can ask them out loud, but nothing is shown on screen and there
are no Yes/No controls — so there is no way for a household to answer one in the UI.

**Fix** Render the section with its two options and call the writer from 13e.

### 13g. `meetingOpening`'s health-score line can never render

**Where** `src/lib/meetingRecord.js` reads `snapshot.healthScore.current` / `.previous`;
`buildMeetSnapshot` (`src/lib/meetSnapshot.js`) never sets `healthScore`.

**What happens** The "since last time" opening is limited to what the stored record says. The
one engine-derived line it can produce is unreachable in the running app, so item 5's "and
what the engines say has changed" is currently only true in tests, which pass the snapshot
directly.

**Fix** Set `healthScore: { current, previous }` in `buildMeetSnapshot` from `calcHealthScore`.
The previous value needs somewhere to come from — the last meeting record is the natural home,
which makes this depend on 13e.

### 13h. `rememberDismissal` writes a shape its only reader rejects

**Where** `src/lib/reconcileLoop.js:123` returns `{ [field]: signature }` — a single string.
For `domain: "bills"` the field is `billSuggestionDismissed`, which
`src/lib/meetSnapshot.js:120` and `billsReconcile.shouldPromptBills` both read as an ARRAY.

**What happens** Nothing today: `rememberDismissal` has no callers, and the bills path uses
`rememberBillDismissal` instead. But the function is exported and looks like the one to use, so
the first caller to reach for it writes a string where an array is expected and silently
suppresses nothing.

**Fix** Either make it domain-aware (array for bills, string for income) or delete it and keep
`rememberBillDismissal` as the only writer.
