# Creator Program: spec and plan (2026-11-02)

Approved terms: `~/Documents/Flourish/01 Marketing/Creator Program/CREATOR-PROGRAM-APPROVED-2026-11-02.md` (ChatGPT and Grok agreed).
Behind `CREATORS_ENABLED` (off). The migration is written, not run.

Decisions (Amanda, 2026-11-02):
- Key on `user_id`, with a nullable `household_id`: a `households` row exists only after an owner's first invite.
- The household's code is its owner's; someone on their own uses their own. A partner joining never changes it, and a partner cannot add one.
- Stripe renewals come from `invoice.paid`, using `total_excluding_tax`. Amanda adds that event to the endpoint at go-live.
- RevenueCat amounts come from the authenticated event. Null percentages mean no commission and a support note. Never sandbox or Family Sharing.
- Placeholders: a narrow exception to the "none anywhere" checks, for the listed creator word ids only.
