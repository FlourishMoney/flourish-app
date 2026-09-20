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
