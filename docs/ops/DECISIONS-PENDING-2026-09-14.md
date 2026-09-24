# Flourish: decisions (settled 2026-09-03)

1. Launch price: $11.99/month or $99.99/year CAD. Founding members (beta cohort and first 50 paying) $79.99/year, locked while continuously subscribed. The founding entitlement (first-50 cohort, lock while subscribed) is implemented with billing when Stripe is built; for now only the price constant exists and the existing beta_founder tier is preserved. US values stay behind the country flag ($7.99/$59.99 USD until reviewed).
2. Free coaching after the 14-day trial: 2 messages per week, resetting weekly. Trial is unlimited. Plus is unlimited coaching, linked accounts, and the Meet facilitator. Free Meet shows the deterministic agenda without the facilitator.
3. Prompt caching ships with the coach work regardless of usage limits, using the cache-control structure the current API version supports; only stable prompt content is cached, user financial context is not.
4. Statement import: the model transcribes only. JS validates every row (verbatim amount, real date, inside statement period, totals reconciliation where anchors exist). The whole proposed import is shown. Questionable-but-valid rows are flagged and selectable; rows that fail validation are shown but cannot be selected until the user edits them into a valid row. The user approves exactly which rows enter the data. No partial auto-import. Non-numeric amounts are rejected, never coerced to 0.
5. What-If: leave the deterministic flow intact.
6. Dead coach types plan, insights, buckets, tax: remove.
7. Landing: waitlist stays on the web until billing exists; apply the approved marketing copy to the sections that render below it.
8. Claims: do not ship "PIPEDA compliant", "regulated data provider", or any statement about privacy-law compliance until privacy practices have been reviewed. Factual wording only: "Built in Ontario." / "Read-only bank connections through Plaid. Flourish cannot move your money." / "Your bank login is never stored by Flourish." CC verifies the last sentence against the actual Plaid implementation before it ships.
9. Plaid gating: unchanged for now.
10. Kids: remove primary entry points only; keep route and code.

# Operating plan decisions, pending the founder's answer by Monday, September 14, 2026 (defaults apply if silent; full text in OPERATING-PLAN.md Part 2b)

P1. Merge and deploy strategy-implementation on September 15 after the pre-merge checklist and the Netlify secret scoping are green. Default: yes.
P2. Trial structure: keep the 14-day no-card trial as built; card asked for at conversion. Default: keep.
P3. Onboarding order: cohort 1 keeps the built order (bank link offered first, manual available); manual-first is decided October 5 from the link rate and built in the week 5 slot only if under half link. Default: as built.
P4. Founding cohort: 45 personal invitations September 21 to 25 (five on the 21st as a smoke) to net about 30 started trials; 79.99 a year plus tax; founding capped at 50 (founding cohort changed from 100 to 50 on 2026-09-23 — see docs/product/DECISIONS.md). Default: yes.
P5. On camera: one or two short videos a week. Default: yes (faceless variant exists).
P6. Founding-member group: WhatsApp Community announcement group (members' numbers hidden), bugs through the in-app form. Default: yes.
P7. Books: QuickBooks Online Simple Start. Default: yes.
P8. GST/HST: confirm Monday whether GrowSmart Inc. holds an RT account; if so HST is charged from the first sale; if not, register before October 2. Provincial PST, RST, QST thresholds tracked by hand. Default: yes.
P9. Apple Small Business Program: enrol before September 30. Default: yes.
P10. Trademark: file the Canadian FLOURISH MONEY word mark in classes 9, 36, 42 in week 2 (789.14 CAD CIPO fees); class 36 worded without "advice"; no US launch under the name without a clearance opinion. Default: file in week 2.
P11. Lawyer: CL's shortlist (Onley Law first); founder picks by September 25. Default: the first on the shortlist.
P12. Support routing: hello@ and privacy@flourishmoney.app verified on day 1. Default: verify.
P13. New accounts from September 16 get the 14-day trial only; the permanent founder grant stops for new signups; server profile is the authority on plan; beta cap N + 50; a founding access code in BETA_CODES. Default: yes.
P14. A free staging Supabase project (flourish-staging) for local function runs and migration testing; its keys, never production's, live on the Mac. Default: yes.
P15. The October App Store build uses Xcode 26; the Capacitor 8.5 migration moves to January. Default: yes.
P16. Tax on the price: plus applicable taxes (79.99 plus tax, about 90.39 in Ontario); the Terms sentence changes Thursday September 17 and every invitation says plus tax. Answered explicitly Monday, not by default. Default if silent: plus tax.
P17. Quebec: exclude Quebec residents at signup until French-language copy and Law 25 basics exist; revisit at 100 paying. Default: exclude.
P18. Trial slip rule: no founding trial ends before billing has taken one real payment plus 48 hours; trial_ends_at set at signup and extended by one tested SQL statement. Default: yes.
P19. Interim support help before any hire trigger: none until the cohort shows the load; revisit October 18. Default: none.

Answers are recorded here and in docs/ops/DECISIONS-2026-09-14.md in the repo on Monday, September 14.
