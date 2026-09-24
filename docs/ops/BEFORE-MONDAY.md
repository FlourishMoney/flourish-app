# Flourish Money: before-Monday pack (prepared September 10, 2026)

Everything the AI side promised to have ready before Monday, September 14. Research pieces live in their own docs: LAWYER-SHORTLIST.md, TRADEMARK-KNOCKOUT.md, WEB-CHECK-2026-09-10.md. The lawyer packet (current privacy policy and terms text, App Store review notes draft, the questions) is LEGAL-PACKET.md. This pack holds the writing: invitation copy, founding offer terms, CASL lines, the analytics event spec, the operations doc skeleton, and the plan changes the web check forced.

## 1. What the research changed (read this first)

1. Trademark: file now, not at day 60. A budgeting app called "Flourish - Grow Your Finances" appeared on the Canadian App Store on September 7, and someone else is actively clearing FLOURISH in class 9. Canada is first to file. A three-class online application for FLOURISH MONEY is 789.14 CAD in CIPO fees; the lawyer can file it or the founder can file directly. Decision 10 in the operating plan changes from "search now, decide by day 60" to "file the Canadian word mark in week 2." The US is crowded (flourish.com, MassMutual-owned, has strong unregistered rights in class 36); no US launch under this name without a clearance opinion.
2. iOS 27 ships Monday, September 14. The week 1 device check happens on iOS 27. Any App Store build made with Xcode 27 needs the Capacitor 8.5 UIScene migration; Xcode 26 builds are accepted until April 2027. New decision 15: the October submission uses Xcode 26 unchanged; the Capacitor 8.5 migration goes to January. Recommendation yes, default yes.
3. Supabase has a maintenance window on Tuesday, September 15, 5:15 to 5:45 pm Eastern (Management API only; running projects unaffected). The deploy happens earlier in the day. Nothing in the Supabase dashboard between 5:15 and 5:45.
4. Supabase's legacy service_role keys are deprecated by end of 2026 in favour of sb_secret keys. Not this week: two credential changes on deploy week is one too many, and not during the invitation weeks either. Week 5.
5. Stripe: pin Stripe-Version 2026-08-26.dahlia in the billing build; the Customer Portal's cancel deep link and cancellation-reason capture are exactly what the cancel flow needs. Stripe Billing adds 0.7 percent on recurring volume and Stripe Tax 0.5 percent on taxed transactions; both are now in the workbook.
6. Netlify Pro is 20 USD a month on credit tiers, not 19; function compute counts against credits. Cost lines corrected; credit use goes into the weekly cost log.
7. Apple Small Business Program: the 15 percent rate starts 15 days after the end of the month enrolment is approved. Enrol before September 30 and it is in force before the October submission. Friday's task stands, with that reason.
8. Anthropic's Usage Policy requires consumer chatbots to disclose AI at the start of every session (done: the AI notice screen) and, for financial advice presented directly to consumers, disclosure that AI helped produce it plus review by a qualified professional. Flourish positions the coach as education with "Not investment, legal or tax advice" on every reply. This goes into the lawyer packet as a question, not a change.
9. Bill C-36 (PIPEDA replacement, express consent by default, explanations of automated decisions) is at second reading; the House returns September 16. The privacy policy review should be drafted to the C-36 express consent standard now, at no extra cost.
10. Competitors this month: Rocket Money launched "Rowan," an Anthropic-powered agent that moves money, at 15 USD a month (US only); Copilot's assistant now edits budgets; PocketSmith (supports Canadian banks) is in the Claude directory; Wealthsimple has Spend Insights and 3.6 million clients; Neo raised memberships to 9.99 and 14.99 CAD on October 1. Positioning for the cohort: Canadian numbers, calculated not guessed, one cross-bank view, a weekly money meeting, and a coach that never moves your money. The 11.99 price sits inside what Canadians already pay Neo.

## 2. Founding invitation copy

Voice rules: direct, smart, Canadian spelling, lowercase "flourish" in body copy, no em dashes, no hype, the honest bit stays in. Replace the bracketed parts. The access code is the one the founder adds to BETA_CODES on Friday; the link is the production site's Log in screen, Sign up.

### Text message (about 70 words)

Hi [name]. I built a money app for Canadian households and I'm opening it to 30 founding families before anyone else. It links your bank read-only (or you type numbers in), tells you what's safe to spend today, and runs a 15-minute weekly money meeting for the two of you. Free for 14 days, then 79.99 a year plus tax for founders instead of 99.99, locked as long as you stay. Rough edges likely. Want in? I'll send the link and your code.

### WhatsApp (goes under the invite card)

You're invited to the founding 50.

flourish is a money coach for Canadian households. It shows you one number every morning (what's safe to spend), flags what's coming, and runs a short weekly money meeting with your partner. The numbers are calculated from your data; the coach explains them and never moves your money.

Founding offer: 14 days free, then 79.99 a year plus tax (about 90 in Ontario; regular price 99.99), locked at that price as long as your subscription stays active. First 100 households only.

It's early. You will find rough edges, and I want to hear about every one. Reply "in" and I'll send your link and code.

### Email (subject: You're invited: 30 founding families for flourish)

Hi [name],

I've been building flourish for about a year: a money coach for Canadian households like ours. Before it goes public, I'm inviting 30 families I trust to use it first.

What it does: links your bank accounts read-only through Plaid (or you can enter numbers by hand), shows you one number every morning (what's safe to spend), warns you about what's coming, and runs a 15-minute weekly money meeting for you and your partner, with an agenda built from your own numbers. Every figure is calculated by flourish from your data. The coach explains, asks questions and helps you decide. It never invents a number and it cannot move your money.

The founding offer: 14 days free, no card. After that, 79.99 a year plus tax (about 90 in Ontario) instead of 99.99, locked at that price as long as your subscription stays active. First 100 households only.

The honest part: it's early. You'll find rough edges, and the most useful thing you can do is tell me about them. Reply to this email or message me any time.

To start: go to [link], tap Log in, then Sign up, and use the code [code]. It takes about two minutes to see your first number. (Three screenshots of those screens go under this line; CC captures them Tuesday.)

Thank you for trying it.

[Founder name]
GrowSmart Inc., [town], Ontario
hello@flourishmoney.app

This is a personal invitation. If you'd rather not hear about flourish again, reply "no thanks" and I won't ask twice.

### Follow-ups the support plan expects (CL drafts each on the day)

Day 1: "Did you see your number?" Day 3: "Anything confusing?" Day 7: "Book your first money meeting: here's how." Day 12: "Your trial ends in two days; here's what founding includes."

## 3. Founding offer terms (plain-language summary for the lawyer packet)

1. Founding membership is offered to the first 50 households that subscribe on the annual plan during the founding period (founding cohort changed from 100 to 50 on 2026-09-23 — see docs/product/DECISIONS.md).
2. Price: 79.99 CAD per year plus applicable taxes (about 90.39 in Ontario), compared with the regular annual price of 99.99 CAD plus applicable taxes. The founding price renews at 79.99 for as long as the subscription remains continuously active. If the subscription lapses or is cancelled and later restarted, the regular price applies.
3. The 14-day free trial comes first; no card is required for the trial. Payment is collected only when the member subscribes at the end of the trial.
4. Founding includes everything in Plus: unlimited coaching, linked accounts, the Meet facilitator, and a second household login when that ships.
5. Purchases made on the web are billed by Stripe and can be managed or cancelled any time from Manage subscription. Cancellation stops renewal; access continues to the end of the paid period. No partial-year refunds except where required by law.
6. Purchases made through the App Store are governed by Apple's terms; the founding price is a separate Plus Founding Annual product at 79.99 in the same subscription group, so the lock holds at renewal (an introductory offer would renew at the standard price).
7. flourish provides calculations and educational information. It is not investment, legal or tax advice and GrowSmart Inc. is not a licensed adviser.
8. Eligibility: residents of Canada outside Quebec, or of the United States, 18 or older (decision 17 excludes Quebec until French-language copy and Law 25 basics exist).

Questions for the lawyer: the price is plus tax (decision 16, answered Monday; the Terms sentence ships Thursday); whether item 2's lock survives a price change to the regular plan; whether item 5's no-refund line is enforceable under Ontario's Consumer Protection Act for online subscriptions; whether the Anthropic Usage Policy's financial-advice clause (disclosure plus professional review) is satisfied by the education framing and the per-reply footer; and whether the privacy policy should be drafted to Bill C-36's express consent standard now.

## 4. CASL lines

Waitlist form (replaces the current line): "Yes, email me when flourish launches and with occasional updates about it. GrowSmart Inc., [address], Ontario. Unsubscribe any time with one click." Checkbox unticked by default; the timestamp, IP and form version are stored with the row.

Every marketing email footer: "You're receiving this because you joined the flourish waitlist on [date]. GrowSmart Inc., [mailing address], hello@flourishmoney.app. Unsubscribe."

Personal invitations sent one to one by the founder to people she has corresponded with directly fall under CASL's personal relationship exemption; they still identify the sender and offer a way to say no (the last line of the email above). People in community groups or networks she has never corresponded with are not covered: they get a public post that links to the consent form, never a direct message. Waitlist rows get the launch email only if the form asked for it or the row is under six months old (implied consent from an inquiry); older rows cannot be sent a consent request, because that request is itself a commercial message. Unsubscribes are honoured within 10 business days.

## 5. Analytics event spec (PostHog; core events built Friday September 18, the rest in week 2, the survey in week 3)

Rules: no dollar amounts, balances, merchant names, account names or free text in any event; counts, flags, durations and enums only. Internal accounts flagged is_internal = true (INTERNAL_EMAILS) and excluded from every dashboard. Events are sent only when the Settings toggle "Share anonymous usage data" is on (default on; the privacy policy names PostHog and the United States from Thursday's deploy; whether the law needs opt-in is question 3 for the lawyer). No events in demo mode except demo_viewed. Build order: signup_completed, first_number_shown, bank_link_started, bank_link_completed, bank_link_failed, app_opened and demo_viewed on Friday September 18 (week 1, prompt 6); the rest in week 2; survey_answered in week 3.

| Event | When | Properties |
|---|---|---|
| signup_completed | account created (client, right after the account exists; reconciled nightly against profiles) | country, source (invited, self_serve), has_code, invited_by (short code or inviter email hash, week 2), utm_source, utm_medium, utm_campaign |
| onboarding_step_completed | each onboarding screen | step (1 to n), seconds_on_step |
| first_number_shown | first safe-to-spend number rendered | seconds_since_signup, mode (manual, linked) |
| bank_link_started | consent modal accepted | institution_type (bank, credit_union, other) |
| bank_link_completed | Plaid item created | accounts_count |
| bank_link_failed | Plaid exit with error | error_class |
| manual_entry_used | manual income or bill saved | kind (income, bill, balance) |
| app_opened | session start | hour_local, day_of_week, platform (web, ios) |
| today_viewed | Today tab rendered | before_noon (bool) |
| explain_tapped | Explain this tapped | item_kind |
| coach_message_sent | any coach type | coach_type, plan, week_count_after |
| guard_fallback_shown | numeric guard replaced a reply | coach_type |
| meet_agenda_viewed | Meet tab rendered with agenda | items_count, mode (solo, couple) |
| meet_started | facilitator started | mode |
| meet_decision_recorded | FLOURISH_UPDATE confirmed | decision_kind |
| statement_import_confirmed | review screen confirmed | rows_selected, rows_edited, rows_failed |
| paywall_viewed | paywall rendered | trigger (trial_end, feature, manual) |
| trial_started | profile plan set to trial | source |
| subscription_started | entitlements row active | interval, founding (bool), source (stripe, revenuecat) |
| subscription_cancelled | entitlements row cancelled | reason_code |
| ai_toggled | AI setting changed | enabled (bool) |
| error_shown | user-visible error | error_class |
| demo_viewed | demo mode opened | none |
| survey_answered | day 12 and day 45 in-app survey | survey (day12, day45), money_feels (more_manageable, same, worse), recommend (0 to 10) |

User properties: country, plan, founding, ai_enabled, is_internal, signup_week. Dashboards: activation funnel (signup, first number, bank link, day-7 return), engagement (daily opens, weekly Meet completion), revenue (trials, conversions, MRR-equivalent, churn, founding count), quality (guard fallbacks per 100 coach replies), cost (Plaid items, cache read share from function logs).

## 6. Operations doc skeleton (fill as accounts are opened)

| Vendor | What | Login owner | Env var names (never values) | Cost | Renewal | Fallback |
|---|---|---|---|---|---|---|
| Netlify | hosting, functions, env vars | F | all site variables | Pro 20 USD, credit tiers | monthly | rollback to previous deploy |
| Supabase | production database and auth | F | SUPABASE_URL, SUPABASE_SECRET_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY | Pro 25 USD | monthly | daily backups, weekly export |
| Supabase | flourish-staging (decision 14) | F | same names, staging values, Mac only | free | none | delete and recreate |
| Anthropic | coach model | F | ANTHROPIC_API_KEY | usage | none | qualitative fallback in guards |
| Plaid | bank links, Canada | F | PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV | per item | none | manual entry, statement import |
| Stripe | web billing | F | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | 2.9% + 0.30, Billing 0.7%, Tax 0.5% | none | Customer Portal |
| Apple | Developer Program, App Store | F | none in Netlify | 99 USD a year | yearly | TestFlight |
| RevenueCat | iOS entitlements | F | RC_WEBHOOK_AUTH | free under 2,500 USD MTR | none | Stripe entitlement honoured in app |
| PostHog | analytics | F | VITE_POSTHOG_KEY (production only) | free to 1M events | none | events queue client-side |
| Sentry | errors | F | VITE_SENTRY_DSN | Team 26 USD | monthly | email alerts |
| GitHub | repo FlourishMoney/flourish-app | F | none | free (branch protection may need Team) | none | local clone |
| Domain registrar | flourishmoney.app | F | none | yearly | yearly | none |
| Google Workspace | hello@ and privacy@ | F | none | about 10 CAD | monthly | founder's personal address |
| Beta access | BETA_CODES | F | BETA_CODES | none | rotate per cohort | none |
| Feature flags | ENFORCE_PLAN_LIMITS | F | ENFORCE_PLAN_LIMITS | none | none | set false to fall back to abuse ceiling |

Backups: Supabase daily (Pro), plus a weekly export the founder controls, first drill in week 4. Password manager with emergency access for one trusted person. Calendar reminders one week before every renewal.

## 7. Lawyer email (founder sends Thursday)

Subject: Fixed-fee review request: privacy policy, terms and App Store notes for a Canadian finance app

Hello [name],

I'm the founder of GrowSmart Inc. in [town], Ontario. We're launching Flourish Money, a consumer personal-finance app for Canadian households: it links bank accounts read-only through Plaid, calculates budgets and forecasts, and includes an AI coach (Anthropic's Claude) that explains the numbers and never moves money. Web app first, iOS through the App Store in October.

I'd like a fixed-fee Review and Edit of three things before our public launch: (1) the privacy policy, in particular the PIPEDA legal-basis section, the AI processing disclosure, the analytics disclosure and the retention schedule; (2) the terms of service, including subscription and cancellation terms for Stripe and Apple, the "not a licensed adviser" language and a founding-member price-lock clause; (3) the wording of our App Store review notes. I'd also like your view on Bill C-36's express consent standard, on whether pseudonymous product analytics (PostHog, hosted in the United States, counts and flags only) can run on a Settings opt-out or needs opt-in, and on whether the Anthropic Usage Policy's financial-advice clause is satisfied by our education framing. Separately, we'd like a Canadian trademark application filed for FLOURISH MONEY in classes 9, 36 and 42; a knock-out search is attached.

Could you quote a fixed fee and a turnaround for the review, and a separate figure for the trademark filing? Our target is a first round by [date, about 10 business days out]. The documents and the search are ready to send.

Thank you,
[Founder name]
GrowSmart Inc.
[phone], hello@flourishmoney.app
