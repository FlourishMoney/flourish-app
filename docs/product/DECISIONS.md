# Flourish: decisions (settled 2026-09-03)

1. Launch price: $11.99/month or $99.99/year CAD. Founding members (beta cohort and first 100 paying) $79.99/year, locked while continuously subscribed. The founding entitlement (first-100 cohort, lock while subscribed) is implemented with billing when Stripe is built; for now only the price constant exists and the existing beta_founder tier is preserved. US values stay behind the country flag ($7.99/$59.99 USD until reviewed).
2. Free coaching after the 14-day trial: 2 messages per week, resetting weekly. Trial is unlimited. Plus is unlimited coaching, linked accounts, and the Meet facilitator. Free Meet shows the deterministic agenda without the facilitator.
3. Prompt caching ships with the coach work regardless of usage limits, using the cache-control structure the current API version supports; only stable prompt content is cached, user financial context is not.
4. Statement import: the model transcribes only. JS validates every row (verbatim amount, real date, inside statement period, totals reconciliation where anchors exist). The whole proposed import is shown. Questionable-but-valid rows are flagged and selectable; rows that fail validation are shown but cannot be selected until the user edits them into a valid row. The user approves exactly which rows enter the data. No partial auto-import. Non-numeric amounts are rejected, never coerced to 0.
5. What-If: leave the deterministic flow intact.
6. Dead coach types plan, insights, buckets, tax: remove.
7. Landing: waitlist stays on the web until billing exists; apply the approved marketing copy to the sections that render below it.
8. Claims: do not ship "PIPEDA compliant", "regulated data provider", or any statement about privacy-law compliance until privacy practices have been reviewed. Factual wording only: "Built in Ontario." / "Read-only bank connections through Plaid. Flourish cannot move your money." / "Your bank login is never stored by Flourish." CC verifies the last sentence against the actual Plaid implementation before it ships.
9. Plaid gating: unchanged for now.
10. Kids: remove primary entry points only; keep route and code.
