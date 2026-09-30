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

### 13d. `billsReconcile` keyed bills differently from the rest of the pipeline — FIXED 2026-09-23

**Status: fixed** in `src/lib/billsReconcile.js` + `src/lib/plaidNormalize.js` on branch
`learning-loop`. Kept here because the reproduction is the regression test, and because the
compatibility read it depends on still has to be retired one day (see the end of this entry).

**Where** `src/lib/billsReconcile.js` (`billKey`, lowercase + collapse whitespace) versus
`src/lib/billReeval.js:57` (`merchantKey`, which also strips POS prefixes and account numbers via
`plaidNormalize.stripAccountNumber`).

**What happened** A stored bill and the detector's current name for the same merchant could
differ — `"Rogers"` stored, `"Rogers Toronto On"` detected from `"ROGERS 1234 TORONTO ON"`.
`billsReconcile` compared them with its own weaker key, saw no match, and raised BOTH halves. For a
stored bill `{name:"Rogers", origin:"observed", amount:"95.00"}` plus four monthly
`"ROGERS 1234 TORONTO ON"` charges at $95, `buildReconcilePrompts` returned two questions:

> Rogers Toronto On looks like a new regular bill at $95. Add it?
> Rogers at $95 has stopped showing up. Has it ended?

One bill, two questions, pointing opposite ways. For an existing household this was a **first-sync
event**, not a slow drift: the first money meeting after this shipped would ask them to add bills
they already have, and in the same agenda ask them to confirm those same bills had ended. The Meet
screen does not render `agenda.questions`, but `agendaToText` sends them to the facilitator, so a
`beta_founder` household with AI on would have heard both.

**The fix** `billsReconcile` now decides "same bill" the way the rest of the pipeline does:
`billMatchKeys()` returns the written name, `merchantKey(name)`, and the name main's code produced
for the same descriptor. The detector carries that last one on each detected bill as `legacyName`,
and only when it differs from the display name. `applyBillChange` resolves a change to a stored bill
through the same rule, so an accepted answer updates or removes the bill the household actually has
instead of appending a second copy. No display name changed.

An alias may claim a stored bill only **once**: main's names were lossier than today's (two
different POS merchants both became `"POS PURCHASE"`), so without that guard a second real merchant
would be absorbed into the first and never raised.

**Regression tests** `tests/merchantNameCompat.test.cjs` section (e): assertion **e2** was pinned to
`"appeared,disappeared"` as a characterisation of this defect and now asserts `"(none)"`; **e6.1-6**
run all six fixture descriptors, each stored under the name produced by running origin/main's own
function; **e7** proves a genuinely different merchant is still raised as new, so the fix cannot
silence everything; **e8/e9** cover the POS collision. `tests/billsReconcile.test.cjs` **6k-6o**
cover `applyBillChange`. Each was mutation-checked: removing any part of the fix fails a named
assertion.

**The double count is closed**, in the questions and in the stored data, so the sequencing
constraint this entry used to carry is discharged — 13e and 13f no longer wait on it.

**Still open, separately:** the compatibility layer itself — `stripAccountNumberLegacy`,
`legacyMerchantKey`, and the `legacyName` field — exists only because stored names were never
migrated. It can be removed once stored display names have settled, which needs a migration of
`userBillOverrides` keys and stored bill names, not just the passage of time. The code comments that
say "REMOVE once stored names have settled" point here.

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

---

## 14. A webhook delivery that dies after claiming its event is never retried

**Rating: MEDIUM.** Found in the PR #9 review, 2026-09-23. Not fixed — the fix is a policy
decision about how long a claim may be held.

**Where** `netlify/functions/stripe-webhook.js`, the claim/complete sequence.

**What happens** The `billing_events` insert is the idempotency lock and is claimed *before* the
work, which is correct: two concurrent deliveries of one event cannot both proceed. Completion
then marks the row `processed`, and a thrown error marks it `failed` — and a `failed` row is
allowed to run again.

A delivery that dies *between* those two points marks neither. The row stays `received`. Every
later retry finds a duplicate, sees a status that is not `failed`, and answers `200 {replay:true}`,
so Stripe stops retrying and the work never happens. A Netlify function timeout does exactly this:
the `catch` never runs.

**What a user sees** They paid, Stripe took the money, and their plan never changed. Nothing in
the app reports an error; the ledger row says `received` and looks unremarkable.

**Fix (suggested, not built)** Treat a `received` row older than a few minutes as retryable, the
same way a `failed` row is — the claim is a lock, and a lock nobody released is a crash, not a
success. `attempts` is already on the row to bound it. The number is the decision: too short and
two deliveries overlap, too long and a stuck payment waits.

**Meanwhile** it is recoverable by hand: set that event's `status` to `failed` and Stripe's
"Resend" in the dashboard replays it.

---

## 15. The founding price is kept out of the Billing Portal by a dashboard setting, not by code

**Rating: MEDIUM.** Found in the PR #9 review, 2026-09-23. Not fixed — it cannot be fixed in this
repo alone.

**Where** `netlify/functions/billing.js`, `create_portal_session`.

**What happens** `mayBuyFoundingPrice()` gates the $79.99 founding price at checkout: a profile
without `founder_flag` is refused. The Billing Portal does not go through that gate. It is created
with a customer and a return URL and no `configuration`, so it uses whatever the Stripe dashboard's
default portal configuration allows. If "customers can switch plans" is ever enabled with the
founding price among the listed products, any paying customer can move themselves onto it and keep
it — the eligibility rule is bypassed entirely, permanently, and silently.

`docs/ops/BILLING-SETUP.md` step 4 says to allow only cancellation and payment-method updates,
which is the safe configuration. Nothing enforces that it stays that way, and no test can see it.

**Fix (suggested, not built)** Create an explicit portal configuration with plan switching off,
put its id in `STRIPE_PORTAL_CONFIGURATION_ID`, and pass it on every `create_portal_session`. The
setting is then pinned in an environment variable that a reviewer can read, rather than in a
dashboard toggle nobody looks at. Until then, **verify the portal configuration by hand before
2026-10-26**, and again after any Stripe dashboard change.

---

## 16. `getUserPlan`'s error paths return a different shape from its success path

**Rating: LOW.** Found in the PR #9 review, 2026-09-23.

**Where** `netlify/functions/_lib/auth.js`, the `!data` early return and the outer `catch`.

**What happens** The success path returns `{ plan, entitlement, founder_flag, unlimited, paid,
subscription_status }`. The two failure paths return only `{ plan, founder_flag, unlimited }` (one
of them also `paid: false`). A caller reading `entitlement` gets `undefined` rather than `"free"`.

Harmless today: `unlimited` is the field every existing caller reads, and it is `false` on both
paths, so access still fails closed. It becomes a defect the first time something branches on
`entitlement` and treats `undefined` as anything other than free.

**Fix (suggested, not built)** Return one shape from all three paths, with `entitlement: "free"`
and `paid: false` in the failure cases.

---

## 17. Upgrade CTAs elsewhere in the app do nothing in a native shell

**Rating: MEDIUM.** Found reviewing the upgrade screen, 2026-09-23.

**Where** `src/App.jsx` — `PremiumGate`, `WhatIfSimulator`'s "Upgrade to continue" button, and
`Goals`, all of which call `onUpgrade` → `setShowPaywall(true)`.

**What happens** The paywall render is now gated on `isNativeApp()`, so in the iOS and Android
builds `showPaywall` becomes true and nothing appears. The button is not hidden — it is inert.
This is not new (it was already true on iOS, gated on `isCapacitorIOS()`); widening the gate to
Android widened the dead button with it, which is the correct trade against showing a price in a
build Apple and Google would reject for it.

**What a user sees** A button that looks tappable and does nothing.

**Fix (suggested, not built)** Hide those CTAs in a native shell rather than letting them open
nothing, or give them a native-appropriate destination once the store in-app purchase decision in
`docs/ops/BILLING-SETUP.md` is made. Doing it properly means touching every gated feature surface,
which is a bigger change than the upgrade screen brief.

---

## 18. US pricing is defined but cannot be sold

**Rating: LOW.** Found reviewing the upgrade screen, 2026-09-23.

**Where** `src/lib/pricing.js` (`PRICING.US`) versus `netlify/functions/_lib/billingPlans.js`
(`STRIPE_PRICE_MONTHLY_CAD`, `STRIPE_PRICE_ANNUAL_CAD`, `STRIPE_PRICE_FOUNDING_ANNUAL_CAD`).

**What happens** `PRICING.US` carries $7.99/$59.99 pending review, but the only Stripe price ids
that exist are CAD. The upgrade screen originally passed the profile's country through, so a US
household would have been shown $7.99 and charged $11.99 CAD — a different number from the one it
agreed to. `offeredPlans()` now pins CA and says why, so the screen shows only what can be charged.

**What is left** A US household is shown CAD prices. That is correct rather than wrong — CA is the
launch market — but it is not a US launch. Whoever reviews US pricing also creates the USD price
ids and re-enables the country lookup in `offeredPlans()`; the comment there names the condition.

---

## 19. The success message can be preceded by a flash of the dashboard

**Rating: LOW.** Found reviewing the upgrade screen, 2026-09-23.

**Where** `src/App.jsx`, the billing-return effect and the billing-status fetch.

**What happens** Returning from Stripe, the return effect runs at mount and sets the notice, but
the upgrade screen only renders once the status call has answered. For the moment in between, the
dashboard shows instead. The screen appears by itself when the answer arrives — nothing is lost,
and the message is still read — but the first frame after paying is not the confirmation.

**Fix (suggested, not built)** Render the notice from the shell rather than from inside the
upgrade screen, so it does not wait on the status call.

---

## 20. A household that pays on the web is shown "free" inside the store apps

**Rating: HIGH once billing ships. Not reachable today.** Found by an adversarial review of the
native-launch-parity PR, 2026-09-25.

**Where** `netlify/functions/_lib/planRules.js` (`deriveEntitlement`) against `src/App.jsx`
(`refreshPlanFromProfile`), and `netlify/functions/stripe-webhook.js`.

**What happens** The server's entitlement is the profile rule **OR** a paid `subscriptions` row.
The client's is the profile rule alone, because the browser cannot read `subscriptions`. The
webhook is the only writer of that table and it never touches `profiles.plan`, so paying creates a
row the client cannot see and changes nothing the client reads. Native then has no second chance:
the billing-status call, which is the one signal that would carry `paid`, is deliberately skipped
inside a store app. A household that subscribes on flourishmoney.app — the decision on record is to
sell only on the web — opens the iOS app, is told it is free, and is blocked at two coach messages
a week while the server would have served every one of them.

Nothing can reach this today: `BILLING_ENABLED` is unset, so no subscription exists.

**Fix (suggested, not built)** Have the webhook write `profiles.plan` when a subscription becomes
active and clear it when it lapses, so the one row the client already reads carries the answer.
That keeps native free of any billing call. **This must be done before billing is switched on**,
not after — the failure is silent and it lands on the people who have just paid.

---

## 21. The coach's free limit is enforced on the client but not on the server

**Rating: MEDIUM.** Found by the same review.

**Where** `netlify/functions/_lib/auth.js` (`ENFORCE_PLAN_LIMITS`, default false) against
`src/App.jsx`.

**What happens** With the flag off the server applies only a 50/day abuse ceiling, so it would
serve a free user far more than the two messages a week the client stops them at. The direction is
safe — the client shows *less* than the server allows, never more — but the two are not the same
rule, and which one is true depends on an environment variable nobody has verified in production.
Defect 17 already records that the production value is unconfirmed.

**Fix (suggested, not built)** Decide whether the free limit is real, then either turn the flag on
or drop the client-side cap. Turning it on also makes defect 22 live.

---

## 22. A 429 from the coach can arrive while the device still thinks it has messages left

**Rating: MEDIUM.** Found by the same review.

**Where** `netlify/functions/_lib/coachLimits.js` against `src/App.jsx`.

**What happens** The server counts coach messages per user in the database; the client counts them
per device in `localStorage`. Send two messages on the web, then open the app: the device's counter
is zero, the server's is two, and the first message in the app comes back 429. The user is told the
limit is reached by a message they did not expect, having sent nothing from that device.

The store apps no longer print the server's copy for this (it sells Plus), so what shows is our own
line — but the underlying disagreement between the two counters is unchanged.

**Fix (suggested, not built)** Let the server's count be the one that matters and have the client
read it, rather than keeping a second tally per device.

---

## 23. Account deletion leaves the payment processor's records behind

**Rating: MEDIUM now, HIGH once billing ships.** Found by the same review.

**Where** `netlify/functions/plaid.js`, the `delete_account` action — which contains no Stripe
call at all — against `netlify/functions/billing.js`, which creates a Stripe customer carrying the
user's email.

**What happens** Deleting the account removes everything in Supabase and the auth user, but the
Stripe customer object and its invoices survive, and **an active subscription is never cancelled**,
so someone who deletes their account while subscribed would keep being charged for a product they
can no longer sign in to. The `/delete-account` page now says the processor keeps its own billing
record, so the page is no longer untrue — but the billing itself is the real problem.

Not reachable today: `BILLING_ENABLED` is unset, so there are no customers and no subscriptions.

**Fix (suggested, not built)** Cancel the subscription and delete the Stripe customer inside
`delete_account`, before the auth user goes, and record the failure as critical if it does not
succeed. **Before billing is switched on.**

---

## 24. The account-deletion page states no retention period

**Rating: MEDIUM.** Found by the same review.

**Where** `src/App.jsx`, the `DeleteAccount` page, "What is kept".

**What happens** Google Play's account-deletion requirement expects the page to say what is
retained **and for how long**. The page says payment records are kept "only for as long as the law
requires" and gives no period. That is honest but not specific, and a reviewer may ask.

**Fix (needs the founder, not a developer)** State the actual retention period — the figure
depends on Canadian and US tax record-keeping rules and on which of them the company is bound by,
which is a legal statement for the founder to make rather than a number to infer from code.

---

## 25. A partial deletion tells the user nothing was changed

**Rating: MEDIUM.** Found by the same review. Pre-existing; the new public page now points at it.

**Where** `src/App.jsx`, `deleteAllData`, and the step ordering in `delete_account`.

**What happens** The handler deletes the data tables first and the auth user last. If the auth
delete fails, the client says "Your account could not be fully deleted, so nothing was changed" —
but the accounts, transactions, bills, goals and meeting records are already gone. The account
still exists, the data does not, and the message says the opposite. The `/delete-account` page's
"The deletion happens immediately" makes the contradiction public.

**Fix (suggested, not built)** Either delete the auth user first, or report the true state: the
account still exists, the data is gone, and here is what to do next.

---

## 26. A trial can be self-granted on the client, and the invented start date outlives it

**Rating: MEDIUM.** Found by the same review.

**Where** `src/lib/usageLimits.js` (`startTrialIfEligible`) and `src/App.jsx`
(`refreshPlanFromProfile`).

**What happens** `startTrialIfEligible()` writes a trial start date and sets the plan at boot,
from local storage alone, for anyone whose device is clean — signed in or not. The next successful
profile read corrects the plan, so the grant itself is window-scoped. The date is not corrected:
the profile read only ever *writes* the trial dates it finds and never clears one it does not, so a
server row with no trial leaves the invented date in place. On the web that user then sees the
expired-trial upgrade bar for a trial they never had.

**Fix (suggested, not built)** Clear the cached trial dates when the profile has none, and let the
server be the only thing that starts a trial.

---

## 27. A missing profiles row lets the cached plan survive, and sync carries it between devices

**Rating: MEDIUM.** Found by the same review.

**Where** `src/App.jsx` (`refreshPlanFromProfile` returns early when there is no row) and
`src/lib/persistence.js` (`flourish_plan` is on the sync allow-list).

**What happens** With no profiles row the reconcile returns without setting anything, so whatever
plan is cached locally stands — and because the key is synced, it is uploaded and restored onto
every other device. The server treats a missing row as free. Narrow: it needs the new-user trigger
to have not fired, or the select to return nothing.

**Fix (suggested, not built)** Treat a missing row as free explicitly, and take the plan off the
sync allow-list — it is a cache of a server answer, not user data.

---

## 28. The trial clock is the device clock

**Rating: LOW.** Found by the same review.

**Where** `src/lib/usageLimits.js`, `getTrialDaysLeft`.

**What happens** Trial expiry is measured against `Date.now()`, so moving the device clock back
keeps the local feature gates open after the server's trial has ended. `isPremium` still comes from
the server whenever there is a network, so the main gates hold and the coach's server-side limits
are unaffected. Requires deliberate tampering for a small prize.

**Fix (suggested, not built)** Use the server's clock, taken from a response header, for the trial
comparison.

---

## 29. An expected item is not replaced when the real money arrives

**Rating: LOW.** Found in the review round on the forecast-edits branch.

**Where** `src/lib/forecastEdits.js`, `expectedOccurrences`.

**What happens** Income and bill projections give way to the real deposit or payment when it lands
(`arrivedDeposit`, `billArrived`). Items added with "Add expected money in or out" have no such
check, because a name the household typed ("Tax refund") does not reliably match what the bank
shows. A refund that arrives early is counted twice until its date passes. The sheet says so: "Once
the money has moved, delete or edit this item."

**Fix (suggested, not built)** Offer "Did this arrive?" on an expected item when a deposit or charge
within 10% of its amount lands within a week of its date.

---

## 30. Forecast corrections are shared only by a household that shares one login

**Rating: LOW (a limit, not a regression).**

**Where** `appData.forecastEdits`, `appData.depositDecisions`, `appData.depositRules`.

**What happens** The corrections are household data in `appData`, synced and exported with incomes
and bills, so everyone on the household's login sees the same forecast. There is no separate
partner login yet (`HOUSEHOLD_ENABLED` is false and `user_data` is one row per user), so a partner
on their own account would not see them. When shared household data lands, these three keys move
with it; no change to them is needed.

---

## 31. The Financial Timeline is not rendered anywhere

**Rating: LOW.**

**Where** `src/App.jsx`, `FinancialTimeline`.

**What happens** The component carries the same tappable deposit and bill rows and edit sheet as
Today and Watch, but no screen renders it, so those rows are unreachable. Either render it or
delete it.

---

## 32. The signup endpoint has no rate limit and does not verify the email address

**FIXED on the open-signup branch.** A self-serve signup is now created unconfirmed and must open
Supabase's confirmation email (sent through the project's SMTP) before its token is accepted;
`getUserFromRequest` refuses an unconfirmed user, so every function is covered. The rate limit is
below. Kept here for the record.

**Rating: MEDIUM while signup is invite-only, HIGH the day OPEN_SIGNUP is turned on.** Found while
building the open door (item 5 of the open-signup work). Reported, not fixed, deliberately: the guards
that exist were in scope to preserve, not to redesign.

**Where** `netlify/functions/beta.js`, the `signup` action.

**What happens** There is no per-IP limit, no CAPTCHA and no proof-of-work on signup, and the account
is created with `email_confirm: true`, so any syntactically valid address works, including one nobody
owns. Today an invite code is the brake. With the door open, one script can create unlimited real,
immediately usable accounts from one machine.

Each of those accounts is a 14-day trial, and `planRules.js` treats an unexpired trial as
**unlimited**, so the only per-account brake on coach spend is `CHAT_DAILY_CEILING` (50 a day). The
only cross-account brake is the per-IP coach cap (100 a day), which a mobile network, a VPN or a
handful of hosts sidesteps.

**Fix (suggested, not built)** A per-IP signup cap in Netlify Blobs, the same shape as
`coach_ip_usage`; or require a real email round trip (`email_confirm: false` plus a confirmation
link) before the account can call `/api/coach`.

---

## 33b. Signup rate limit

**FIXED on the open-signup branch.** 5 attempts per IP per hour and 3 per email per day, counted in
Netlify Blobs (`netlify/functions/_lib/signupLimit.js`), covering both signup and the confirmation
resend, failing closed when the store is unreachable. Recorded here because defect 32 named it.

---

## 33. A statement upload costs many chat messages but is metered as one

**Rating: MEDIUM.** Same review.

**Where** `src/App.jsx` (the statement parser prompt, sent to `/api/coach`) against
`netlify/functions/coach.js`.

**What happens** Statement import goes through `/api/coach`, so it is authenticated, fails closed and
counts against the same ceilings. But it sends a whole statement, so one upload can cost a large
multiple of a chat message in tokens while costing exactly 1 against the 50-a-day ceiling. A stranger
with an account can burn the Anthropic budget far faster by uploading documents than by chatting, and
the ceiling will not notice.

**Fix (suggested, not built)** Weight the counter by the size of what is sent rather than counting
requests: about one message per 10 KB of body, so a full-size upload (the body cap is 100 KB) costs
10 of the 50 daily messages instead of 1, and an ordinary chat turn still costs 1.

---

## 34. A linked bank keeps billing after the trial is abandoned

**Rating: MEDIUM (cost, not correctness).** Same review.

**Where** Plaid Items created through `netlify/functions/plaid.js` (`create_link_token` is
auth-required, so an account is needed first).

**What happens** Plaid bills per Item per month for as long as the access token exists.
`docs/ops/UNIT-ECONOMICS-SUMMARY.md` puts that at 0.30 USD per connected account per month plus a
0.10 USD allowance, at 2.5 connected accounts for a typical linking user: about **0.85 USD per linked
user per month**. `/item/remove` is called on unlink and on account deletion, and on no other path, so
a trial that links a bank, never converts and never deletes its account keeps costing that every month
indefinitely. Open signup multiplies the number of such accounts.

**Fix (suggested, not built)** A scheduled sweep that removes Items for accounts whose trial ended
without converting and which have not opened the app in N days.

---

## 35. The Android app cannot reach coach, plaid or billing: their CORS lists omit its origin

**FIXED on the open-signup branch.** All five functions now share one allow-list
(`netlify/functions/_lib/cors.js`), which includes the Android shell origin. Kept here for the record.

**Rating was: HIGH for Android, which has not shipped yet.** Found by the review round on the
open-signup work, which fixed the signup half of it.

**Where** `ALLOWED_ORIGINS` in `netlify/functions/coach.js`, `plaid.js` and `billing.js`.

**What happens** Capacitor 8 defaults `androidScheme` to `https` and `capacitor.config.json` does not
override it, so the Android shell serves from `https://localhost` and its requests carry
`Origin: https://localhost`. Every function's allow-list names `capacitor://localhost` (iOS) and not
that, so each falls back to the production origin and the browser refuses the response. The same gap
made `API_BASE` resolve to `""` on Android, which sent every call to the WebView's own server; that
half is fixed on this branch, and `beta.js` now allows the Android origin.

Nothing has been noticed because Android has never been released: versionCode 4 was built and never
uploaded.

**Fix (suggested, not built)** Add `"https://localhost"` to the three remaining allow-lists, and test
one call per function from a real Android build before the first Play upload.


---

## 36. Signup answers email_exists, and an unconfirmed address is squatted forever

**Rating: MEDIUM.** Found by the review round on the open-signup PR. Reported, not fixed: closing it
properly changes what a person is told when they have simply forgotten they have an account, which is
a product decision rather than a patch.

**Where** `netlify/functions/beta.js`, the `signup` action.

**What happens** Once the door is open, anyone can POST an address with no code and learn from
`email_exists` whether it has an account. Worse, a self-serve signup for `victim@example.com` creates
an unconfirmed account that is never purged, so the real owner is later told the address is already
registered and cannot take it.

**Fix (suggested, not built)** Answer the same way whether or not the address exists ("check your
email"), and delete unconfirmed accounts after a day or two so a squat expires.

---

## 37. Rate-limit buckets are fixed windows, and their keys are never expired

**Rating: LOW.** Same review.

**Where** `netlify/functions/_lib/signupLimit.js`.

**What happens** The hour and day buckets are calendar-aligned, so 5 attempts at 10:59 and 5 more at
11:00 are 10 in one second. The keys are also written to Netlify Blobs and never deleted, so the store
grows by one small entry per IP-hour and per inbox-day forever. Neither matters at this scale, and a
sliding window costs more than the abuse it would prevent here.

**Fix (suggested, not built)** A sliding window, and a scheduled sweep of keys older than two days.

---

## 38. An unconfirmed account's trial clock is already running

**Rating: LOW.** Same review.

**Where** `supabase/migrations/0007_trial_only_signups.sql`, `handle_new_user`.

**What happens** The trigger sets `trial_started_at` and `trial_ends_at` when the auth user is created,
which for a self-serve signup is before the address is confirmed. Someone who confirms three days
later has three days less trial.

**Fix (suggested, not built)** Start the trial when the address is confirmed rather than when the row
is created.

---

## 39. A recategorised merchant reads as a week of restraint

**Rating: MEDIUM.** Adversarial review of the weekly-review work (PR #28).

**Where** `src/lib/weeklyReview.js`, `categoryPaceDeltas`.

**What happens** The comparison is per category, and nothing reconciles a category that disappears
against one that appears. If a household (or a Plaid recategorisation) moves a regular merchant from
"Coffee & Dining" to "Restaurants" mid-month, the same $300 of spending is still there, but the
meeting says "Coffee & Dining ran $300.00 below your usual pace." The money did not move; the label
did. The three-week habit rule keeps the NEW category out for three weeks, so only the false
congratulation shows.

**Fix (suggested, not built)** Compare the disappearance against the appearance: when a category
falls to zero and a category with no history appears at about the same size in the same week, treat
them as one and say nothing. Or read the category overrides and follow the rename.

---

## 40. The copy gate has no escape hatch

**Rating: LOW.** Same review.

**Where** `tests/forecastEdits.test.cjs`, section 9.

**What happens** The gate rejects `\bengines?\b` in every string in `src/`, with no allow-list. A
future telemetry key, CSS class or data attribute spelled `"tile-engine"` fails the build; the same
name spelled `"tile_engine"` passes, because the word boundary falls differently. There is no way to
opt a legitimate string out short of editing the test.

**Fix (suggested, not built)** An allow-list keyed on the exact string, or restrict the rule to
strings that are rendered (JSX text and the props that carry copy) rather than every literal.

---

## 41. The money meeting has no way to say a week went badly

**Rating: LOW.** Same review.

**Where** `src/lib/meetingAgenda.js`, `src/lib/weeklyReview.js`.

**What happens** A week that cost more than usual is filed under "changes", which is right, but there
is nothing that treats a run of heavy weeks, or a category climbing three weeks in a row, as anything
other than this week against an average that is itself rising. The trend hides inside the baseline.

**Fix (suggested, not built)** Compare the four baseline weeks against each other as well as against
this one, and surface a direction rather than only a difference.

---

## 42. The Meet screen does not label a win as a win

**Rating: LOW.** Second adversarial review of PR #28.

**Where** `src/App.jsx`, `MeetAgenda` — `items` flattens `wins`, `changes`, `risks`, `upcoming` and
`progress` into one unlabelled bullet list under "Flourish noticed".

**What happens** `meetingAgenda.js` routes the week's figure by its sign so a week that cost more
than usual is a change rather than a win, which is what the facilitator receives under the `Wins:`
and `Changes:` headings. On screen there are no headings, so the distinction the routing exists to
make is invisible to the household: a good week and a bad one read as the same bullet.

**Fix (suggested, not built)** Give the card the same two groups the agenda has, or at least a
marker on the items that are wins.

---

## 43. The demo's category breakdown is not pinned

**Rating: LOW.** Same review.

**Where** `src/lib/demoFixture.js`, `tests/demoFixtureUS.test.cjs`.

**What happens** The published demo signature pins safe-to-spend, the daily figure, the next
deposit, the committed bills, the buffer, the savings allocation and the balance. It pins nothing
about the category breakdown, so the eleven days of history added in PR #28 moved the demo's largest
spending category from Shopping to Groceries, and its totals by 37%, with the gate green throughout.
Any store screenshot of a category breakdown or a "this month" total is therefore unguarded.

**Fix (suggested, not built)** Extend the signature with the top three categories and the 30-day
discretionary total.

---

## 44. "Usual" is a mean, so one unusual week still bends it

**Rating: MEDIUM.** Fourth adversarial review of PR #28.

**Where** `src/lib/weeklyReview.js`, `_scan` / `weekVersusUsual` / `categoryPaceDeltas`.

**What happens** Three baseline weeks must now carry real spending before there is a "usual" at all,
which stops one purchase speaking for a month. It does not stop one week speaking louder than the
rest: three weeks carrying a dollar on two days each is enough to open the window, and a single
$2,000 week inside it then sets "usual" to about $500. A $300 week is reported as $200 under.

**Fix (suggested, not built)** Use the median of the covered weeks rather than the mean, or drop the
highest and lowest before averaging. Either needs its own tests: the median changes what "usual"
means for every household, not only the skewed ones.

---

## 45. The copy gate polices replies, not everything a household reads from the server

**Rating: LOW.** Same review.

**Where** `tests/forecastEdits.test.cjs`, section 9.

**What happens** The rule reads every `message:`/`error:` value in `netlify/functions` and every
sentence in the three modules that write household prose. A fourth module that starts returning
prose, or a reply handed back under a different key, is outside it until someone adds the file to
`PROSE_FILES`. Model prompts are excluded on purpose, so a household-facing string written inside
`coachPrompt.js` would also be missed.

**Fix (suggested, not built)** Mark household copy at the source — a `copy/` module, or a naming
convention the walker can key on — instead of a list of files the walker has to be told about.

---

## 46. The goal savings reminders can list amounts that do not add up to "Goal savings"

**Rating: MEDIUM.** Found in the review of PR #36 (the budget-screen crash fixes). The review of
PR #38 found the "0" case, which is the most common. Both reviews were on 2026-09-29.

**Where** `src/App.jsx:7419` (`goalsMo` in `generateBudgetSuggestions`), against the reminder rows in
Goals → Budget (`:9182`, "Saving for N goals") and Do → Budget (`BudgetScreen`, `:14839`, "Saving
toward N goals"). The goal filters at `:7415`, `:9118` and `:14326` read only `g.saved`.

**What happens** `goalsMo` counts a goal's monthly amount when it is above $0, and otherwise uses
the remaining amount over 24 months. The two reminders work each row out differently:

- Goals → Budget uses `parseFloat(g.monthly || fallback).toFixed(0)`, so the fallback only applies
  when the field is empty.
- Do → Budget uses `parseFloat(g.monthly || 0) || fallback`, then `Math.round`.

Rendered with both screens:

- **A monthly amount of "0".** Goals → Budget lists "Car $0/mo" and Do → Budget lists "Car $100/mo",
  under "Goal savings -$100/mo". The Coach's `add_goal` (`:11834`) writes "0" whenever it passes 0
  or leaves the amount out.
- **A monthly amount of "-50".** Both list "Trip $-50/mo" under "Goal savings -$100/mo". The My Goals
  form's "Monthly $ contribution" field (`:8650`) is `type="number"` with no minimum, and both
  `add_goal` and `update_goal` (`:11841`) keep the sign.
- **Three goals at $33.40 a month.** Both list $33 each ($99) under "Goal savings -$100/mo".
- **A reached goal saved in the older shape** (`current` instead of `saved`). It is still counted and
  listed ("Fund $21/mo · 0% saved"). My Goals reads `saved||current` (`:8523`, `:8547`, `:9921`) and
  shows it complete.
- **Formatting.** Both reminders print amounts without grouping ("House $2000/mo") and put the
  minus sign after the dollar sign ("$-50"), unlike `formatMoney`.

Which goals are listed always matches `goalsMo`, because the filter is the same.

**Fix (suggested, not built)** Have `generateBudgetSuggestions` return each goal it counted with
the monthly amount it used, and render those rows with `formatMoney` in both reminders. Read
`saved ?? current` in the one filter. Refuse a negative monthly amount where it is entered.

---

## 47. Do → Budget keeps a "Save ~$X per month" block that can never show

**Rating: LOW.** Same review.

**Where** `src/App.jsx:14824`, `BudgetScreen`, "Where you could cut back".

**What happens** The row renders `potential > 0 && "Save ~$" + potential + " per month"`, but this
screen's list (`:14361`) returns `{ cat, spent, limit, over }` and never sets `potential`, so the
block never renders. Nothing wrong is on screen. It is the projection that was taken out of Goals →
Budget on 2026-09-29, because one month is not a monthly saving. Here it is one careless edit away
from coming back.

**Fix (suggested, not built)** Delete the block.

---

## 48. The undeclared-name check misses a name that is only assigned

**Rating: LOW.** Same review.

**Where** `tests/undeclaredNames.test.cjs:46`, the `ReferencedIdentifier` visitor.

**What happens** It checks every name that is read. A name that is only written is never visited,
yet each of these throws `ReferenceError: x is not defined` in an ES module:

- `x = 1`
- `x += 1`
- `[a, b] = pair`
- `({ a } = obj)`

`x++` and `for (x of xs)` are caught. None of these occur in `src/` today.

**Fix (suggested, not built)** Also check Babel's list of the program's unbound names,
`programPath.scope.globals`, against the same allowlist. That list includes assignment targets.

---

## 49. The render suite defines five `import.meta.env` keys by name and leans on undeclared packages

**Rating: LOW.** Same review.

**Where** `tests/budgetGoalsRender.test.cjs:50-54` (`loadApp()`), and `package.json`
devDependencies.

**What happens**

- `loadApp()` defines, one by one, the five `import.meta.env.*` keys App.jsx reads today.
  esbuild's CJS output empties `import.meta`, so the first new `import.meta.env.X` that App.jsx
  reads while it loads or renders fails the suite with "Cannot read properties of undefined
  (reading 'X')". That error says nothing about budgets.
- The suite requires `esbuild`, and `undeclaredNames.test.cjs` requires `@babel/parser` and
  `@babel/traverse`. None of the three is in `package.json`. They are installed only because
  `vite` and `@vitejs/plugin-react` depend on them.

**Fix (suggested, not built)** Define `import.meta.env` as one object
(`define: { "import.meta.env": JSON.stringify({ … }) }`), so an unknown key reads as `undefined`.
Declare the three packages as devDependencies.

---

## 50. The layout sweep never measures the budget screens of a household that has a budget

**Rating: LOW.** Found while verifying PR #36 in the app, 2026-09-29.

**Where** `tests/layout.browser.test.cjs:214`, `VIEWS`.

**What happens**

- The sweep walks the demo, and the demo has no budgets or goals. So "Do/Budget" (`:220`) measures
  only the "Build Your Budget Plan" prompt, never the tracking view: the overall bar, "Where you
  could cut back", the goal reminder and the category rows.
- Goals → Budget is not in `VIEWS` at all. That is how its Edit button stayed 28px tall until it
  was raised to 44px on 2026-09-29. Adding the view today would fail at once on entry 52: the Edit
  row at 320px and 130% text.
- Nothing else on either view has been measured by the sweep.

**Fix (suggested, not built)** Fix entry 52, then add views that seed a budget and a goal into the
demo and open Do → Budget and Do → Goals → Budget.

---

## 51. Goals → Budget's Edit button does nothing

**Rating: MEDIUM.** The one review round of PR #38, 2026-09-29.

**Where** `src/App.jsx:9206-9213`: the Edit button beside "Monthly Category Budgets" in `Goals`,
Budget tab.

**What happens**

- Tapping it only writes `_budgetEditOpen: true` and `_budgetEditSeed` into app data (`:9210`).
  Nothing in `src/` reads either key, so the screen does not change. The review tapped it in
  Chromium to confirm.
- For a signed-in household, `buildDbBlob` (`src/lib/persistence.js:110`) spreads all of app data
  into the synced blob, so each tap also writes the two unused keys to the server.
- The button has been 44px tall since 2026-09-29: a full-size target that does nothing.

**Fix (suggested, not built)** Open Do → Budget's plan editor from it, or remove it.

---

## 52. Goals → Budget's Edit row puts the button against its title at 320px and 130% text

**Rating: MEDIUM.** Same review.

**Where** `src/App.jsx:9204-9213`: the "Monthly Category Budgets" header row in `Goals`, Budget tab.

**What happens**

- The row is `display:flex; justifyContent:space-between`, with no wrap and no gap. That is the
  pattern `docs/design/LAYOUT-RULES.md` rule 3 exists to replace.
- Measured with the layout suite's own `SCAN` on the built app, at 320px and 130% text, the title
  wraps to two lines and its box ends where the button starts: `text-control 0px "Monthly Category
  Budgets" vs "Edit"`, under rule 2's 12px.
- The other seven sweep sizes clear it (29–143px), and the button is 44px tall at all eight.

**Fix (suggested, not built)** Build the row with `row()`, `rowText()` and `rowControl()`.
`rowControl` already carries the 44px minimum height.

---

## 53. Goals → Budget counts spending that Do → Budget leaves out

**Rating: MEDIUM.** Same review.

**Where** `src/App.jsx:9134-9135` (`monthSpend` in `Goals`, Budget tab), against `BudgetScreen`'s
`monthSpend` (`:14345`) and the Activity plan card (`:7575`).

**What happens**

- Goals → Budget adds up every positive transaction this month.
- The other two leave out the Transfer, Income and Fees categories, and any transaction whose name
  contains one of `CC_PAYMENT_KEYWORDS` (`src/lib/financialCalculations.js:843`). That list includes
  a bare "autopay".
- So the two budget screens can disagree about the same budget. Rendered with a $20 Subscriptions
  budget and a $30 "Spotify Autopay" charge:
  - Goals → Budget says "Subscriptions $10 over budget here this month", and its row reads "$30 / $20
    ⚠️ $10 over".
  - Do → Budget says "Subscriptions $0 / $20 … $20 left".
- Do → Budget is the one that is wrong here: a subscription paid by autopay is spending, not a card
  payment.

**Fix (suggested, not built)** Write one helper for "this month's spending by category" and use it
on all three screens. Recognise a card payment by more than a fragment of its name.

---

## 54. The two budget screens label the same things differently

**Rating: LOW.** Same review.

**Where** `src/App.jsx`, the Goals Budget tab (`:9164`, `:9192`, `:9196`) against `BudgetScreen`
(`:14437`, `:14816`, `:14821`).

**What happens** Since 2026-09-29 the two screens show the same figures, but they name them
differently:

| Goals → Budget | Do → Budget |
|---|---|
| "Available for spending" | "Available to spend" |
| "Where you could save" | "Where you could cut back" |
| "over budget here this month" | "over budget this month" |

The owner chose the third wording on 2026-09-29.

**Fix (suggested, not built)** Choose one set of labels and use it on both screens.

---

## 55. Goals → Budget works out goal savings a second time for its "Goal savings" line

**Rating: LOW.** Same review.

**Where** `src/App.jsx:9119`, `localGoalsMo` in `Goals`, Budget tab.

**What happens** `localGoalsMo` re-implements the `goalsMo` that `generateBudgetSuggestions`
already returns (`:7414-7419`). The "Goal savings" line and the reminder's condition use the local
copy. "Available for spending" uses `discret`, which subtracts the engine's copy. The two agree
today. If either one changes, the line stops being the amount that was subtracted.

**Fix (suggested, not built)** Take `goalsMo` from `generateBudgetSuggestions` and delete
`localGoalsMo`.

---

## 56. "100% used" beside a category that is over its budget

**Rating: LOW.** Same review.

**Where** `src/App.jsx:9222` (Goals → Budget) and `:14866` (Do → Budget, "Category Breakdown").

**What happens** Both screens cap the percentage label at 100, not just the bar. A category at $150
of $100 reads "100% used" next to "$50 over".

**Fix (suggested, not built)** Cap the bar's width but show the real percentage ("150% used").

---

## 57. When goals take more than is left, the budget breakdown does not add up

**Rating: LOW.** Same review.

**Where** `src/App.jsx:7423` (`discret = Math.max(0, …)`). It shows in Goals → Budget's "Your Budget
Breakdown" (`:9157-9164`) and in Do → Budget's collapsed "How that is worked out" (`:14442-14445`).

**What happens** Rendered with $1,000 a month gross pay and a $2,000-a-month goal, Goals → Budget
reads:

- Take-home $820/mo
- Savings target -$82/mo
- Goal savings -$2,000/mo
- Available for spending $0/mo

Those lines do not add up to $0, and nothing says that the goals come to $1,262 a month more than is
left. Do → Budget shows "$0/mo" above the same lines.

**Fix (suggested, not built)** When goal savings exceed what is left, say so and show the shortfall.

---

## 58. Do → Budget formats its figures in the browser's language

**Rating: LOW.** Same review.

**Where** `src/App.jsx:14439` ("Available to spend") and `:14442` (the "Take-home" line), in
`BudgetScreen`.

**What happens** Both figures use a bare `toLocaleString()`, which follows the browser's language.
In a French-Canadian browser, "Available to spend" reads "$1 668", while Goals → Budget shows "$1,668"
through `formatMoney`.

**Fix (suggested, not built)** Use `formatMoney`.

## 59. Dynamic Type stops at 160%, and the tab bar labels are 11px

**Rating: LOW.** Round-3 review of 37ada0f (ChatGPT and Grok). Logged, not fixed.

**Where** `src/lib/textScale.js` caps the scale it applies from the system text size at 160%; the
bottom tab bar labels in `src/App.jsx` are `fontSize:11` (marked SMALL_TEXT_OK).

**What happens** A household using the largest accessibility text sizes gets 160% and no more, and
the tab labels stay at 11px whatever the setting.

**Fix (suggested, not built)** Raise or remove the cap once the layout sweep covers the larger
sizes, and let the tab labels scale with the rest of the type.

## 60. The Supabase RLS policies are not all in the repository

**Rating: MEDIUM (unverified).** Round-3 review of 37ada0f. Logged, not fixed.

**Where** `supabase/migrations/`. Some tables the functions read and write have policies created
outside the migrations, so the repository cannot show what the live database enforces.

**What happens** Nothing observed. The risk is that a policy differs from what the code assumes and
no review can see it.

**Fix (suggested, not built)** Export the live policies (names and definitions, no data), compare
them with what the code expects, and commit them as a migration.

## 61. Revoking the bank link at Plaid is best-effort when an account is deleted

**Rating: LOW, by design.** Round-3 review of 37ada0f. Logged, not fixed.

**Where** `netlify/functions/plaid.js`, `delete_account`, the `/item/remove` loop.

**What happens** If Plaid is down, the account and all of Flourish's copies are still deleted, but
the item may stay active at Plaid until it expires. This is deliberate: a Plaid outage must not trap
someone in an account they cannot delete. The failure is recorded as `plaid_remove`.

**Fix (suggested, not built)** Queue failed revocations and retry them server-side after the
account is gone.
