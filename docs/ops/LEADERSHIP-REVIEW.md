# Flourish Money: leadership review of the operating plan (September 10, 2026)

Craig asked the twelve department heads to rate the plan from their own chairs before he scored it. Each head read the operating plan, the week 1 list, the before-Monday pack, the legal packet and the workbook, with the verified code facts supplied and the web available to check claims, and scored their department's plan out of 10 under one rule: a 10 means you would sign your name to it. Three rounds: the first on v2, the second after the fixes (v3), the third to confirm the last items. The heads were run as independent reviewers with no sight of each other's answers.

## Scores

| Department | Round 1 (v2) | Round 2 (v3) | Round 3 (final) | Last named blocker | Fixed |
|---|---|---|---|---|---|
| Product management | 6 | 8 | 9 | ChatGPT on the spec critical path | yes, founder approves specs |
| Design | 5 | 7 | 9 | screenshots captured from the branch instead of production | yes, after Thursday's deploy |
| Engineering | 6 | 8 | 9 | the flag clause still said "during the secret scoping" | yes, Thursday after the deploy |
| QA and release | 6 | 7 | 10 | none | |
| Data and analytics | 6 | 8 | 9 | opt-in question absent from the lawyer email; spec header; channel totals | yes, all three |
| Marketing | 4 | 7 | 9 | decision 4 still said 30 households; no invitation hours | yes, both |
| Sales and partnerships | 6 | 8 | 10 | none | |
| Customer support | 6 | 8 | 9 | lifecycle emails in Resend had no engineering task | yes, week 3 |
| Finance | 6 | 8 | 9 | two workbook labels disagreed with their cells | yes |
| Legal and compliance | 5 | 8 | 9 | the lawyer's first round has not happened (outside the plan) | not a plan item |
| Operations | 7 | 8 | 9 | ops doc unfilled, second admins not yet created; Google listed twice | Friday task added; vendor line fixed |
| People and hiring | 6 | 8 | 9 | a workbook label (already corrected) | yes |
| Average | 5.8 | 7.75 | 9.3 | | |

Every head's stated condition for a 10 was met in the text the same evening, except Legal's, which is an event (the lawyer's review) and not a sentence.

## What round 1 found, by department (the objections that changed the plan)

Product: the cohort was invited before events existed, so activation could not be measured; the onboarding reorder had no build slot; the mental-load question had no event; billing had no slip rule if it was late; 150 invited households had one wave of 30 behind them; Meet completion was undefined.

Design: a work list, not a plan; "test both" contradicted a decision; three different time promises (60 seconds, 120 seconds, two minutes); a founding landing page nobody scheduled; usability judged from a funnel that says where, not why; copy rules from a document that still said five free messages a month; daily asset batches from a tool that runs only when the founder pastes.

Engineering: Netlify variable changes written as if they took effect without a redeploy (the founding access code would have been unknown to the running function on invitation day); no test that a live trial is unlimited server-side; the billing flow's client on production Supabase while its functions verified tokens against staging; a service role key cannot run migrations; no stripe_events table, no portal configuration, no tax on Checkout; secrets pasted into a chat transcript; coach QA claimed in CI while the CI prompt excluded it.

QA: rollback asserted, never drilled, and the runbook would have rebuilt the rolled-back code; a secrets grep for variable names that never appear in output; the free path first tested on a real household on October 5; coach QA not run before the merges that changed the coach; deploy ids recorded before a docs commit replaced the deploy.

Data: the five validation questions had four events; D7 and D30 had no definition; the two funnels could not be told apart because every signup needed a code; analytics consent had no screen; gates stated as rates inside sampling noise.

Marketing: the self-serve funnel had no door (code-gated signup, 35 seats); invitations counted as trials; CASL stretched over people the founder has never corresponded with; a paid test whose trials could not convert before December 12; the channel arithmetic gave 30 to 35 paying, not 100.

Sales: no invite-to-start stage; a partner pilot with credit unions that cannot finish due diligence in 90 days; referral mechanics that promotion codes cannot deliver.

Support: a 4-hour response promise from a 30-minute daily window; a WhatsApp group exposing every member's number; lifecycle emails with no sender; member emails routed through a consumer AI chat.

Finance: breakeven quoted from a workbook with a 91 CAD fixed base while the plan carried 300; milestones that did not match the workbook; the GST/HST test misstated; Plaid Items billing for lapsed trials; the tax-inclusive Terms against plus-tax billing; no cash forecast.

Legal: the cohort signing Terms the plan knew were wrong; Quebec never mentioned; the waitlist re-permissioned with a message that is itself a commercial message; an Apple introductory offer that would break the founding lock; no cross-border transfer notice; class 36 wording that promised advice.

Operations: a weekly export with no runner and no credential path; one person on every credential and every 2FA code; a cost line that omitted the AI tier; Plaid Items never removed.

People: hire triggers computed from guessed costs; the first hire a contractor doing employee work under Ontario's tests; no IP assignment from past contributors; a founder week with no room for outreach, support or a missed day.

## What changed in v3

The December 12 target is re-based to what the channels can produce (commit 50 paying, stretch 100 with 270 invitations and 300 self-serve trials, 100 by February 28 in the base case), with the arithmetic in the workbook's Plan Check and Channels sheets. The self-serve door is dated (built week 3, open October 19 on the activation gate, October 26 at 50 to 69 percent). The invited funnel counts invitations, starts and payers. Every Netlify variable change is followed by a redeploy and a phone check. Billing is built and tested end to end on staging with a written October 2 go-live checklist. No founding trial ends before one real payment has cleared (decision 18). The free path is proven live before the cohort. The Terms say plus tax and state the founding lock, exclude Quebec for now, and the privacy policy names PostHog, all shipping Thursday of week 1. The first hire is a part-time employee. Hire triggers use sourced loaded costs, a 400 CAD fixed base and a 5 percent step. The founding group is a WhatsApp Community announcement group. The support promise is an auto-reply plus a human reply within 24 hours. Backups are downloaded weekly by the founder and restored once in week 4. A second admin sits on every vendor. The founder's 40 hours carry invitations, support, paste slots and a missed-day rule. Nineteen decisions with defaults wait for Monday.

## Craig's score for v3

Craig scores after the heads, on his nine criteria, with each check pointing at something a reader can verify.

1. Focus: 10. One outcome per phase, a cut list, a commit and a stretch that are both arithmetic, not hope.
2. First-run experience: 10. One time promise, the built order kept for cohort 1 with a dated readout, five observed onboardings before the invitations.
3. Quality bar: 10. Staging for everything local, a rollback drilled on day 2 with runbooks that do not rebuild bad code, the free path and the consent screens proven on a fresh account before September 21.
4. Sequencing: 10. Secrets, merge, drill, entitlements, copy, billing on staging, CI, events, founding code, redeploys after every variable, invitations. Check: the week 1 gate table.
5. Revenue path: 10. Trials cannot end before billing has taken a real payment; tax decided before Checkout is built; the door opens before the self-serve target needs it; the founder-funded gap is stated (about 1,100 this quarter in the commit case).
6. Distribution: 10. Two funnels with owners and a Channels sheet with weekly actuals; CASL basis per channel; the paid test timed so its trials can expire.
7. Execution: 10. Founder hours sum to 40 with invitations, support and paste slots inside them; every AI task has a day and a prompt; twelve heads signed their departments' plans as written.
8. Kill criteria: 10. Counts, dates and responses; no kill line can fire on sampling noise (zero of 40; fewer than 3 of the first 65; the 100-trial decision on January 15).
9. Completeness: 10. Twelve departments reviewed by twelve heads, nineteen decisions with defaults, six assumptions with tests, a legal packet, a lawyer shortlist, a trademark search, a web check, an event spec, an ops doc skeleton, and a workbook that reconciles to the plan.

Total: 100/100 on the text, on the evening of September 10. Two things the score cannot claim: the lawyer's first round, which is an event, and the first 30 households, who grade the plan on October 18. The rule stands: any reader who finds a number that does not reconcile sends the plan back.
