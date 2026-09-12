# Flourish unit economics workbook: summary (September 10, 2026)

The workbook itself (Flourish_Unit_Economics.xlsx) lives in the repo at docs/ops/ and was sent in the chat; this page holds its numbers so the project has them without the file. Scenario B is the plan as decided (Canada, 11.99 / 99.99 / founding 79.99, 2 free coach messages a week, links behind Plus after the trial).

## Inputs (Scenario B column and notes)

| Input | A: old build | B: plan | Note |
|---|---|---|---|
| Assumption | A: Current (CA+US) | B: Narrowed (Canada, links Plus-only) | Note / source |
| Pricing |  |  |  |
| Monthly price CAD | 9.99 | 11.99 | DECISIONS.md (Sept 2026): $11.99/mo CAD. Column B keeps the old 9.99 for comparison. |
| Annual price CAD | 79.99 | 99.99 | DECISIONS.md: $99.99/yr CAD. Founding annual 79.99 is modelled in the Plan Check sheet. |
| Monthly price USD | 7.99 | 0 | App.jsx Paywall. Zero in B because US is dropped. |
| Annual price USD | 59.99 | 0 | App.jsx Paywall |
| Share of paid users on annual plan | 0.40 | 0.40 | Assumption. Annual is the default-selected plan in the paywall. |
| Share of users in Canada | 0.60 | 1 | Assumption for A. B is Canada-only by design. |
| USD to CAD rate | 1.36 | 1.36 | Assumption; update to current rate. |
| Payment processing (Stripe Canada) |  |  |  |
| Stripe domestic card % | 0.03 | 0.03 | 2.9% + C$0.30 domestic. Source: profitvana.com/guides/stripe-fees-in-canada |
| Stripe fixed fee per charge (CAD) | 0.30 | 0.30 | Same source |
| Stripe Billing (subscriptions) surcharge % | 0.01 | 0.01 | Stripe Billing pay-as-you-go 0.7% of Billing volume (stripe.com/en-ca/pricing, Sept 2026). |
| Extra % on non-Canadian cards (intl + FX) | 0.03 | 0.03 | 1.5% international + 1% currency conversion. Applied to the US share of users. |
| Bank connections (Plaid) |  |  |  |
| Plaid Transactions, per connected account per month (USD) | 0.30 | 0.30 | Plaid does not publish prices; billed monthly per Item while access_token exists (plaid.com/docs/account/billing). $0.30 is a commonly cited PAYG figure; replace with your quoted rate. |
| Other Plaid cost per linked user per month (USD) | 0.10 | 0.10 | Balance calls are per request; Auth is one-time per Item. Rough allowance. Plaid trial: max 10 Production Items free. |
| Avg connected accounts per linking user | 2.50 | 2.50 | Assumption (chequing + savings + credit card). |
| Share of FREE users who link a bank | 0.50 | 0 | A: links are open to everyone today. B: links gated behind Plus, so free users cost nothing here. |
| Share of PAID users who link a bank | 0.90 | 0.90 | Assumption |
| AI coach (Flora on Claude API) |  |  |  |
| Input price, $ per million tokens (USD) | 3 | 3 | Sonnet standard rate $3 in / $15 out. Haiku 4.5 is $1 / $5. Source: benchlm.ai/anthropic/api-pricing (Sep 2026) |
| Output price, $ per million tokens (USD) | 15 | 15 | Same source |
| Cached input price, $ per million tokens (USD) | 0.30 | 0.30 | Cache reads are 10% of input rate. Requires the system prompt to be cache-marked in coach.js (it is not today). |
| System prompt tokens per message (cacheable) | 6000 | 6000 | Estimate from the coach prompt in App.jsx (profile, rules, tax tables, engine output). |
| Fresh input tokens per message (history + data) | 2000 | 2000 | Estimate |
| Output tokens per message | 350 | 350 | Estimate; prompt says be brief. |
| Prompt caching enabled? (1 = yes, 0 = no) | 0 | 1 | A: not implemented today. B: assumes you add cache_control to the system prompt. |
| Coach messages per FREE user per month | 5 | 8.67 | Free tier is 2 coach messages a week (usageLimits.js), about 8.67 a month. |
| Coach messages per PAID user per month | 40 | 25 | Assumption. B lower because Flora explains and calculates rather than open-ended advising. |
| Fixed costs per month (CAD) |  |  |  |
| Supabase Pro | 34 | 34 | USD 25/mo converted. Free tier pauses inactive projects; Pro needed for auth reliability. |
| Netlify Pro | 27 | 27 | Netlify Pro is USD 20/mo on credit tiers since July 14, 2026 (function compute counts as credits). |
| Google Workspace (hello@flourishmoney.app) | 10 | 10 | DEPLOY.md DNS shows Google Workspace on the domain. |
| Domain, Sentry, AI subscriptions (Claude plan with Claude Code, ChatGPT, Grok), QuickBooks, misc | 329 | 329 | Sept 10 review: Sentry 35 + AI subscriptions about 250 + QuickBooks 30 + domain and misc. Scenario B fixed base now about 400 CAD; one cell feeds every breakeven figure. |
| Funnel |  |  |  |
| Trial-to-paid conversion | 0.05 | 0.08 | Assumption. Consumer finance freemium typically 2 to 6%; B higher because free users are not getting the full product. |
| Monthly paid churn | 0.06 | 0.05 | Assumption. Subscription finance apps see 4 to 8% monthly. |
| Share of non-converting signups still active as free users | 0.50 | 0.30 | Assumption. Free users who stay cost money (A) or nothing (B). |
| Plan inputs added Sept 10, 2026 (feed the Plan Check sheet) |  |  |  |
| Founding annual price CAD | 79.99 |  | DECISIONS.md: first 100 founding households, locked while continuously subscribed. |
| Stripe Tax % of taxed transactions | 0.01 |  | Stripe Tax no-code 0.5% (stripe.com/en-ca/pricing). Applies once GST/HST is charged. |
| Personal invitations sent by Dec 12 | 150 |  | Operating plan v3: 45 in weeks 2 to 4, then 15 a week through Dec 5. Stretch 250. |
| Invitation to started-trial rate | 0.65 |  | Assumption: warm invitations start at 60 to 70 percent. |
| Self-serve trials by Dec 12 | 130 |  | Reads the v3 cell below (one source). |
| Self-serve conversion | 0.08 |  | Assumption 5 to 10%; kill line 3% at 100 trials, 5% at 300. |
| Blended revenue per paying household / month (for MRR) | 9.50 |  | Mix of founding 6.67, annual 8.33 and monthly 11.99; used for the hire-trigger table. |
| Contribution share of MRR (after fees, Apple 15% on iOS share, variable costs) | 0.70 |  | Operating plan Finance: about 0.7 blended. Recompute from Unit Economics as real data arrives. |
| Fixed costs incl. AI subscriptions (CAD/mo) | 400 |  | Same cell family as Unit Economics fixed costs (rows 34 to 37); do not type a separate number here. |
| Started invited trials that pay at the founding price | 0.50 |  | Assumption; Phase 1 kill line is 8 of 30. |
| Self-serve trials started by Dec 12 | 130 |  | Operating plan v3 commit; stretch 300. Door opens Oct 19. |
| Share of self-serve trials that have expired by Dec 12 | 0.50 |  | Only trials started by Nov 28 can pay by Dec 12. |
| Loaded cost multiplier on base salary (employees) | 1.20 |  | CPP, EI, EHT, vacation, tools; Sept 10 People review. |

## Unit economics

| Metric | A | B | How |
|---|---|---|---|
| Revenue per paying user |  |  |  |
| Blended revenue per paid user / month | 8.89 | 10.53 | CA share x CAD blended (annual/12 and monthly by plan mix) + US share x USD blended x FX |
| Variable costs per paying user |  |  |  |
| Payment processing | 0.60 | 0.57 | Revenue x (Stripe % + Billing % + intl % on US share) + fixed fee per charge (annual users are charged once per 12 months) |
| Bank connections (Plaid) | 1.04 | 1.04 | Share who link x (accounts x per-account + other) x FX |
| AI coach (Claude) | 1.59 | 0.44 | Messages x (system tokens at cached or full rate + fresh input + output) / 1M x FX |
| Total variable cost per paid user | 3.23 | 2.05 |  |
| Contribution margin per paid user / month | 5.66 | 8.47 | Revenue minus variable cost |
| Contribution margin % | 0.64 | 0.80 |  |
| Lifetime contribution per paid user | 94.36 | 169.48 | Margin / monthly churn. This is the ceiling on what you can spend to acquire one paying user. |
| Cost of a FREE user (no revenue) |  |  |  |
| Bank connections (Plaid) | 0.58 | 0 | Same formula using the free-user link share |
| AI coach (Claude) | 0.20 | 0.15 | Free users get FREE_LIMIT messages |
| Total cost per free user / month | 0.78 | 0.15 |  |
| Mix and breakeven |  |  |  |
| Active free users per paying user | 9.50 | 3.45 | (1 - conversion) x free retention / conversion |
| Margin per paid user after carrying its free users | -1.72 | 7.94 | Margin minus (free users per paid x free cost) |
| Fixed costs / month | 400 | 400 | Sum of fixed cost inputs |
| Paying users to break even | never | 51 | Fixed / net margin per paid user |
| Total active users at breakeven | never | 227 | Paid x (1 + free per paid) |
| Cumulative trial signups needed | never | 638 | Paid / conversion (ignores churn replacement) |
| Paying users for $2,000/mo profit | never | 303 |  |
| Paying users for $5,000/mo profit | never | 680 |  |
| New paying users needed per month just to replace churn (at $5k level) | n/a | 34 | Paid base x churn. Divide by conversion for signups needed per month. |

## Plan Check (December 12 target and hire triggers)

- Paying households by Dec 12: None
- From invited households (invitations x start rate x pay rate): 48.8
- From self-serve trials (started x expired share x conversion): 5.2
- Total paying by Dec 12 (commit 50; stretch 100 needs 250 invitations and 300 self-serve): 54.0
- Cash collected before tax if invited take founding annual and self-serve pay two months: 4,024.2
- MRR-equivalent at Dec 12: 387.3
- Started trials in all (invited started plus self-serve): 227.5

Rule: 0.7 x MRR minus fixed costs (Inputs B52, about 400) minus existing payroll >= 2 x the new hire's loaded cost, three consecutive months, plus three months of cash. Loaded costs sourced Sept 10 (People review).

| Order | Role | Loaded cost | Existing payroll | MRR needed | Trigger | Paying at trigger |
|---|---|---|---|---|---|---|
| 1 | Support and Community Lead (part-time employee) | 2,300 | 0 | 7,143 | 7,500 | 789 |
| 2 | Bookkeeper (part-time contractor) | 800 | 2,300 | 6,143 | 8,000 | 842 |
| 3 | Growth Marketer | 6,000 | 3,100 | 22,143 | 22,500 | 2,368 |
| 4 | Engineer 1 (senior base about 120k x 1.2) | 12,000 | 9,100 | 47,857 | 48,000 | 5,053 |
| 5 | Product Lead + Product Designer (about 90k base each x 1.2) | 18,000 | 21,100 | 82,143 | 82,500 | 8,684 |
| 6 | QA Engineer (about 85k x 1.2) | 8,500 | 39,100 | 80,714 | 87,000 | 9,158 |
| 7 | Data Analyst (about 85k x 1.2) | 8,500 | 47,600 | 92,857 | 93,000 | 9,789 |
| 8 | Partnerships Lead (about 85k x 1.2 plus commission) | 8,500 | 56,100 | 105,000 | 105,000 | 11,053 |
| 9 | Counsel (retained) | 2,500 | 64,600 | 100,000 | 110,500 | 11,632 |
| 10 | Ops Manager | 6,000 | 67,100 | 113,571 | 116,500 | 12,263 |

## Channels (started trials by December 12)

| Channel | Funnel | Commit | Stretch |
|---|---|---|---|
| Personal invitations (founder network, prior correspondents) | invited | 78 | 120 |
| Waitlist rows under six months old, launch email | invited | 10 | 30 |
| Member referrals (who invited you) | invited | 10 | 25 |
| Open web signup from Oct 19 (social, community, PR) | self_serve | 60 | 120 |
| App Store from mid November | self_serve | 20 | 60 |
| CCB clawback page and other wedge pages | self_serve | 20 | 60 |
| Paid test Nov 2 to 15 | self_serve | 25 | 35 |
| Partner code (letter of intent) | self_serve | 5 | 25 |
| Invited started, total |  | 98 | 175 |
| Self-serve started, total |  | 130 | 300 |
| All started trials |  | 228 | 475 |

## Cash (thirteen weeks, September 14 to December 12, CAD before tax)

- Outflows
- Fixed costs, 3 months (Inputs B52): 1,200
- Lawyer, fixed-fee review (estimate): 2,500
- Trademark filing, CIPO fees plus agent (estimate): 1,000
- Paid test: 300
- QuickBooks, 3 months: 90
- Total outflows: 5,090
- Inflows, commit case
- Gross cash collected before tax by Dec 12 (Plan Check B7): 4,024
- Net for the quarter, commit case: -1,066
- Inflows, stretch case
- Gross cash, stretch (85 founding annual plus 15 monthly x 2): 7,159
- Net for the quarter, stretch case: 2,069
- Monthly run-rate after Dec 12, commit case (contribution minus fixed): -129
- Monthly run-rate after Dec 12, stretch case: 123

Reading: the commit case needs about 1,100 CAD of founder funding this quarter and about 130 a month after it; the stretch case is cash positive. One-time estimates are blue and editable.
