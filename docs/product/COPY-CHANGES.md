# Flourish: Focus and Copy Changes (revised)

Handoff 2026-09-03, amended the same day with four strategic changes: coach role, preserve product intelligence, Canada-first not Canada-only, Meet as a data-driven signature feature. Status: strategy and coach rules approved 2026-09-03. No code has been changed. The project's App.jsx is from 2026-03-29 and is older than the working copy; verify against the working copy before implementing. Line numbers and 'Current' copy quotes come from the stale March App.jsx and are orientation only; resolve every location from the current working repo.

## 1. Product promise and focus

Flourish tells you what your money means, what needs your attention, and what to do next.

Canada first. An AI money coach for overwhelmed households. Flourish's deterministic engines (safe-spend, forecast, behaviour, autopilot, health score, decision engine, debt, retirement, What-If) are the only source of financial figures. The coach turns those figures into understanding and decisions. The experience orbits three loops: a daily safe-to-spend number that gets people to open the app, a weekly money meeting that makes it useful to a household, and coaching that reduces the thinking burden. Planning engines help them change their future. Kids parked; family mode later as an add-on. Five tabs: Today, Watch, Do, Learn, Meet. Trust posture: read-only, no money movement, AI can be turned off, no pretending to be a licensed adviser.

## 2. Voice rules (apply everywhere)

Direct: say the thing in the first sentence. Smart: assume the reader is capable and busy. Canadian in the CA locale: chequing, paycheque, behaviour, centre; CRA, CCB, GST/HST credit, Trillium, RRSP, TFSA, FHSA; RBC, TD, Scotiabank, BMO, CIBC, Tangerine, Simplii, Desjardins, credit unions. US bank and tax terms stay in the US locale strings only, behind the country flag.

Words we stop using in marketing and UI: "financial advice", "advisor", "AI-powered", "crystal ball", "stress-free", "incredible!", "unlock", "leaving money on the table". Words we use: "calculated by Flourish", "your number", "what this means", "what to do next", "your options", "the largest flexible category".

The coach's job in one line: explain, spot patterns, compare options, prioritize, ask, challenge, guide. Never invent a figure; never make a regulated investment, legal or individualized tax recommendation.

Numbers rule: every figure on screen is either engine output or a quote of engine output. The coach may repeat, compare and prioritize numbers Flourish computed. It may not produce one. If a needed number doesn't exist, the coach says so and Flourish builds the engine for it.

Two labels on cards that mix engine output and coach text:
- "Calculated by Flourish" (engine output)
- "Your coach" (AI text)

## 3. Navigation (information architecture only, nothing removed)

NAV (line 10523) and ALL_NAV (line 12313) collapse to five items. Header title map at line 12417 follows.

| id | Old label | New label | What feeds it |
|---|---|---|---|
| home | Today | **Today** | SafeSpendEngine, AutopilotEngine daily plan, Decision Engine top item, health score |
| plan + spend | Plan, Activity | **Watch** | ForecastEngine 14/90-day, Financial Time Machine with What-If overlay, bills, overdraft risk, transactions, BehaviorEngine alerts |
| budget + goals + credit | Budget, Goals | **Do** | Budgets and categories, debt modelling and payoff dates, goals with projections, opportunity detection, retirement tools, credit plan |
| coach | Guidance | **Learn** | Coach conversation over the full engine snapshot, benefit and rule explanations, What-If narration |
| family | Family | **Meet** | Weekly agenda generated from the week's engine outputs; coach as facilitator |

Every existing engine and screen keeps its code. Screens that had their own tab become sections inside the new tab with a segmented control. Kids entry points removed from nav and dashboard; /kids route and code stay for the family add-on.

## 4. Landing page (lines 11040 to 11200), CA locale

| Location | Current | New |
|---|---|---|
| Hero headline | Finally. | **Finally, a number you can trust.** |
| Hero label | Safe to spend today | (keep) |
| Hero sub | After bills · After buffer · From your real balance | **After bills. After a buffer. From your real chequing balance.** |
| Hero footnote | No credit card · Connects RBC, TD, Chase, Wells Fargo + thousands more | **No credit card. Works with the major Canadian banks and most credit unions, or enter numbers yourself.** |
| Trust chips | Bank-level security / CA & US accounts / Live in 60 seconds | **Read-only. We can't move your money.** / **Built in Ontario. PIPEDA compliant.** / **Set up in 60 seconds.** |
| Pain 2 | You tap your card and genuinely don't know if it'll go through. | **You tap your card and don't know if it'll go through.** |
| Pain 3 | You have accounts at 3 different banks and no idea what the real total is. | **Chequing at one bank, Visa at another, savings somewhere else, and no idea what the real total is.** |
| Pain 4 | You've tried budgeting apps before and quit within a week. | **The CCB lands on the 20th and it's gone by the 25th, and you couldn't say where.** |
| How it works 1 | Connect your banks / Plaid securely links RBC, TD, Chase, Wells Fargo... | **Link your accounts, or don't** / **Read-only access to balances and transactions. Your bank login is never stored and Flourish can't move a dollar. Prefer to type it in? That works too.** |
| How it works 2 | See your real number / One safe-to-spend number calculated from... | **See your real number** / **Flourish calculates one safe-to-spend figure from your balance, the bills due before your next paycheque, and a buffer you set.** |
| How it works 3 | Know before you tap / Check it every morning. Stop guessing. Stop dreading. Just know. | **Know what to do next** / **Every morning: your number, one thing to know, one thing you could do. That's the whole habit.** |
| Feature: AI Financial Coach | Ask anything. Get honest, personalised financial advice for Canada & the US. | **A coach that does the thinking with you** / **Flourish does the math. The coach tells you what it means, what needs attention first, and what your options are. It never invents a number and it isn't a licensed adviser.** |
| Feature: All your accounts | RBC, TD, Chase, Wells Fargo, and thousands more — all in one dashboard. | **All your accounts** / **Chequing, savings, credit cards and loans in one view, in Canadian dollars.** |
| Feature: Investment tracking | Know exactly where you stand on RRSP, TFSA, 401k, and more. | **RRSP, TFSA and FHSA in one place** / **Room and balances together, so the next dollar goes where it does the most.** |
| Feature: Bill forecasting | See what's coming before it hits. Never be surprised. | **See 90 days ahead** / **Every bill and paycheque on a timeline. Overdraft risk flagged before it happens. Drag a what-if onto it and watch the line move.** |
| Feature: Goal tracking | Set savings goals and watch them grow with 30-year projections. | **Goals with dates** / **Set a target, see the monthly amount, and the date it lands.** |
| New feature card | (none) | **A weekly money meeting** / **Fifteen minutes. Flourish writes the agenda from your actual week. The coach keeps it calm and about the numbers.** |
| Pricing label | Simple pricing / After free trial / $14.99 | **One plan** / After 14 days free / **one price, matching the Paywall** |
| Pricing features | (six items) | **Linked accounts with live numbers** / **Safe to spend, every day** / **Unlimited coaching** / **Weekly money meeting with agenda and facilitator** / **RRSP, TFSA, FHSA room and benefits explained** / **Bill forecast, Time Machine and overdraft alerts** |
| Final CTA | Start knowing. / No credit card · Takes 60 seconds | **Start knowing.** / **No credit card. Sixty seconds. Nothing leaves your account.** |

## 5. Onboarding (lines 3300 to 4060)

| Location | Current | New |
|---|---|---|
| Step title | Connect your bank | **Link your accounts (optional)** |
| Connect sub | Live transactions unlock AI coaching and real overdraft warnings. | **Read-only. Flourish sees balances and transactions and can't move money. Linked accounts give you live numbers; manual entry works fine to start.** |
| Connect badge | 🔒 Powered by Plaid | **🔒 Read-only connection** |
| Skip button | Skip — enter manually | **Enter it myself** |
| Step title | Your income | **Your paycheques** (CA locale) |
| Step title | Your credit score | **Your credit score (optional)** |
| Done screen | You're all set, {name}! / Here's what Flourish has ready: | **You're set, {name}.** / **Here's what Flourish calculated:** |
| Done item | Debt payoff simulator built — drag to see your date | **Debt payoff date calculated. Drag to see what an extra $50 does.** |
| Done item | No debt tracked — incredible! | **No debt tracked.** |
| Done item | AI coach ready — transactions loading in background | **Coach ready. It works from these numbers; it doesn't invent its own.** |
| Done item | Weekly solo check-in ready / Couples money meeting ready | **Your first money meeting is Sunday. Flourish will write the agenda.** |
| Done CTA | Open My Dashboard → | **Show me today's number →** |

## 6. Today (Dashboard, lines 4522 to 5320)

Structure: one number, one thing to know, one thing you could do, one button. Everything else moves below the fold or into Watch and Do.

| Element | Source | Copy |
|---|---|---|
| Number | SafeSpendEngine | **$84** / **Safe to spend today** / **Calculated by Flourish** |
| Sub | | **Bills before payday and your buffer are already set aside.** (replaces "Spend up to this — stress-free") |
| One thing to know | BehaviorEngine or ForecastEngine, highest priority item | e.g. **Groceries are running $62 above your usual pace this month.** / **Hydro One $184 is due Thursday and takes chequing to −$40.** |
| One thing you could do | Decision Engine or AutopilotEngine top allocation, with engine-computed effect | e.g. **Another $75 to Visa this month moves your payoff date from Aug 2027 to May 2027.** / **Moving $120 from savings on Wednesday covers Hydro with $80 to spare.** |
| Button | | **Explain this →** (opens Learn with the item as context) |
| Estimated note | | **Estimated from what you entered. Link a bank for live numbers.** |
| Breakdown labels | | **In chequing** / **Bills before next paycheque** / **Usual spending** / **= Safe to spend** |
| Overdraft warning | | **Your balance goes negative in {n} days. Tap to see which bill does it.** |
| Health score line | | **Calculated by Flourish from your balances, bills and debts. Not a credit score.** |
| Welcome notif | | **Welcome to Flourish** / **Your Today number is ready. Link a bank whenever you want live numbers, or keep it manual.** |

Autopilot card, Decision Engine card, opportunity card and Wrapped stay; they become the sources for the two "one thing" slots and the rest sits below in the existing bento.

## 7. Watch (Plan Ahead + Transactions + Time Machine)

| Location | Current | New |
|---|---|---|
| Header | Plan Ahead / Your financial crystal ball | **Watch** / **The next 90 days. What's coming in, what's going out, and what happens if.** |
| Time Machine title | ⏳ Financial Time Machine | **Time Machine** / sub: **Drag a what-if onto your forecast. Flourish recalculates the line.** |
| What-if prompt | What if I… | **What if I…** (keep) |
| Transactions CTA | Ask Coach | **Explain this** |
| Empty state | No transactions yet | **No transactions yet. Link a bank or add one by hand.** |
| Forecast risk rows | | **Thu 12: Hydro One $184 takes you to −$62.** (date, bill, engine result) |

What-If Simulator: verify before touching. The project's App.jsx (uploaded 2026-03-29, line 1493) asks the model to return cashImpact, savingsDelay, healthScoreDelta and verdict. Amanda's current working copy reportedly computes these in JavaScript (simulatePurchaseImpact, calculateScenarioVerdict, "DO NOT CHANGE THESE NUMBERS") and asks the model for prose fields only, which is the desired architecture. Neither project copy (App.jsx, App.jsx.bak) contains those functions, so the project copy is stale. Action: diff the working copy against the project copy first. If the working copy already computes the figures outside the AI, leave that flow intact; only the header copy above changes. Do not re-scope on the assumption that it is broken.

## 8. Do (Budget + Goals + Credit)

| Location | Current | New |
|---|---|---|
| Header | Goals & Wealth | **Do** / **Budget, debts, goals, retirement. Amounts and dates, nothing vague.** |
| Debt section | Debt (avalanche order) / Avalanche method: pay minimums on all, attack highest APR first. Saves the most interest. | **Debts, highest rate first** / **Minimums on everything, extra on the highest rate. Payoff dates below are calculated by Flourish; drag the extra payment to move them.** |
| No debts | 🎉 No debts tracked — incredible! | **No debts tracked.** |
| Opportunities card | (existing) | Title **Room Flourish found** / each row keeps its engine amount: **Subscriptions: 6 recurring, $94/mo. Cancelling two you haven't used since June frees $31.** |
| Credit header | Credit Score / Estimated from your financial behaviour | **Credit** / **Estimated from your payment and utilization patterns. Not your bureau score.** |
| Credit gate | Full credit score breakdown, factor analysis, and a personalized improvement plan. | **Factor-by-factor breakdown and a plan with amounts and dates. Calculated by Flourish, explained by your coach.** |

## 9. Learn (AI Coach, lines 9640 to 9760)

Welcome message (lines 9650 and 9661):

Current: Hey! I'm your Flourish AI Coach 👋 I can see your spending patterns, balances, and financial data. What would you like to work on today?

New: **I'm your Flourish coach. I work from the numbers Flourish has calculated: your safe-to-spend, forecast, spending patterns, debts and goals. I'll tell you what they mean, what needs attention first, and what your options are. I don't move money and I'm not a licensed adviser. Where do you want to start?**

Footer under every coach reply (new element):
**Figures are Flourish calculations from your data. Not investment, legal or tax advice.**

Free-limit gate (line 12304):
Current: You've used your 5 free messages. Upgrade to Flourish Plus for unlimited coaching.
New: **That's your five free coaching messages this month. Plus gives you unlimited coaching and the weekly meeting facilitator.**

First gate (line 12304):
Current: Get personalized coaching from your real transaction data.
New: **Coaching from your own numbers: what they mean and what to do next.**

System prompt, opening line (line ~9716):
Current: You are a warm, expert personal finance coach for Flourish Money (Canada).
New: **You are the Flourish coach: a calm, direct money coach for Canadian households. Flourish's engines have already calculated the user's numbers (below). Your job is to reduce their thinking burden: explain what the numbers mean, spot patterns, compare options, prioritize what needs attention, ask the question they haven't asked, and help them decide.**

System prompt, section header (line ~9737):
Current: Tax & advice context (use these to give accurate, personalised advice):
New: **Reference rules (name and explain these; do not compute new figures from them):**

System prompt, closing rules (lines 9755 and 9756), replace both lines with:

```
RULES
1. Flourish calculates; you coach. Every dollar figure, date, rate or score you cite must appear verbatim in the snapshot above. You may compare, rank and contrast those figures ("dining is $186 above your usual pace and is the largest flexible category"). You may not derive new ones. If the user needs a number that isn't there, say "Flourish hasn't calculated that yet" and name the screen that will (Watch for forecasts and what-ifs, Do for payoff dates and budgets).
2. Never invent a number, limit, rate, date or program detail. If a rule isn't in the reference list, say you don't have it and point to CRA My Account or the relevant CRA page.
3. Coach, don't lecture. Identify the problem, say why it matters using the snapshot, offer one or two options with their computed trade-offs, and ask which the user wants. Challenge unsustainable patterns plainly and without judgment.
4. Boundaries: you do not recommend specific investments, securities, insurance products, legal structures, or individualized tax positions (what to claim, file, deduct or shelter). You may explain how RRSP, TFSA, FHSA, CCB, GST/HST credit and similar programs work and which rule applies to the user's situation. If asked for a regulated recommendation, say you're not a licensed adviser, explain the concept and the trade-off, and suggest a professional for the decision.
5. Plain English, Canadian spelling, no jargon without a one-line definition. Max 4 sentences unless asked for more.
6. Calm and direct. No praise, no scolding, no exclamation marks.
7. Never mention Plaid or tell the user to check their bank app; Flourish is their view.
8. Only emit FLOURISH_UPDATE after the user explicitly confirms the exact numbers; the numbers must come from the user or the snapshot.
```

The US branch of the tax context stays in code behind the country flag; the CA branch is what launches.

Weekly check-in modal (lines 2975 to 3075), copy only:

| Current | New |
|---|---|
| What was your biggest spending surprise? | **What surprised you this week?** |
| Share one financial win this week | **One win this week** |
| Every small step counts. | (drop) |
| Getting your coaching... | **Reading your week...** |
| Get My Insight → | **What did you notice? →** |
| Check-In Complete! | **Checked in.** |
| Your AI Coach Says | **Your coach** |
| Fallback 1 | **Checked in. Your subscriptions total is on the Watch tab if you want one thing to look at this week.** |
| Fallback 2 | **Checked in. Pick one line on the Do tab to move this week.** |

## 10. Meet (Family screen, lines 8045 to 8200): the signature feature

Not a renamed Family tab. Flourish writes the agenda from the household's actual week; the coach facilitates.

Agenda generation (deterministic, no AI): 
- Wins: days within safe-to-spend (SafeSpendEngine daily log), debt balances that fell, goals that moved, bills paid on time.
- Changes: BehaviorEngine category deltas vs the user's normal pattern, new recurring charges, income changes.
- Upcoming risks: ForecastEngine next 14 days, bills due, low-balance or overdraft events.
- Progress: debt payoff dates, goal projected dates, health score delta.
- Decisions: Decision Engine and AutopilotEngine allocations where two options compete (extra to Visa vs emergency fund; cut a category vs move a bill date). One or two per week, each with both computed outcomes.

Screen copy:

| Element | Copy |
|---|---|
| Header | **Meet** / **Your 15-minute money meeting** |
| Sub | **Flourish wrote this agenda from your week. The coach keeps it calm and about the numbers.** |
| Section: Flourish noticed | bullet list from the generator, e.g. **You stayed within safe-to-spend 5 of 7 days.** / **Groceries ran $62 above your usual pattern.** / **Visa fell $210 to $2,340.** / **Hydro One $184 is due Thursday.** / **Emergency fund is projected to hit $2,000 in February.** |
| Section: One decision this week | **Keep the extra $75 going to Visa (payoff May 2027), or move it to the emergency fund (target reached December)?** with two buttons, each showing the engine result |
| Start button | **Start the meeting** (couple) / **Start solo check-in** (single) |
| Facilitator intro (AI) | **I'll keep us to the agenda and the numbers. Nothing here is advice and nothing moves money. First item: the win.** |
| Facilitator behaviour | Runs the agenda in order, asks one question per item, reflects back what each person said, names the trade-off on the decision using the two computed outcomes, records the choice (FLOURISH_UPDATE only after explicit confirmation), closes with one intention for the week |
| Step: Name one win | **Name one win** / **Cooked at home, skipped a purchase, put $20 in the TFSA. Anything counts.** / **Tight month? Showing up is the win.** |
| Step: Check the goal | **Check the goal** / **Flourish shows the amount and date. Say whether the plan still fits.** |
| Step: One intention | **One intention for the week** / **One thing, with a dollar amount or a date. Not a list.** |
| Empty bills | **No bills yet. Add them on the Do tab.** |
| Kids tiles | Remove from this screen. Keep the /kids route unlinked. |

Old copy replaced: "Money is a team sport", "Today's agenda", "Start Meeting ▶", "Start Check-In ▶", "Even 1% closer is worth acknowledging", "Small wins build into lasting change".

## 11. Paywall (lines 10318 to 10380)

| Location | Current | New |
|---|---|---|
| Sub | 14-day free trial · Cancel anytime | **14 days free. Cancel any time.** |
| Downsell headline | You're leaving money on the table | **What Plus adds** |
| Downsell body | Most people on free leave unclaimed credits, untracked debt, and zero coaching behind. Plus fixes all of that. | **Live numbers from linked accounts, unlimited coaching, and the weekly meeting with agenda and facilitator. Free keeps Today, Watch and Do with manual entry.** |
| Feature: AI Coach | Personalized advice from your real transaction data | **Coach** / **Unlimited coaching from your own numbers: what they mean and what to do next** |
| Feature: Tax Tips & Benefits | RRSP, TFSA, CCB, GST credit, Trillium and more | **Benefits explained** / **CCB, GST/HST credit, Trillium, RRSP, TFSA, FHSA: which rule applies to you and why** |
| Feature: Credit Coaching | Full factor breakdown + improvement plan | **Credit plan** / **Factor breakdown with amounts and dates** |
| Feature: Investment Tracking | RRSP, TFSA, Questrade, Wealthsimple | **Contribution room** / **RRSP, TFSA and FHSA balances and room together** |
| Feature: Household Sharing | Connect with a partner, track shared goals | **Weekly money meeting** / **Agenda from your week, coach as facilitator, solo or couple** |
| Feature: Debt Simulator | See exactly when you'll be debt-free | **Debt payoff date** / **Calculated by Flourish. Drag the extra payment, watch the date move** |
| Feature: Spending Insights | AI-powered pattern detection & smart cut suggestions | **Pattern alerts** / **Payday spikes and subscription creep, calculated from your transactions** |
| New feature | (none) | **Linked accounts** / **Read-only bank connections for live balances and transactions** |
| CTA | Start Free 14-Day Trial → | **Start 14 days free →** |
| Under CTA | 14 days free, then {price}. Cancel anytime. Payment processed securely. No hidden fees. | **Free for 14 days, then {price}. Cancel any time from Settings.** |
| Trust footer | 🔒 Bank-level security / 🇨🇦🇺🇸 Canada & USA / ✓ PIPEDA compliant | **Read-only. No money movement.** / **Built in Ontario** / **PIPEDA compliant** |
| Decline | Stay on free plan | **Keep the free plan** |

## 12. Settings

New section, "Your data and the coach":
- Toggle: **AI coach**. Sub: **On: Flourish sends your calculated numbers to the coach so it can explain them and run your money meeting. Off: nothing leaves Flourish for AI. Every number, forecast and what-if still works.**
- Static: **Flourish is read-only. It cannot move, send or hold money.**
- Static: **Flourish is not a licensed financial adviser. It explains and coaches; you decide.**
- Bank section sub: **Linked accounts are read-only through a regulated data provider. Unlink any time.**
- Offline banner (line 12462): Offline — AI features paused. Your data is saved. → **Offline. Coach paused, numbers saved.**

## 13. Legal pages

- Terms 1: "budgeting, spending tracking, financial health scoring, AI-powered coaching, and goal-setting tools" → **"budgeting, forecasting, spending tracking, a financial health score, AI coaching that works from figures the App calculates, and goal-setting tools. The App is read-only and cannot initiate payments or transfers."**
- Terms 2 eligibility: **unchanged** (Canada or United States). Changing this is a separate decision about technically blocking US signups.
- Terms 3 heading: Not Financial Advice → **Not a Licensed Adviser**. Body keeps the disclaimer and adds: **"The coach explains and helps you weigh figures calculated by the App. It does not perform financial calculations and does not provide investment, legal or individualized tax recommendations."**
- Privacy: add under Data Storage: **"You can turn the AI coach off in Settings. When it is off, no financial data is sent to Anthropic."**

## 14. Find and replace (CA-locale strings only; US-locale strings untouched)

| Find | Replace |
|---|---|
| checking (user-facing label) | chequing |
| paycheck | paycheque |
| behavior (user-facing) | behaviour |
| personalised advice / personalized advice | coaching from your own numbers |
| AI Financial Coach | coach |
| AI-powered | calculated from your transactions |
| Chase, Wells Fargo (in CA marketing) | (remove) |
| — (em dash in copy) | period or comma |
| Guidance (nav) | Learn |
| Family (nav) | Meet |
| incredible! | (remove) |

## 15. AI call audit (what the model is allowed to produce)

Three live call sites in the project's App.jsx, eight types in coach.js. The project copy is from 2026-03-29 and is older than the working copy; re-run this audit against the working copy before acting.

| Call | Where | Today | New role |
|---|---|---|---|
| chat | AICoach, line 9774 | Advises, may produce numbers | Coach per the eight rules; figures only from snapshot |
| checkin | WeeklyCheckInModal, line 3000 | "One specific action" from mood and transactions | Facilitator reflection over engine-generated agenda; no new figures |
| simulator | WhatIfSimulator, line 1530 | Project copy (Mar 2026): model returns the figures. Working copy (per Amanda): JS computes them, model writes prose | Verify against the working copy first. If JS already owns the figures, no change. Otherwise: model parses, engines compute, coach narrates |
| plan, insights, buckets, tax, document | coach.js only, unused by App.jsx | Prompts ask the model to "use exact numbers", "calculate tax scenarios", "generate savings buckets" | Remove or lock down before launch; any future use follows the parse-compute-narrate pattern |

## 16. Implementation order (approved 2026-09-03; superseded by IMPLEMENTATION-BRIEF.md for the exact order)

0. The current working repo is the only code source of truth. Nothing below runs against the stale project copy.
1. Verify What-If: diff working copy vs project copy; report whether a regression or an older duplicate path exists. Leave the deterministic flow intact if present.
2. Lock down coach.js: audit plan, insights, buckets, tax, document. Remove if dead; otherwise deterministic code supplies figures and the model explains.
3. One price everywhere (Paywall, landing page, Terms).
4. Coach rules (section 9) and footer.
5. Five-tab navigation and the copy in sections 3 to 13, CA-locale only.
6. AI opt-out toggle in Settings.
7. Meet agenda generator (deterministic) and facilitator prompt.
8. Decide the Plaid/free-tier gate after seeing the 14-day trial experience. Candidate: trial includes linked accounts, Free after trial is manual entry, Plus keeps live links.

Build notes: nav collapse uses segmented controls inside Watch and Do; Today's two "one thing" slots are fed by BehaviorEngine/ForecastEngine and Decision/AutopilotEngine; coach footer and the two labels are small components; AI toggle is one boolean that skips every /api/coach call; kids entry points removed, route kept; every US country-flagged path kept.
