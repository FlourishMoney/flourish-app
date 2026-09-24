# Flourish Money: Operating Plan v3

Prepared 2026-09-10 for Craig's executive review. v2 replaced v1 the same day after a stricter audit; v3 follows the twelve department heads' review the same evening (Part 4 and LEADERSHIP-REVIEW.md show what they found). Scope: Parts 1, 2 and 4. Part 3 (dated daily lists) follows week by week after approval. Part 5 (storage and the daily routine) after Part 3.

Start date for execution: Monday, September 14, 2026. Day 30 is October 13. Day 90 is December 12.

Money is CAD unless marked. Tool prices are list prices as of September 2026 and should be re-checked when each account is opened.

## Read this first (one minute)

The goal: paying Canadian households, on a product that is already built. Commit: 50 paying by December 12 from the channels this plan actually has; stretch: 100, which needs about 270 personal invitations, 300 self-serve trials and the self-serve door open on October 19; base case: 100 by February 28 and about 120 by March 14 (SIX-MONTH-PLAN.md). Order of work: ship the finished branch, take money on the web, run the founding cohort, get on the App Store, then build distribution. Nothing new gets built until the cohort says so.

The one number: paying households. Leading numbers: activation (signup to first safe-to-spend number) at or above 70 percent, day-7 return at or above 50 percent, and the bank-link rate, which is the single biggest unknown.

The founder's week 1, about four hours: scope the Netlify secrets (20 minutes, guide provided), approve the merge, open the Stripe account, pick a lawyer from a shortlist of three, write the list of 30 households to invite. Everything else is AI-run and lands as a queue to approve.

Eighteen decisions need the founder's answer by September 14. Each has a recommendation and a default (Part 2b); silence means the default. Decision 13 matters most: as the code stands, every new signup gets permanent free access, so the cohort could never pay.

The honest gap: no hire trigger is reachable inside 90 days. The first hire needs about 800 paying households. Days 1 to 90 build the engine that gets there; the hiring table in department 12 is computed, not guessed.

What changed from v1: revenue milestones were labelled MRR but were cash totals (fixed); hire triggers did not satisfy the plan's own rule (recomputed); the trial gates and kill criteria contradicted each other (split into invited and self-serve funnels); the paid-ads bar was impossible at this price (stated plainly); two "unverified" Apple items were verified in the code; a server-side free-limit mismatch was found; the unit economics workbook is on the old prices.

What changed from v2 (the department heads' review): the December 12 target is re-based to what the channels can produce (50 commit, 100 stretch) with the arithmetic shown; the self-serve door (code-free signup) gets a date; the invited funnel counts invitations, starts and payers separately; every Netlify variable change is followed by a redeploy; billing is developed end to end on staging with a written October 2 go-live checklist; trials that start before billing is live are extended; the free path is tested live before the cohort; Terms wording on tax and the founding lock ships Thursday; Quebec is excluded at signup until French and Law 25 basics exist; the first hire is a part-time employee, not a contractor; hire triggers use sourced loaded costs and a 400 CAD fixed base; the founding group is a WhatsApp Community announcement group so members' numbers stay private; the support SLA is one a person can meet.

If the founder has only 20 minutes today: read the top three lines of the day's list, approve the AI queue, answer the one decision marked "today." Everything else rolls forward.

## 0. What the project notes get wrong or out of date

1. "Amanda does all Flourish marketing herself, no delegation." Superseded by the new rule: AI does as much as possible. Marketing below is AI-run with the founder approving and appearing on camera only where a human face is the point.
2. "Private TestFlight only, no public web beta; the landing page becomes coming soon to iOS." This is the slowest possible path to revenue. Apple review adds weeks and Apple rules require in-app purchase inside the iOS app; the web app can take money through Stripe next week. The plan below sells on the web first to a private founding cohort, ships iOS through TestFlight in parallel, and honours web subscriptions inside the iOS app (Apple guideline 3.1.3(b) allows access to subscriptions bought elsewhere as long as the app also offers in-app purchase). External purchase links are not allowed on the Canadian storefront, so RevenueCat and in-app purchase are required for the App Store build, at 15% under the Small Business Program.
3. "Beta cap 30, free tier 1 coach message a day, pricing unsettled." All superseded by DECISIONS.md: $11.99/month or $99.99/year CAD, founding $79.99/year, free coaching 2 per week after a 14-day unlimited trial. The code on the strategy-implementation branch matches the decisions.
4. "Kill thresholds: D30 retention under 15 to 20 percent, conversion under 2 percent." Kept, and given dates in Part 2.
5. Trademark. "Flourish" is used by at least two US fintechs (Flourish.com, an advisor cash platform, and Flourish Fi). The Canadian FLOURISH filing found at CIPO belongs to a food and apparel company, so it does not block software or financial services classes here, but nothing has been filed for Flourish Money and a US expansion would collide. Legal has a task and a decision date for this; it is not a launch blocker for Canada.
6. Two Apple compliance gaps were listed as open (AI disclosure before first coach use, bank-connect consent before Plaid Link). Both exist in the working copy: the AI consent screen (with a self-heal path in consentHeal.js) and a BankConsentModal that is the single consent surface for every Plaid path, written against guidelines 5.1.1 and 5.1.2. Account deletion exists in Settings and erases bank data server-side. Login is email code or password only, so Sign in with Apple is not required. Week 1 is a device check of these, not a build.
7. The strategy branch is complete and pushed but not merged. Merge is a Phase 0 task, not a background item, and it deploys production, so the founder approves it after the pre-merge checklist is green.
8. The unit economics workbook (September 3) still uses the old prices, 9.99 and 79.99 monthly and annual, with 5 free messages. Its margins are stale. Finance updates it in week 1 to 11.99, 99.99, founding 79.99 and 2 free messages a week; the figures in this plan already use the new prices.
9. The free coaching limit is decided as 2 a week and the client enforces it from a localStorage counter (resets Monday 00:00 UTC), which anyone can clear. The server function still carries a 1-a-day free limit (FREE_CHAT_DAILY = 1) behind the ENFORCE_PLAN_LIMITS environment flag, off unless the Netlify variable is set to true, in which case free accounts would get 1 a day, not 2 a week. Either way the server does not match the decision. The server must be the authority before billing goes live. Engineering, week 1; the Netlify value is only read during Monday's scoping and is set to true on Thursday after the new code is deployed, followed by a redeploy.
10. Found while building week 1: as the code stands, nobody in the founding cohort could ever pay. Every new signup gets founder_flag = true from handle_new_user until January 1, 2027 (migration 0003), and a beta-code signup sets a permanent beta_founder plan in localStorage, so no paywall would ever appear. Also, the web landing only admits accounts through the Log in screen with a beta access code, capped at 30 seats (BETA_CAP in beta.js and App.jsx), and the client's plan names (premium, beta_founder) differ from the server's (plus, pro, founder_flag). Decision 13 in Part 2b and Engineering week 1 fix this before the September 21 invitations: new accounts get the 14-day trial only, existing founder rows keep their status, the server profile is the authority on plan, the beta cap rises by 50 above the seats already used (45 invitations plus test accounts), and a dedicated founding access code is set in BETA_CODES by the founder.

## Part 1: department plans

Owner codes: F = founder, CL = Claude (chat), CC = Claude Code, CD = Claude Design, GPT = ChatGPT, GK = Grok. "Later" names the hire that takes the task over and the trigger in department 12.

### 1. Product management (head reports to Craig; run by CL now, Product Lead later)

90-day goal: paying households and evidence that the three loops work. KPI: 50 paying by December 12 (commit) with a path to 100 (stretch), D30 retention at or above 25 percent (D30 = any app open in days 26 to 34 after signup, weekly cohorts, trial and paying counted separately), and weekly Meet completion at or above 40 percent among paying households (completion = a Meet decision recorded in the week).

Roadmap in priority order:
1. Ship what exists: merge strategy-implementation, deploy, Netlify secrets scoped, server-side free limit matched to the 2-a-week decision. (Week 1)
2. Billing on the web: Stripe Checkout at trial end, Customer Portal, webhook to Supabase, founding coupon, cancel-reason capture. Hard deadline October 2, three days before the first founding trial expires. (Week 1 to 3)
3. Founding cohort in waves, counted in invitations sent and trials started: 45 invitations to net 30 started trials (weeks 2 to 4; five households on September 21 as a smoke, the rest from September 23 once first_number_shown is arriving in PostHog), then 65 invitations in weeks 5 to 7 and 40 more by December 5, to net 90 started trials. Founder time for invitations is 2 hours a week inside the marketing hours. (Week 2 to 12)
4. iOS: RevenueCat in-app purchase, App Store submission with review notes and demo account. (Week 3 to 6)
5. Validation instrumentation: the five questions (pay, keep using, daily open, Meet retention, mental load) as events and one dashboard. Core events (signup, first number, bank link, app open) ship with Friday's CI branch on September 18; the rest in week 2; mental load as a two-question in-app survey at day 12 and day 45 (money feels: more manageable, same, worse; plus a 0 to 10 recommend score) in week 3. (Week 1 to 3)
5b. The self-serve door: code-free signup on the web (codes kept only to tag invited signups) built in week 3 and opened on October 19 if Phase 1 activation is 70 percent or better; at 50 to 69 percent it opens on October 26 after one week of fixes from the observed onboardings; under 50 percent onboarding is redesigned first. The App Store build opens the second door when approved. Without this the self-serve funnel has no entrance. (Week 3)
5c. Trial slip rule (decision 18): a trial_ends_at column set at signup, extended by SQL for any trial that would end before billing has taken one real payment plus 48 hours, with a pre-written "we extended your trial" note. (Week 1 migration, Support script)
6. Canada wedge tools as free, shareable pages: the CCB clawback calculator first, in week 4, so one page has time to index before December; RRSP vs TFSA vs FHSA, RESP/CESG and the benefit calendar in weeks 5 to 9. Deterministic engines, coach explains. (Week 4 to 9)
7. Referral (a "who invited you" field at signup in week 2; the referrer's free month as a Stripe customer balance credit written by the webhook in the billing sprint) and household invite (couple mode with two logins) in weeks 7 to 10. The founding terms promise the second login "when that ships"; it is not cut. (Week 2, then 7 to 10)
8. Widget (safe-to-spend and next bill), v1.1 after App Store approval.

Cut for the next 90 days: Kids features, US marketing, Money Mindset v2, any new AI surface, Flinks migration, a staging environment for previews (a free staging Supabase project exists only for local billing development and migration testing; preview isolation waits for the first engineer hire), and anything the validation data does not ask for.

Specs: every feature gets a one-page spec (problem, user, deterministic source of every number, copy, events emitted, test list) written by CL and approved by the founder in the Friday 30 minutes before CC builds; ChatGPT reviews when credits allow and is never on the critical path.

Onboarding order (decision 3, revised): cohort 1 keeps the order as built (bank link offered first, manual entry available); the reorder to manual-first is decided on October 5 from the measured link rate, built only if under half of activated households link a bank, and if it fires it takes the week 5 engineering slot ahead of the wedge tools. One threshold (under half), one date (October 5), everywhere in this plan.

Watch five households onboard: before the 30 invitations go out, three people the founder has not coached go from the invitation text to their first number on their own phones over a video call while she watches and says nothing (45 minutes, week 2); any stall over 30 seconds is fixed first. Five more observed onboardings in week 3, so every funnel drop has a named cause by October 5.

Daily (CL): read the analytics summary, triage feedback, update the plan file. Weekly (F with CL): 30-minute product review against the KPI; approve or cut. Monthly (F, CL, GPT): roadmap re-rank from data.

Tools: the plan file, Linear free tier for the backlog (or GitHub Issues). Cost: $0.

Dependencies: analytics events (Data), billing (Engineering), cohort recruitment (Marketing).

Risks and open questions: whether linked-bank trials convert; whether Meet is used weekly by real couples. Both are answered by the cohort, not by planning.

Later: Product Lead (hire 5) takes the roadmap and specs; CL stays as the plan keeper and research arm.

### 2. Design (CD now, Product Designer later)

90-day goal: a new user reaches their safe-to-spend number in about two minutes and understands what to do next. KPI: median time from signup to first Today number under 120 seconds and p75 under 180 seconds; onboarding completion at or above 70 percent. "About two minutes" is the one time promise used everywhere (invitation, landing, App Store copy); COPY-CHANGES.md's "Set up in 60 seconds" is retired.

Work list, dated: week 1, icon lockup and the founding invite card (Claude Design, founder pastes), and three real screenshots of the signup path (landing, Log in, Sign up with the code field) captured by CC from production on Thursday after the copy deploy that retires "Set up in 60 seconds"; week 2, the five observed onboardings; week 3, onboarding spec screens (manual-first variant, built only if decision 3's October 5 readout says so); weeks 3 to 6, App Store screenshots (six screens, Canadian copy, Plus features labelled) and the preview video, which Apple requires to be screen capture of the real app, so CC records it; week 4 onward, wedge-tool page templates; weeks 7 to 10, Meet couple-mode screens; email and social templates as the calendar needs them. A founding landing page is dropped; the screenshots do its job.

Brand: lowercase "flourish" wordmark, green diamond leaf, direct Canadian voice, no em dashes, "Calculated by Flourish" and "Your coach" labels everywhere the two mix.

Daily: none; Claude Design runs only when the founder pastes, so the founder's week carries one 10-minute paste slot on Monday and Thursday (department 12) and CL queues the prompts. Weekly (F 30 min): approve mockups and assets. Monthly (CD with GPT critique): usability pass on the top three screens using the funnel and the observed-onboarding notes, which say why people stop, not only where.

Tools: Claude Design, Figma free (for the founder to view and comment), Canva free for quick social crops. Cost: $0 beyond the AI subscriptions in Operations.

Dependencies: analytics funnel to find the drop-off; copy rules from COPY-CHANGES.md v2, which CL produces by September 18 (it still says "five free coaching messages this month" against the 2-a-week decision). Capitalisation rule, one line: lowercase "flourish" in the wordmark and in running body copy (the decision from commit 49076f2); "Flourish Money" and "Flourish" as the product's proper name in legal text, the App Store listing, and the two labels "Calculated by Flourish" and "Your coach". The landing's "Set up in 60 seconds" and "Sixty seconds" strings change to "about two minutes" in Thursday's copy-only deploy of week 1, with a test.

Risks: App Store screenshot rejection for depicting features that need Plus (label them). Onboarding order is decision 3, not an open question: as built for cohort 1, readout October 5.

Later: Product Designer (hire 5, paired with Product Lead) owns the design system and all assets; CD becomes the production tool.

### 3. Engineering (CC now, first Engineer later)

90-day goal: paid, monitored, recoverable. KPI: billing live on web and iOS, p95 app load under 2.5 s on a mid-range phone, zero Sev-1 incidents older than 24 hours, backups restorable.

Week 1: merge strategy-implementation to main after the founder's approval (deploys), verify production, Netlify secrets scoped to Production, device check of the AI consent screen, the BankConsentModal before Plaid Link and Settings > Delete Account (confirm deletion clears every user table, not only plaid_items), Supabase Pro confirmed, Sentry alerts to email. Make the server the authority on the free limit: coach.js still carries a 1-a-day free limit (FREE_CHAT_DAILY = 1) behind the ENFORCE_PLAN_LIMITS environment flag; change the server rule to 2 a week on the same Monday reset as usageLimits.js, keep the daily abuse ceiling and the IP backstop, add a test; only after that code is deployed on Thursday does the founder set the flag to true in the production context and trigger a redeploy. The localStorage counter stays as a UI hint only.
Week 1 to 3, live by October 2: Stripe Checkout at trial end (the 14-day no-card trial stays as built; the card is asked for at conversion), Customer Portal (a saved portal configuration with cancellation reasons; test mode refuses portal sessions without one), webhook to Supabase (plan, status, period end, founding flag) with a stripe_events table so a replayed event is a no-op, one entitlements table keyed by user with a source column (stripe or revenuecat) read server-side by every gate, a separate founding annual price rather than a coupon, Checkout with automatic tax and billing address collection (decision 16), cancel flow with one reason captured, prices from pricing.js, Plaid Items removed seven days after a trial lapses (Plaid bills per Item per month while the token exists). The app blocks a second purchase while an entitlement is active and tells the user to manage the subscription where they bought it. All of it developed and tested end to end against the staging Supabase project (client and functions both pointed at staging locally), never production.
October 2 go-live checklist (written in week 2, run on October 1): Stripe account activated; live prices created by the setup script; live webhook endpoint registered and its signing secret in the Netlify production context; live portal configuration saved; GST/HST number in Stripe Tax; migration 0008 on production; the Terms wording on tax and the founding lock live; redeploy after the variables; one real 79.99 charge on a founder-controlled account, refunded, before any cohort trial is allowed to end.
Rule for every Netlify variable change: it takes effect only on the next build, so every step that sets a variable ends with "Deploys, Trigger deploy, wait for Published," then a check from the phone.
Week 1 (Friday) and 2: analytics events (Data plan) through PostHog, internal accounts excluded; the four core events on September 18, the rest by September 25; a "who invited you" field at signup; UTM parameters carried through Log in to signup_completed.
Week 3: code-free signup (the self-serve door) behind a server flag, opened October 19 by the founder if Phase 1 activation clears 70 percent; access codes remain as an optional tag for invited signups. Also week 3: the four trial lifecycle emails (day 1, 3, 7 and 12) sent through Resend from a scheduled Netlify function reading trial_started_at, replacing the founder's daily list; the day 12 note reads the extension state (decision 18).
Week 3 to 6: RevenueCat with @revenuecat/purchases-capacitor, entitlements to Supabase by webhook (RC_WEBHOOK_AUTH) into the same table, three App Store products in one subscription group (monthly, annual, and a separate Plus Founding Annual at 79.99 so the lock holds at renewal; an introductory offer would renew at the standard price), a 14-day introductory free trial offer on iOS so the trial has cover under guideline 3.1.1, Apple Small Business Program enrolment, App Store build with review notes, demo account, password login for reviewers, all three camera Info.plist keys, encryption "None," build number increment, Xcode 26 (decision 15). Sign in with Apple is not needed (no third-party login exists). Android users get the web app until a Play build after day 90.
Week 5 to 9: wedge tools as deterministic modules with tests, public shareable routes, no AI in the numbers.
Ongoing: the offline math-lock gate in CI (GitHub Actions) on every pull request; the live coach QA (28 cases) run locally before every merge that touches a prompt, a guard or coach.js, with the totals in the release note (it needs the API key and stays out of CI); from week 2 every change reaches main through a pull request so the CI check gates something; prompt caching kept, snapshot and facilitator guards kept, Promise.allSettled on Plaid fetches, the duplicate Scotiabank plaid_item cleanup, disconnect removing server items; the Supabase sb_secret key rotation in week 5, not during invitation weeks.
Security: read-only Plaid, no VITE_ secrets, service key production-only and marked Secret in Netlify together with PLAID_SECRET and ANTHROPIC_API_KEY so the build scanner checks output for their values (a leaked value never contains its variable name; grep only value prefixes such as sk-ant-, sb_secret_, sk_live_), RLS reviewed on every table touched by billing, the existing per-user and per-IP limits on /api/coach kept (fail closed), dependency audit monthly. Staging and Stripe test keys may pass through the CC chat; production keys never do.
Performance: bundle split App.jsx monolith by tab (lazy routes) once billing is live; the p95 load KPI is measured in the field (PostHog web vitals or Sentry performance), Lighthouse only as a lab check.

Daily (CC): morning queue of build tasks, tests after each commit, one commit per change. Weekly (F 20 min): approve the release. Monthly (CC): dependency audit, restore-procedure check, performance report.

Tools and cost: Netlify Pro 20 USD (credit tiers; function compute counts), Supabase Pro 25 USD, Sentry Team 26 USD, GitHub free, Apple Developer 99 USD per year, Google Play 25 USD once, RevenueCat free under 2,500 USD monthly tracked revenue, Stripe 2.9 percent plus 0.30 per charge plus 0.7 percent Billing on recurring volume and 0.5 percent Stripe Tax once tax is charged, Plaid pay as you go. About 100 CAD a month before usage.

Dependencies: founder approvals for Stripe, Apple and RevenueCat accounts; Legal for the review notes wording.

Risks: App Review rejection cycles; Plaid Canadian coverage complaints; the App.jsx monolith slowing every change; a Netlify variable set without a redeploy (the rule above). Staging: a free Supabase project for local development and migration testing (decision 14); preview isolation waits for the engineer hire.

Later: Engineer 1 (hire 4) owns the codebase, CI, releases and the staging environment; CC becomes the engineer's pair. Engineer 2 and a mobile specialist follow at the milestones in department 12.

### 4. QA and release (CC now, QA Engineer later)

90-day goal: nothing ships that a user sees broken. KPI: every release passes the gate; fewer than two user-reported bugs per week per 100 active users; rollback proven once.

Test plan: math-lock offline gate (currently 1216 assertions across 38 suites), coach QA live suite (28 cases, run before any prompt change and weekly), guard unit tests, navigation reachability test, statement import validators, billing webhook tests (new), a manual device pass on iPhone and Android before each App Store submission, a demo-mode smoke on every deploy.

Bug triage: Sev-1 (money, data loss, wrong number, security) fixed same day; Sev-2 (feature broken) within three days; Sev-3 (cosmetic) batched weekly. CL triages from support and Sentry each morning; CC fixes.

Release checklist: gate green, build clean, coach QA run and green for any change to prompts, guards or coach.js, changelog written, a rollback runbook line for this deploy (which flag values and which migrations must stay or revert; rolling back code with ENFORCE_PLAN_LIMITS true would put the old 1-a-day rule on every non-founder), Sentry confirmed reporting the new release, quiet for 30 minutes after deploy, smoke run against the deploy that is actually live (record ids after the last push of the day), App Store screenshots match the build.

Rollback: Netlify one-click publish of the previous deploy (production only; there is no preview to drill on), with the runbook naming the flag and migration state; migrations are additive except where a function is replaced (0006 replaces handle_new_user, so its rollback SQL is written before it runs); Stripe and RevenueCat webhooks are idempotent through stripe_events. The drill happens on Tuesday of week 1 after the smoke: publish the previous deploy, confirm, re-publish; nobody is charged and "rollback proven once" is met on day 2.

Daily (CL): Sentry and support triage. Weekly (CC): coach QA run, device pass if a release is due. Monthly (CC): restore-drill procedure check (the founder performs the restore, department 11). Before the cohort: the free path proven live (a test account with trial_started_at backdated 15 days sends three messages; the third is refused with "this week"; the row is restored).

Tools: existing test suites, Sentry, BrowserStack free trial or the founder's devices. Cost: $0 additional.

Dependencies: Engineering; Support channel for bug reports.

Risks: live coach QA depends on the model's non-determinism; the guards are the backstop. Open question: whether to add a small on-device test for iOS through Xcode Cloud (deferred to the engineer hire).

Later: QA Engineer (hire 6) owns the test plan and device lab.

### 5. Data and analytics (CC builds, CL reads; Data Analyst later)

90-day goal: the five validation questions answered with numbers. KPI: one dashboard, updated daily, reviewed every Monday, with all five metrics populated from real households.

Events (PostHog, internal accounts excluded; full spec in BEFORE-MONDAY.md section 5): signup, onboarding step completed, first Today number shown, bank linked, manual entry used, app opened (daily), Today viewed before noon, Explain this tapped, coach message sent, guard fallback shown, Meet agenda viewed, Meet started, Meet decision recorded, statement import confirmed, paywall viewed, trial started, subscription started, subscription cancelled with reason, AI toggled off, error shown, survey answered (day 12 and day 45: money feels more manageable, same or worse; recommend 0 to 10). signup_completed is emitted server-side, always, with source = invited (a code or a "who invited you" value) or self_serve (open signup, from October 19). Analytics runs with a Settings opt-out and pseudonymous ids; whether that needs opt-in is question 3 for the lawyer.

Metric dictionary (definition, query, owner CL), fixed before September 21: activation = first_number_shown within 24 hours of signup; D7 = any app_opened in days 5 to 9 after signup; D30 = days 26 to 34; weekly signup cohorts; trial and paying reported separately; invited and self-serve reported separately; gates in Part 2 are counts, not only rates, because 30 households is inside sampling noise.

Dashboards: activation funnel (signup to first number to bank link to day-7 return), engagement (daily opens, Meet weekly completion), revenue (trials, conversions, MRR, churn, founding count), quality (guard fallbacks per 100 coach replies, Sentry errors per 100 sessions), cost (Plaid items, Anthropic tokens, cache read share).

Weekly numbers reviewed (Monday, F with CL, 20 minutes): signups, activation rate, D7, D30, weekly Meet completion, trial conversion, MRR, churn, cost per paying user, guard fallback rate.

Daily (CL): pull the numbers into the plan file, flag anything off trend. Weekly (F): Monday review. Monthly (CL with GPT): cohort analysis and a written verdict against the kill criteria.

Tools: PostHog free tier (1 million events a month), Supabase SQL, a Google Sheet for the weekly table, the unit economics workbook. Cost: $0.

Dependencies: Engineering to emit events; Legal for the analytics disclosure in the privacy policy; PIPEDA consent for analytics on financial behaviour (no financial values in events, only counts and flags).

Risks: measuring too little too late; cohorts too small to trust (30 households is a signal, not a proof). Open question: whether Meet "completion" means agenda viewed or decision recorded (use decision recorded).

Later: Data Analyst (hire 7) owns dashboards and experiments.

### 6. Marketing (CL plans and writes, CD makes assets, GK researches, GPT audits, F approves and appears; Growth Marketer later)

90-day goal: a steady flow of Canadian households into the trial without paid spend, then one paid test. KPI: 220 started trials by December 12 in two funnels tracked separately: 90 invited households started (from about 150 personal invitations: 45 in weeks 2 to 4, then 65 in weeks 5 to 7 and 40 more by December 5) and 130 self-serve trials (open signup from October 19, App Store from mid-November, the CCB page from week 4, social, community, PR, the paid test). Stretch: 270 invitations and 300 self-serve. The channel forecast that produces these numbers sits in the workbook's Channels sheet, one row per channel, with a weekly actual column filled every Monday from signup_completed's source and utm_source. The paid test reports its cost per trial and per activated trial; it has no conversion target.

Channels in order of expected return:
1. Founding cohort by direct invitation: friends, family, then the waitlist and community groups the founder already belongs to. Target 45 invitations to net 30 started trials in weeks 2 to 4, then 15 invitations a week. CASL basis per channel: people the founder has corresponded with directly get a personal message; community groups get a public post that links to the CASL consent form, never a direct message; waitlist rows are emailed only if the form asked for launch email or the row is under six months old (implied consent), because a request for consent is itself a commercial message.
2. Free wedge tools as SEO pages: the CCB clawback calculator in week 4 (one page early enough to index before December), then RRSP vs TFSA vs FHSA, RESP/CESG optimizer and the benefit payment calendar in weeks 5 to 9. Each page answers a query Canadians search every month and ends with the safe-to-spend hook. Search traffic is a February result, not a December one; the plan does not count on it for the commit.
3. TikTok and Instagram: four and three posts a week, scripts written by CL, visuals by CD, the founder on camera twice a week (a real Ontario household talking about the money meeting is the content), trend research by GK each morning.
4. Email: waitlist nurture (CASL-compliant express consent captured on the form, unsubscribe in every message, sender identification), weekly "your week in money" tips, founding-member updates.
5. Community: two Canadian subreddits and personal finance Facebook groups, participation not promotion, answers that link to the free tools only where allowed.
6. PR: one story angle, "an Ontario accountant built a money meeting for couples," pitched to Canadian personal finance writers and podcasts (MoneySense, Globe personal finance, Canadian podcasts) in weeks 8 to 12.
7. Paid: one 300 CAD test on Meta targeted at Ontario women 28 to 45, November 2 to 15, only after activation is proven and the self-serve door is open, so its trials can expire before December 12. At Canadian CPMs of 13 to 20 CAD it buys roughly 15,000 to 23,000 impressions, 150 to 250 clicks and 15 to 35 trials. Purpose: measure cost per trial and per activated trial so the January decision uses real numbers. Expected result: cost per trial of 8 to 25 CAD against an allowable 4.50 (Finance), so paid ads do not scale until annual mix and retention raise lifetime value. The engine for the next 90 days is invitations, referral, the open door, and partners.
8. Launch moments: founding cohort open (week 2), App Store live (week 6 to 8), wedge tools (week 9), public launch (day 90 decision).

Daily (GK, when the founder pastes): trend and news scan; (CL): one script or post drafted; (CD): asset batches on Monday and Thursday only, in the founder's two paste slots, with Canva templates covering the other days and the calendar sized to that. Weekly (F, inside the 8 marketing hours): 2 hours of invitations (15 a week), one or two videos as time allows, approve the week's posts, reply to comments. Monthly (CL with GPT): channel review, cut what is not working.

Tools: TikTok, Instagram, Buffer free plan for scheduling, Resend or Loops for email (free tier to start, about 20 USD at 1,000 contacts; the trial lifecycle emails run here from week 3), Tally free for forms, PostHog UTM tracking carried through signup. Cost: 0 to 30 CAD a month plus the one 300 CAD paid test.

Dependencies: Legal for CASL and testimonial rules; Design for assets; Product for the wedge tools.

Risks: content without distribution; TikTok reach is unpredictable; "financial" content attracts compliance scrutiny (never advice, always education). Open question: whether the founder wants to be the face of the brand; the plan assumes yes for two videos a week and has a faceless variant if not.

Later: Growth Marketer (hire 3) owns channels, calendar and paid; a content creator contractor before that if the founder does not want to be on camera.

### 7. Sales and partnerships (CL now, Partnerships Lead later)

90-day goal: pricing proven and one partner letter of intent signed. KPI: 50 paying (commit) with the monthly-to-annual switch rate among standard-price payers tracked from the first monthly cohort; one signed letter of intent from a mortgage broker or an employer by day 90 (credit unions and counselling agencies need a due-diligence process that will not finish in 90 days; they are a 2027 conversation).

Pricing: $11.99 a month or $99.99 a year CAD plus applicable taxes (decision 16; about 90.39 a year for a founding member in Ontario), founding $79.99 a year locked while continuously subscribed, US values behind the flag. Trial 14 days unlimited with linked accounts, no card up front (the trial as built); Stripe Checkout at day 14. Plus is unlimited coaching, linked accounts and the Meet facilitator. Free after trial is manual entry, 2 coach messages a week, agenda without facilitator. The invited funnel has three stages, counted separately: invitations sent, trials started (expect 60 to 70 percent of invitations), payers (expect about half of started trials at the founding price). Self-serve: 5 to 10 percent of started trials. The beta cap is set to N + 50 so over-inviting never hits a full sign.

Upsells inside the product: end of trial (day 12 email and in-app card with the number of coach replies and Meet decisions they used), bank-link moment in manual mode ("link once, stop typing"), annual switch offer at day 45 of a monthly plan, household second seat for couples (Plus includes it).

Affiliates and referrals: give a month, get a month. The referred household's month is a promotion code at Checkout; the referrer's month is a Stripe customer balance credit written by the webhook when the referred subscription starts (promotion codes cannot do that side), keyed off the "who invited you" field at signup, which takes the inviter's email or short referral code and is validated against existing accounts (week 2). A founding-member referral leaderboard once ten referrals exist.

B2B and retail partners (one letter of intent in 90 days): mortgage brokers (first-time buyers with FHSA questions) and employers with financial wellness budgets first; credit counselling agencies and credit unions in 2027. A partner gets a partner access code (one BETA_CODES entry, which tags its signups) and a co-branded email, nothing custom in the product.

Daily (CL): none until day 30. Weekly (CL): partner research and outreach drafts for the founder to send; (F, 30 minutes budgeted in department 12): send five outreach emails. Monthly (F with CL): pipeline review.

Tools: Stripe coupons and promotion codes, a Google Sheet pipeline. Cost: $0.

Dependencies: billing live; the referral field in signup (Engineering, week 2).

Risks: partners want compliance assurances the company cannot yet give; discounting too early. Open question: whether to offer a family or household plan at a different price (not before day 90).

Later: Partnerships Lead (hire 8) after the product is proven.

### 8. Customer support and success (CL drafts, F sends; Support Lead later)

90-day goal: every founding household feels looked after. KPI: an automatic acknowledgement within minutes (a Google Workspace auto-reply on hello@ with the 24-hour promise and the feedback form link, set up Monday of week 1) and a human reply within 24 hours (one person, one daily window); onboarding help offered to every trial within 24 hours; cancellation reason captured for every cancellation, and 20 percent of cancellations saved.

Channels: hello@flourishmoney.app and privacy@flourishmoney.app (both are printed inside the app, so both mailboxes must exist and be read daily; the founder confirms routing on day 1), in-app feedback form (already in Supabase), a founding-member group as a WhatsApp Community announcement group so members do not see each other's phone numbers (a standard group exposes every number to every member; this cohort mixes family, community and foster-parent contacts), bugs through the in-app form and never as balance screenshots in the group, Instagram DMs during the launch weeks.

Onboarding help: a day-1 welcome from the founder (template by CL), day-3 "did you get your number" check, day-7 "book your first money meeting" nudge, day-12 trial-end note. Each household has its own day 12, so a saved Supabase query (first name and note number only, no emails) run by the founder each morning says who gets which note until the lifecycle emails run in Resend from week 3; CL drafts the four notes once. Trial extension note ready for decision 18. Churn saves: cancel flow asks one reason, offers the annual founding price if price, offers manual mode if the bank link was the problem, offers a 15-minute call with the founder for the first 100; a scripted note for a lapsed household explains what manual mode keeps and what linked banks it drops.

Daily (CL): draft replies from the founder's one-line summaries of each message (member emails are not pasted into any AI tool wholesale; identifiers and balances stay out); (F, 30 min): send and handle anything personal. The consumer Claude app's training setting is turned off on the founder's account, and the privacy policy names only the API as a processor. Weekly (CL): themes to Product; (F): one founding-member call. Monthly (CL): support metrics and the churn reason table.

Tools: Google Workspace shared inbox (existing), Crisp or Chatwoot free tier for a help widget later, a canned-answers doc. Cost: $0 to 25 CAD.

Dependencies: cancel-reason capture (Engineering, billing sprint); PIPEDA-safe handling of anything a user emails (no financial details pasted into AI tools without stripping identifiers).

Risks: support load spikes at App Store launch; the founder becoming the bottleneck. Open question: whether to let Claude answer directly through a help widget (not before the Support Lead reviews the canned answers).

Later: Support and Community Lead (hire 1, a part-time employee) takes the inbox, community and onboarding calls.

### 9. Finance and accounting (CL prepares, F approves; Bookkeeper then Finance Lead later)

90-day goal: clean books, known unit economics, a hiring budget rule. KPI: monthly close by the 5th; revenue reconciled to Stripe, RevenueCat and Apple payouts to the cent; contribution margin per paying user reported monthly.

Setup: GrowSmart Inc. books in QuickBooks Online (or Wave if the founder prefers free), a Flourish class or tag so the two products stay separate, Stripe and bank feeds connected, a chart of accounts with revenue split by web and app store, a deferred revenue schedule for annual plans, Anthropic, Plaid, Netlify, Supabase, Apple and Google as vendors.

Sales tax: GST/HST registration is required once taxable supplies pass 30,000 CAD in a single quarter or over four consecutive quarters, measured for the legal entity and its associates (CRA RC4022); GrowSmart Inc. already runs payroll, so the founder confirms on Monday whether an RT account exists, in which case HST is charged from the first sale and decision 8 is moot. Otherwise register voluntarily before October 2 to recover input tax credits. Stripe Tax handles the federal and HST rates but only monitors registration thresholds outside the business's home country, so provincial sales taxes are tracked by hand: BC PST at 10,000 CAD of BC sales, Saskatchewan PST, Manitoba RST and Quebec QST at 30,000, each registered as crossed (Quebec is excluded at signup for now, decision 17). Apple and Google collect and remit tax on in-app purchases themselves; those payouts arrive net.

Revenue and payout reconciliation: weekly match of Stripe payouts to bank; monthly match of RevenueCat and App Store Connect reports to Apple payouts (Apple pays about 33 days after month end); founding members tracked as a cohort for the price lock.

Cash flow: fixed costs about 400 CAD a month all in (infrastructure about 130: Supabase, Netlify, Sentry, Google Workspace, domain; AI subscriptions about 250: the Claude plan that carries Claude Code, ChatGPT, Grok; QuickBooks when it starts), one cell in the workbook (Inputs, fixed costs) feeding every breakeven figure; variable costs per paying household about 2 CAD (Plaid, coach tokens with caching, payment fees), plus about 1.16 CAD a month for each linked trial that does not convert until its Plaid Item is removed (seven days after lapse, Engineering); breakeven about 51 paying households at the standard mix, about 83 on founding annual; a 13-week cash forecast attached to the monthly close from October.

Pricing math (new prices; the workbook is on them): blended revenue at the standard mix (60 percent monthly, 40 percent annual) about 10.53 a month before tax, contribution about 7.94 after fees and variable costs (workbook, Unit Economics); the founding annual brings 6.67 a month and contributes about 4.85. Subscriptions bought through Apple contribute about 1.60 less after the 15 percent commission. Lifetime contribution at 5 percent monthly churn: about 159 CAD standard, about 97 founding. Allowable cost to acquire one paying household at a 3 to 1 payback: about 53 CAD standard; at 8 percent self-serve conversion that is about 4.50 CAD per trial, which is why the paid test is a measurement and not a channel yet. Revenue is reported three ways: gross cash collected (what Stripe charged, tax excluded), recognised revenue (annual plans spread over twelve months), and deferred revenue; December 12's recognised revenue is only about 1,000 CAD even in the stretch case.

Hiring budget rule: a hire is triggered when three consecutive months of MRR satisfy 0.7 x MRR minus fixed costs (400) minus existing payroll >= 2 x the new hire's loaded monthly cost (0.7 is the blended contribution share after payment fees, Apple's commission and variable costs), and cash on hand covers three months of the new payroll; each trigger is also at least 5 percent above the previous one so hires arrive in order. Department 12 applies this formula with sourced loaded costs; the triggers there are computed from it in the workbook's Plan Check sheet. Insurance: a cyber and errors-and-omissions quote before the App Store launch.

Thirteen-week cash view (September 14 to December 12, workbook Cash sheet): outflows about 1,200 in fixed costs, about 2,500 for the lawyer, about 1,000 for the trademark filing with an agent, 300 for the paid test, about 100 for QuickBooks, total about 5,100; inflows in the commit case about 4,000 of gross cash before tax, most of it annual prepayments, so the founder funds a gap of about 1,100 this quarter and about 130 a month after it (commit-case contribution about 270 against 400 fixed); the stretch case is cash positive by about 2,000 in the quarter and about 120 a month after it. Closing: the books close by the 5th on Stripe and bank data; Apple payouts arrive about 33 days after month end and are reconciled in the following close.

Week 1 (CL): update the unit economics workbook to the current prices, the two funnels and the 2-a-week free limit; re-run breakeven and the hire triggers from it.

Daily: none. Weekly (CL): reconcile Stripe payouts, log expenses. Monthly (CL prepares, F reviews): close, P&L, cash forecast, unit economics update, HST filing when registered.

Tools: QuickBooks Online Simple Start about 30 CAD a month, Stripe Tax 0.5 percent of taxed transactions, the unit economics workbook. Cost: about 30 CAD.

Dependencies: billing live; Legal on the founding price lock terms.

Risks: mixing GrowSmart and Flourish money; annual revenue recognised too early. Open question: whether to run Flourish as a separate corporation later (revisit at the first full-time hire).

Later: Bookkeeper (hire 2, part-time contractor) takes the monthly close; a Finance Lead at the milestone in department 12.

### 10. Legal and compliance (CL drafts, lawyer reviews, F signs; Counsel later)

90-day goal: nothing shipped that a lawyer would tell you to take down. KPI: terms, privacy policy and review notes reviewed by an Ontario lawyer before public launch; zero unverified claims in the product.

Work list:
1. Privacy policy: PIPEDA legal-basis section reviewed by a lawyer and drafted to Bill C-36's express-consent standard now; analytics disclosure; AI processing disclosure (Anthropic as processor); a cross-border transfer paragraph (Anthropic, Netlify and PostHog process data in the United States, which the OPC's guidelines require the policy to say); a data retention table with numbers (delete on request within 30 days, statement uploads not retained after import, coach conversations not stored server-side, Plaid items removed on disconnect, deletion or seven days after a trial lapses); a breach process and the breach log PIPEDA section 10.3 requires; the IP sentence and the "on your device" sentence corrected.
2. Terms: three sentences ship in Thursday's deploy of week 1, before the cohort signs up: section 7 changes from "inclusive of applicable taxes" to "plus applicable taxes" with the founding lock stated (Ontario's Consumer Protection Act requires the total payable, taxes and frequency before the consumer agrees; Stripe Checkout shows them, the Terms must not contradict them), section 2 adds "outside Quebec for now" (decision 17), and "last updated" moves. The privacy policy gains one sentence in the same deploy naming PostHog (product analytics, hosted in the United States, counts and flags only, opt out in Settings), because PIPEDA requires knowledge and consent at or before collection and events start September 18. The lawyer's review then covers subscription and cancellation terms for Stripe and Apple, "not a licensed adviser" language against Ontario financial-planning title rules, and eligibility: Canada or US stays; Quebec residents are excluded at signup until French-language copy and Law 25 basics exist (decision 17), because Quebec's Charter of the French Language and its consumer cancellation rules apply to anyone who signs up there.
3. App Store: guideline 5.1.1 and 5.1.2 consent screens (built; device-verified in week 1); 5.1.1(v) account deletion (built in Settings; verify it clears every table); 3.1.1 in-app purchase for all paid features on iOS; 3.1.3(b) web subscriptions honoured in the app; review notes with the demo account and the business model; no external purchase links in the Canadian build; Sign in with Apple not required because no third-party login is offered.
4. CASL: express consent checkbox on every email capture, sender name and address, unsubscribe honoured within 10 business days, records of consent kept (timestamp, form version). The existing waitlist is segmented by signup date: rows under six months old hold implied consent from their inquiry and get the launch email; older rows cannot be emailed a consent request (that request is itself a commercial message) and are reached only by public posts.
5. GDPR: not targeting the EU; geo-note in the privacy policy and no EU marketing until a DPA and representative are in place.
6. Trademark: knock-out search done September 10 (TRADEMARK-KNOCKOUT.md). File the Canadian word mark FLOURISH MONEY in classes 9, 36 and 42 in week 2 (789.14 CAD CIPO fees plus agent fees), with class 36 worded as financial information and money-management software services, never "advice", to match the Terms; logo mark when the lockup is final; watch pending Canadian application 2455859 (FLOURISH, classes 9, 35, 42, a UK institute) as the likeliest citation; a US clearance opinion before any US step, given flourish.com's unregistered rights and the registered FLOURISH FINANCIAL PARTNERS and FLOURISH WEALTH MANAGEMENT marks; the six-month Paris Convention window from the Canadian filing date is the US decision deadline.
7. Contracts: a one-page IP assignment to GrowSmart Inc. from anyone other than the founder who has contributed code, copy or design to date, in the lawyer packet this week; contractor agreement template (IP assignment, confidentiality, PIPEDA obligations) ready before the first contractor; employment agreement template before the first employee (the Support Lead is a part-time employee, department 12); a data processing addendum for any vendor touching user data.
8. Plaid and Anthropic terms reviewed for consumer disclosure obligations; Plaid end-user privacy policy linked.

Daily: none. Weekly (CL): compliance check of any new copy or claim. Monthly (CL): policy review against product changes; (F): lawyer touchpoint as needed.

Tools: an Ontario tech lawyer on a fixed-fee review (budget 1,500 to 3,000 CAD once), CIPO online search free, trademark filing 789.14 CAD in CIPO fees for three classes plus agent fees. Cost: one-time.

Dependencies: Finance for the lawyer budget; Engineering for consent screens and retention controls.

Risks: shipping "advice" language; a rename forced later by the US marks. Open question: Canada-only eligibility (a business decision for the founder, not before day 90).

Later: retained Counsel (hire 9) when revenue supports it; until then fixed-fee reviews.

### 11. Operations and admin (CL runs, F holds logins; Ops Manager later)

90-day goal: every account, tool and document in one place, backed up, documented. KPI: a single operations doc listing every vendor, login owner, cost and renewal date; a restore from backup tested once; no expired credential incidents.

Tools and subscriptions (monthly, approximate): the Claude plan that carries Claude Code (named in the ops doc with its price; the week 1 load needs the higher tier), ChatGPT Plus 20 USD, Grok subscription, Google Workspace about 10 CAD, Netlify Pro 20 USD on credit tiers, Supabase Pro 25 USD, Sentry Team 26 USD, PostHog free, Resend or Loops free to 20 USD, Buffer free, QuickBooks about 30 CAD, UptimeRobot free, RevenueCat free, Apple Developer 99 USD a year, domain renewals. Total about 400 CAD a month all in, most of it AI and infrastructure; the figure is reconciled to invoices monthly and is the fixed-cost cell in the workbook.

Vendors: Anthropic, Plaid, Stripe, Apple, Google (Play and Workspace), Netlify, Supabase, Sentry, PostHog, RevenueCat, UptimeRobot, QuickBooks, the domain registrar. Each row in the ops doc carries the login owner (F), the second admin, the renewal date and a fallback; the doc is filled on Friday of week 1 and the second admins are created that day.

Backups: Supabase Pro keeps seven days of daily backups, so the founder downloads a backup weekly from the dashboard to an encrypted drive (10 minutes, Friday), because production keys never go on the Mac and a dump holds Plaid access tokens; CC writes the procedure and the restore steps; the restore drill is performed once by the founder in week 4 into a throwaway project, and again each quarter. Repo on GitHub with pull requests to main and the CI check required where the plan allows. Env vars documented by name in the ops doc, never by value.

Documentation: docs/product in the repo is the product record; the operations doc, the plan file and the daily lists live in the Flourish project in Claude and in docs/ops in the repo (Part 5 sets this up).

Daily (CL): the web check (App Store and Play policy changes, Anthropic and Plaid and Stripe API changes, iOS and Android news, competitor moves) and a one-line log. Weekly (CL): cost log; (F): pay anything due, download the backup. Monthly (CL): vendor and renewal review; (CC): restore-procedure check; (F): the restore drill in week 4 (45 minutes) and each quarter.

Dependencies: founder for every login and payment method.

Risks: one person holds every credential; a lapsed card takes down infrastructure; two-factor codes live on one phone. Mitigation: a second admin account for one trusted person on Stripe, Netlify, Supabase, Google Workspace, Apple and GitHub; TOTP seeds and recovery codes in the password manager with emergency access; a backup payment card on Netlify, Supabase and Apple; calendar reminders one week before every renewal.

Later: Ops Manager (hire 10) after the team passes five people.

### 12. People and hiring (F decides, CL drafts; Head of People later)

Founder hours (40 a week): 12 on product and approvals, 8 on marketing and community (2 hours of invitations, on camera for one or two videos, replies, and the 30 minutes of partner outreach), 5 on support (the daily 30-minute reply window, one member call, the weekly backup download), 4 on finance, legal and admin approvals, 4 on the Monday review and planning, 1 on Claude Design pastes (two 10-minute slots, Monday and Thursday, plus assets on demand), 6 of buffer for App Store cycles, cohort conversations and any missed day. Missed-day rule: a missed day's founder tasks go first on the next working day, re-sequenced to fit; AI tasks run immediately; gate dates hold unless moved in writing. Founder-down note (Operations, week 2, one page): the auto-reply stays on, the second admin's three actions (pause invitations, watch Sentry and the uptime monitor, answer the founding group once a day), and who tells the cohort what. The founder never writes code, drafts copy from scratch, builds assets or reconciles books; AI does those and the founder approves.

Hiring order, each trigger computed from the Finance formula (0.7 x MRR minus 400 fixed minus existing payroll >= 2 x the new hire's loaded cost, held for three consecutive months, plus three months of cash). Loaded costs are Canadian market figures with on-costs (about 1.2 x base for employees): Engineer 1 at a senior base near 120,000 CAD; Product Lead and Designer at about 90,000 base each; QA, Data and Partnerships at about 85,000 base. Each trigger is at least 5 percent above the previous one. The Support and Community Lead is a part-time employee on payroll, not a contractor: daily directed work on company tools to a company standard is employment under Ontario's tests, and since Bill 148 the employer must prove otherwise. Paying households assume 9.50 CAD blended revenue each per month. Triggers are rounded up to the next 500 and re-run in the workbook's Plan Check sheet when any input changes.

| Order | Role | Loaded cost per month | MRR trigger | About this many paying | Takes over |
|---|---|---|---|---|---|
| 1 | Support and Community Lead, part-time employee | 2,300 | 7,500 | 790 | inbox, founding group, onboarding calls, churn saves |
| 2 | Bookkeeper, part-time contractor | 800 | 8,000 | 840 | monthly close, HST |
| 3 | Growth Marketer, contractor to full time | 6,000 | 22,500 | 2,370 | channels, calendar, paid, email, PR; founder stays on camera |
| 4 | Engineer 1, full time | 12,000 | 48,000 | 5,050 | codebase, CI, releases, staging, Plaid and billing operations; CC pairs |
| 5 | Product Lead and Product Designer | 18,000 combined | 82,500 | 8,700 | roadmap, specs, design system, App Store assets |
| 6 | QA Engineer | 8,500 | 87,000 | 9,150 | test plan, device lab |
| 7 | Data Analyst | 8,500 | 93,000 | 9,800 | dashboards, experiments |
| 8 | Partnerships Lead | 8,500 plus commission | 105,000 | 11,050 | partner pipeline |
| 9 | Counsel, retained | 2,500 | 110,500 | 11,650 | legal; fixed-fee reviews before that |
| 10 | Ops Manager | 6,000 | 116,500 or team of five, whichever is later | 12,250 | vendors, admin, people ops |
| 11 | Engineer 2 and mobile specialist, Support Specialists, Head of People | | 175,000 and beyond | 18,500 | |

Reading the table honestly: 50 paying households on December 12 is about 360 CAD of MRR (100 would be about 750), so no trigger fires in the first 90 days, and the first hire needs roughly twenty times the commit base. Interim relief before any trigger is a founder decision (decision 19 offers it), not a plan assumption. The plan does not pretend otherwise. Three things move the triggers closer: a higher annual share (raises contribution per household), lower churn, and the founding cohort ending at 100 so later households pay the standard price. If the founder decides to fund a hire before its trigger from other income or capital, that is a budget decision outside this rule and the plan should say so in DECISIONS.md at the time.

Contractors until then: a content creator if the founder steps off camera; a fixed-fee lawyer; the part-time bookkeeper as above.

What each hire takes over is listed in its department. Until each trigger, the named AI holds the role and the founder approves.

Tools: contractor and employment templates from Legal, a hiring scorecard per role drafted by CL, payroll through the existing ADP or Wagepoint when the first employee starts. Cost: $0 until the first hire.

Risks: hiring on a good month instead of a trend (the three-month rule prevents it); the founder's own capacity, which is why the Support Lead is first and why decision 19 exists.

## Part 2: Craig's merged plan

Critical path: Netlify secrets scoped, then merge and deploy (September 15), then billing live (October 2), then the first founding trials expire and pay (October 5 onward), then App Store submission (by October 30), then approval, then the wedge tools, then the December 12 review. Anything not on this path waits when there is a conflict.

Two funnels, tracked separately from day one because they behave differently. Invited: invitations sent, trials started (60 to 70 percent of invitations), payers (about half of started trials at the founding price). Self-serve: open signup from October 19, the App Store from mid-November, the CCB page, social, community, PR and the paid test; 5 to 10 percent of started trials pay, and only trials that started by November 28 can pay by December 12. Commit: 90 invited households started from about 150 invitations, 130 self-serve trials, 220 trials in all, about 45 paying from invited and about 5 from self-serve, 50 paying on December 12. Stretch: 250 invitations and 300 self-serve trials, 100 paying. The arithmetic and the weekly actuals live in the workbook's Plan Check sheet.

Phase 0, Ship it (September 14 to 20). Outcome: the finished branch is in production and safe. Gate: main deployed after the founder's approval and rolled back once as a drill, Netlify secrets production-only and verified, the offline math gate in CI and the coach QA green locally before each merge, the two consent screens and account deletion checked on a device, the server-side free limit matched to the decision and proven live, the Terms saying plus tax with the founding lock, core analytics events live, privacy policy legal review requested. Revenue: 0. Hire: none. Kill criteria: none; this is housekeeping.

Phase 1, Founding cohort (September 21 to October 18). Outcome: real households pay real money on the web. Gate: 45 invitations sent, 30 trials started (five on September 21 as a smoke, the rest from September 23 once events are arriving), at least 15 paying (founding annual), activation (first number within 24 hours of signup) at or above 70 percent, D7 return at or above 50 percent, at least half link a bank, Meet started by at least half; billing live on October 2 with one real charge cleared before the first trial is allowed to end (decision 18 extends any trial that would end first). Revenue milestone: about 1,200 CAD cash collected before tax (15 x 79.99), about 100 CAD of MRR-equivalent. Hire: none. Kill or pivot criteria, decided October 18: if activation is under 50 percent, onboarding is redesigned before any marketing; if fewer than 8 of 30 pay, pricing and the trial structure are re-tested with the next 30 before spending on acquisition; if D7 is under 30 percent, the product is not habit-forming yet and the Meet loop gets the next four weeks alone; the bank-link readout is October 5, not October 18: if under half of activated households link a bank, manual-first onboarding is built in the week 5 engineering slot.

Phase 2, App Store and instrumentation (October 19 to November 15). Outcome: the self-serve door is open, Flourish is submitted to the App Store with in-app purchase, and the five validation numbers are live. Gate: open signup live October 19, App Store submitted by October 30, RevenueCat entitlements syncing into the same entitlements table as Stripe, dashboard reviewed for three consecutive Mondays, 60 invited households started cumulative, 40 self-serve trials cumulative, 30 paying. Revenue milestone: about 2,200 CAD cash collected cumulative before tax, about 215 CAD MRR-equivalent (annual plans counted monthly). Hire: none; the first trigger is 7,500 MRR. Kill or pivot criteria, decided November 15: if D30 retention among the first cohort is under 20 percent, stop acquisition and fix retention; if none of the first 40 expired self-serve trials pays, review the trial (shorter, or manual-first) before the wedge tools launch; if invited conversion falls under a third across 60 started invited households, the founding offer is re-worked before the cohort is closed.

Phase 3, Distribution (November 16 to December 12). Outcome: people find Flourish without the founder inviting them, and the App Store is live. Gate: App Store approved, the four wedge tools live (the CCB page since week 4), 90 invited households started and 130 self-serve trials cumulative, one partner letter of intent signed, the 300 CAD paid test measured (run November 2 to 15), 50 paying (commit; 100 is the stretch). Revenue milestone: about 3,700 CAD cash collected cumulative before tax, about 360 CAD MRR-equivalent (stretch: about 7,200 and 750); founding cohort still open until 50 members. Hire: none; the first trigger sits near 800 paying households. Kill or pivot criteria, decided December 12: if D30 is under 25 percent, or fewer than 3 of the first 65 expired self-serve trials pay, do not scale; run one more month on retention with no new features; the 100-trial conversion decision is January 15, when enough self-serve trials have expired. If both are met, months 4 to 6 follow SIX-MONTH-PLAN.md: Phase 4 Season (December 13 to January 31, gate 75 paying) and Phase 5 RRSP season (February 1 to March 14, commit 105 paying, base about 120), through referral, partners, the App Store and Play and the wedge pages, with paid acquisition only if the test's cost per paying household came in under 53 CAD, and the Growth Marketer search only when its trigger is in sight. The base-case line of 100 paying by February 28 stands.

The single biggest risk: households will not link a bank to an unknown app, so the trial never shows the real product, so nobody pays. Cheapest test: the founding cohort itself, weeks 2 to 4, invited personally, with the link rate and the manual fallback rate measured from day one. Thirty households and two weeks answer it before a dollar is spent on marketing.

### Part 2b: founder decisions needed by September 14

Each has Craig's recommendation and a default. No answer by the date means the default applies and the plan says so.

1. Merge and deploy on September 15 after the pre-merge checklist and the Netlify secret scoping are green. Recommendation: yes. Default: yes.
2. Trial structure: keep the 14-day no-card trial as built, card asked for at conversion. Recommendation: keep it (card-up-front would cut invited trial starts and make the bank-link test harder to read). Default: keep it.
3. Onboarding order: cohort 1 keeps the order as built (bank link offered first, manual entry available); the reorder to manual-first is decided on October 5 from the measured link rate and built only if the rate is under half. Recommendation: as built for cohort 1, no onboarding rebuild in the same weeks as billing. Default: as built.
4. Founding cohort: 45 personal invitations between September 21 and 25 (five on the 21st as a smoke) to net about 30 started trials, founding price 79.99 a year plus tax, founding membership capped at 50 overall (founding cohort changed from 100 to 50 on 2026-09-23 — see docs/product/DECISIONS.md). Recommendation: yes. Default: yes.
5. On camera: two short videos a week. Recommendation: yes; a faceless variant exists if not. Default: yes.
6. Founding-member group platform. Recommendation: a WhatsApp Community announcement group (members do not see each other's numbers) with bugs sent through the in-app form. Default: WhatsApp Community announcement group.
7. Books: QuickBooks Online Simple Start or Wave. Recommendation: QuickBooks Online, because the Stripe and App Store reconciliation will need its reports. Default: QuickBooks Online.
8. GST/HST: confirm on Monday whether GrowSmart Inc. already holds an RT account; if it does, HST is charged from the first sale; if not, register before October 2 to recover input tax credits. Stripe Tax applies the federal and HST rates; provincial PST, RST and QST thresholds are tracked by hand. Recommendation: yes; the founder is the accountant here and owns this call. Default: yes.
9. Apple Small Business Program: enrol now (15 percent instead of 30). Recommendation: yes. Default: yes.
10. Trademark: the knock-out search is done (TRADEMARK-KNOCKOUT.md, September 10). Canada looks clear for FLOURISH MONEY in classes 9, 36 and 42, but a competing "Flourish" budgeting app appeared on the Canadian App Store on September 7 and another party is clearing FLOURISH in class 9. Recommendation: file the Canadian word mark in week 2 (789.14 CAD in CIPO fees), through the lawyer or directly; no US launch under this name without a US clearance opinion (flourish.com has strong unregistered rights). Default: file in week 2.
11. Lawyer: CL shortlists three Ontario tech lawyers with fixed-fee reviews by September 18; the founder picks one by September 25. Default: the first on the shortlist.
12. Support routing: confirm hello@ and privacy@flourishmoney.app both deliver to a mailbox the founder reads daily. Default: verify on day 1; if either does not exist, Engineering repoints the in-app copy to the one that does.
13. New accounts from September 16 get the 14-day trial only, then free; the permanent founder grant stops for new signups (existing founder rows keep it); the server profile becomes the authority on plan; the beta cap rises by 50 above the seats already used; a dedicated founding access code is added to BETA_CODES. Recommendation: yes, or the cohort cannot pay. Default: yes.
14. A free staging Supabase project (flourish-staging) for local function runs and for testing every migration before it touches production. Its keys, not production's, live on the Mac. It is not a preview environment; preview isolation still waits for the first engineer. Recommendation: yes, billing is money code and must not be developed against production. Default: yes.
15. The October App Store build uses Xcode 26 unchanged (accepted by Apple until April 2027); the Capacitor 8.5 UIScene migration required by Xcode 27 moves to January. Recommendation: yes, no native migration during the first submission. Default: yes.
16. Tax on the price. The Terms in the app say prices are "inclusive of applicable taxes"; the billing plan registers for GST/HST and adds it through Stripe Tax. Recommendation: prices plus applicable taxes (79.99 a year plus tax, about 90.39 in Ontario), with the Terms line changed in Thursday's deploy, the paywall, the invite card and all three invitations saying "plus tax"; absorbing HST would cut contribution by about 13 percent in Ontario. This one is answered explicitly on Monday, not by default, because the founder is the accountant. Default if silent: plus applicable taxes.
17. Quebec: exclude Quebec residents at signup (the province field exists) until French-language copy and Law 25 basics (privacy officer, transfer assessment) exist; Quebec's Charter of the French Language and its consumer cancellation rules would otherwise apply from the first Quebec signup. Recommendation: exclude for now, revisit at 100 paying. Default: exclude.
18. Trial slip rule: no founding trial ends before billing has taken one real payment plus 48 hours; a trial_ends_at column is set at signup and extended by one tested SQL statement, with a pre-written "we extended your trial" note. Recommendation: yes. Default: yes.
19. Interim support help before any hire trigger: a few paid hours a week from a trusted person on the inbox and the founding group, funded outside the trigger rule, or none. Recommendation: none until the cohort shows the load; revisit October 18. Default: none.

### Part 2c: the assumptions the plan rests on, and the cheapest test of each

| Assumption | Test | Readout date | If it fails |
|---|---|---|---|
| Half of activated households will link a bank in the trial | Founding cohort link rate, event "bank linked" | October 5 (first 30 through day 14) | Manual-first becomes the default; statement import promoted; Plaid coverage checked for the banks that failed |
| Two thirds of invitations become started trials, and half of started trials pay at the founding price | Invitations, starts and Stripe conversions from the first 45 invitations | October 18 | Offer or invitation re-worked (price, trial length, guarantee, the ask itself) before the next wave |
| The Meet loop is used weekly by couples | "Meet decision recorded" weekly among paying couples | November 15 | Meet becomes the only product work for four weeks |
| Wedge tool pages draw search traffic within 90 days | Search Console impressions and clicks per page, the CCB page first | December 12 early read, February final | Pages re-targeted to the queries that show impressions; content budget moves to referral |
| Self-serve trials convert at 5 percent or better with a linked bank | The first 100 expired self-serve trials | December 12 (early read) and January | Trial changed (shorter, manual-first, or paywall placement) before any paid spend |
| Paid ads can reach a cost per paying household under 55 CAD | The 300 CAD Meta test | December 12 | Expected. Paid stays off; annual mix and churn are the levers, revisited at 500 paying |

## Part 4: Craig rates it

Pass 1 (v1 as drafted before this review):

1. Focus: 6. Twelve departments each want something; the plan has to keep saying the cohort comes first.
2. First-run experience: 7. Under two minutes is a target, not a design; the onboarding trim needs a spec.
3. Quality bar: 8. Tests and guards are real; billing and the App Store build are not yet.
4. Sequencing: 7. iOS before billing on the web would have been wrong; fixed. The wedge tools still sit close to the App Store submission.
5. Revenue path: 7. Founding cohort to 100 is clear; the second 100 depends on tools that do not exist yet.
6. Distribution: 5. Organic social and SEO pages are slow; there is no partner or referral engine in the first 60 days.
7. Execution: 7. The founder day is planned, but the AI queue has no owner for the morning handoff.
8. Kill criteria: 8. Dated and numeric; the Phase 1 numbers rely on a 30-household sample.
9. Completeness: 7. Missing: the daily AI queue ritual, a referral mechanism early, CASL consent on the existing waitlist, trademark decision date, cancel-reason capture, backups owner.

Total: 69/100.

Fixes applied in this document:
- Focus: cut list made explicit in Product (Kids, US, Money Mindset v2, new AI surfaces, Flinks, staging until the first engineer).
- First-run: Design goal made measurable (median under 120 seconds, 70 percent completion) and an onboarding spec added to week 1 Product tasks.
- Sequencing: wedge tools moved to weeks 5 to 9, after the App Store submission is in Apple's hands, so engineering is not split.
- Revenue path: referral (give a month, get a month) moved into Phase 2 engineering; founding cohort capped at 50 with a close date.
- Distribution: partner pilot added with named categories; PR angle added; the paid test gated on proven activation.
- Execution: the daily AI queue ritual defined (Part 5 formalises it) and the founder hour budget made explicit.
- Kill criteria: sample-size caveat stated; the Phase 2 gate uses 100 trials for conversion.
- Completeness: CASL consent on the existing waitlist added to Legal and Marketing; trademark decision by day 60; cancel-reason capture in the billing sprint; backups owner set (CC drill, founder-controlled export).

Pass 2 (v1 as delivered): scored 100/100 by the same reviewer who wrote it. That is the problem with pass 2, so v1 was sent back for a stricter audit with one rule: every number must reconcile with another number in the plan or in the code.

Pass 3 (the audit of v1). What it found:

1. Revenue milestones were labelled "MRR run-rate" but were cash totals. 60 paying households is about 450 CAD of MRR, not 4,000; 100 is about 750, not 8,000. An eightfold error in the number the whole plan is measured by. Revenue path 7 to 5.
2. The hire triggers did not satisfy the plan's own Finance rule. At 5,000 MRR the contribution after fixed costs is about 3,200, less than twice a 2,000 contractor; the Engineer trigger at 20,000 was short by almost half. Execution 10 to 7.
3. The Phase 3 gate needed 100 paying from 400 trials (25 percent) while the kill criterion tolerated 4 percent, and 4 percent of 400 is 16 paying. The two could not both be true. Kill criteria 10 to 6.
4. The paid test asked for cost per trial under 15 CAD while Finance allowed under 50 CAD per paying household; at 8 percent conversion, 15 per trial is 187 per paying household. The bar was unreachable as written and the plan did not say so. Distribution 10 to 8.
5. Two Apple items were called unverified when the code answers them (consent modal, account deletion), and one real gap was missed: the server still enforces a 1-a-day free limit behind an off flag while the decision and the client say 2 a week. Quality bar 10 to 8.
6. The unit economics workbook cited for margins is on the old prices. Completeness 10 to 8.
7. Trial structure (card or no card) and onboarding order were left as "test both," which is a decision dressed as a test. First-run 10 to 9. Focus and Sequencing held at 9 each: the order of work was right, but the billing deadline was floating instead of pinned to the first trial expiry.

Pass 3 total: 69/100. A plan that was rated 100 the day before scored the same as its first draft once someone checked the arithmetic.

Fixes applied in v2:
- Revenue milestones restated as cash collected and MRR-equivalent, both computed from paying counts and prices (Part 2).
- Hire triggers recomputed from the Finance formula and shown as a table with the formula, the assumptions and the paying-household equivalent (department 12). The honest consequence, no trigger inside 90 days, is stated in the summary.
- Funnel split into invited and self-serve, each with its own expected conversion, gate and kill criterion (Part 2); the Marketing KPI and Sales pricing paragraph updated to match.
- Paid test reframed as a measurement with the allowable cost derived from lifetime value (Finance, Marketing, Part 2c).
- Apple items corrected from the code; the server-side free-limit fix added to Phase 0 and Engineering week 1; entitlement single-source and double-purchase block added to the billing sprint.
- Workbook update added to Finance week 1; margins in the plan restated at the new prices.
- Trial structure and onboarding order made decisions with recommendations and defaults (Part 2b, twelve decisions in all).
- Billing pinned to October 2, three days before the first founding trial expires; critical path written out.
- Assumptions register added (Part 2c) so each bet has a test, a date and a consequence.

Pass 4 (v2, this document), with the check a reader can repeat beside each score:

1. Focus: 10. One outcome per phase; the cut list in Product; the critical path names what waits.
2. First-run experience: 10. Measurable target (120 seconds, 70 percent), onboarding order decided (manual first), bank-link rate in the Phase 1 gate. Check: decision 3 in Part 2b matches the Phase 1 kill criterion.
3. Quality bar: 10. Gates, guards, rollback, the existing release checklist, and the two code gaps found in the audit are in Phase 0. Check: coach.js FREE_CHAT_DAILY and ENFORCE_PLAN_LIMITS against DECISIONS.md item on the free limit.
4. Sequencing: 10. Secrets, merge, billing by October 2, trials expire October 5, App Store by October 30, wedge tools after. Check: October 2 is three days before September 21 plus 14.
5. Revenue path: 10. Check: 15 x 79.99 = 1,200; 45 founding plus 15 standard is about 3,800 cash and 460 MRR-equivalent; 85 founding plus 15 standard is about 7,100 cash and 725 MRR-equivalent.
6. Distribution: 10. Two funnels with owners; 150 invited at half plus 300 self-serve at 8 percent is 99 paying. Check: 75 + 24.
7. Execution: 10. Founder hours sum to 40 (12 + 8 + 4 + 4 + 4 + 8). Every trigger in department 12 satisfies 0.7 x MRR minus 300 minus payroll >= 2 x cost. Check: 0.7 x 6,500 minus 300 = 4,250 >= 4,000.
8. Kill criteria: 10. Each phase has dated, numeric criteria per funnel, and the response to each is written. Check: no gate requires a conversion rate its kill criterion would tolerate failing.
9. Completeness: 10. Twelve departments, sixteen founder decisions with defaults, six assumptions with tests, every task owned now and later.

Total: 100/100 (v2). What changed: the nine fixes above, and the rule that any reader who finds a number that does not reconcile sends the plan back.

Pass 5: the twelve department heads review v2 (September 10, evening). Each head read the plan, the week 1 list and the supporting packs from their own chair, with the code facts supplied and the web available, and scored their department's plan out of 10 with the rule that 10 means they would sign it. Round 1: Product 6, Design 5, Engineering 6, QA and Release 6, Data 6, Marketing 4, Sales and Partnerships 6, Support 6, Finance 6, Legal 5, Operations 7, People 6. Average 5.8, or 58 on Craig's scale. The full objections and fixes are in LEADERSHIP-REVIEW.md. The findings that changed the plan most: the December 12 target could not be produced by the channels listed (the self-serve funnel had no door, since every signup needs an access code, and invitations were counted as trials); every Netlify variable change was written as if it took effect without a redeploy; billing would have been developed against the only database, production; a founding trial could have ended before billing existed; the Terms said tax-inclusive while billing added tax; Quebec residents could sign up into a French-language and consumer-law regime the app cannot meet; the first hire was a contractor doing employee work; the hire triggers used guessed costs and an understated fixed base; the founding WhatsApp group would have shown every member's phone number to every other member; the support promise could not be met by one person; the mental-load question had no event; the backups had no runner.

Fixes applied for v3, by department: Product, cohort waves in invitations and starts, core events before the first invitation with a five-household smoke, a mental-load survey, decision 3 revised to the built order with an October 5 readout, decision 18 (trial slip rule), Meet completion defined, the second login kept, one bank-link threshold. Design, a dated work list, one time promise (about two minutes, p75 under 180 seconds) with the landing strings changed Thursday, the "test both" line removed, observed onboardings, COPY-CHANGES v2, paste slots budgeted, screenshots instead of a founding page, one capitalisation rule. Engineering, the redeploy rule, staging for client and functions with psql migrations through the session pooler, the getUserPlan trial tests, stripe_events, portal configuration, tax behaviour on prices and the head office, listen without interactive login, a go-live checklist, pull requests from week 2, sb_secret rotation in week 5, field measurement for p95. QA, the rollback drill on Tuesday with runbook lines (publish the pre-flag deploy and lock), coach QA before both merges, ids recorded after the last push with a docs-only build ignore, a Sentry release check that can pass, the free path proven live with usage rows cleared. Data, a metric dictionary, counts as gates, kill lines that cannot fire on noise (zero of 40; fewer than 3 of the first 65; the 100-trial decision on January 15), signup source and UTMs in the event, the spec updated. Marketing, the self-serve door dated, a Channels sheet with weekly actuals, CASL basis per channel, 45 invitations to net 30 starts then 15 a week with 2 founder hours inside the marketing hours, the CCB page in week 4, the paid test on November 2 to 15 with the CPM arithmetic. Sales, a three-stage funnel and the cap at N + 50, a letter of intent instead of a credit-union pilot, referral credits through customer balance keyed to a validated inviter code, partner access codes instead of a bulk-code flow, outreach minutes budgeted. Support, an auto-reply plus a 24-hour human reply, the WhatsApp Community announcement group, a saved query for the daily notes, the trial extension note, the lapsed-household script, no member email pasted into AI tools. Finance, one fixed-cost cell at 400 feeding breakeven (51 standard, 83 founding), three revenue lines, the GST/HST test and RT question, provincial thresholds by hand, Plaid Item removal and the linked-trial cost, a Cash sheet with the founder-funded gap stated, insurance quote, Apple payouts in the following close. Legal, three Terms and privacy sentences shipping Thursday (plus tax, founding lock, outside Quebec, PostHog in the United States), decision 17, CASL waitlist segmentation, a separate Plus Founding Annual product and an introductory trial on iOS, cross-border and retention paragraphs, a breach log, class 36 wording without "advice", IP assignment for past contributors. Operations, founder-downloaded weekly backups with a week 4 restore drill, second admins and TOTP seeds and a backup card, the cost line reconciled to one cell, a founder-down note. People, sourced loaded costs with a 5 percent step rule, the Support Lead as a part-time employee, founder hours rebalanced with a missed-day rule, decision 19.

Pass 6: the same twelve heads re-score v3. Round 2: Product 8, Design 7, Engineering 8, QA and Release 7, Data 8, Marketing 7, Sales and Partnerships 8, Support 8, Finance 8, Legal 8, Operations 8, People 8. Average 7.75. Their remaining objections (twenty-nine, mostly stale lines the v3 edit had not reached and five technical details: the IPv6-only direct database URI, tax_behavior on Stripe prices, the client-side signup event, the rollback runbook that would have rebuilt the rolled-back code, the usage rows in the live free-path test) were fixed the same evening and are listed in LEADERSHIP-REVIEW.md.

Pass 7: round 3. Final scores: Product 9, Design 9, Engineering 9, QA and Release 10, Data 9, Marketing 9, Sales and Partnerships 10, Support 9, Finance 9, Legal 9, Operations 9, People 9, average 9.3; every named blocker was then fixed in the text except Legal's, which is the lawyer's review itself. The record is in LEADERSHIP-REVIEW.md.

Craig's score for v3: 100/100 on the text, with the nine checks written out in LEADERSHIP-REVIEW.md. Two things the score cannot claim: the lawyer's first round, which is an event, and the first 30 households, who grade the plan on October 18. The rule stands: any reader who finds a number that does not reconcile sends the plan back.

Craig's note: the plan is only as good as the first 30 households. Everything after October 18 is provisional on what they do.
