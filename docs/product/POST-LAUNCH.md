# Post-launch queue

In order. Each item is decided and scoped, and waits for the first store release (iOS 1.0.0 (526897),
Android versionCode 8, both from main `a16062e`).

---

## 1. "This pays my ..." on the bill edit sheet, and a one-tap suggestion

**Decided** by Amanda on 2026-09-29: first post-launch item. Never link automatically.

**Why** The forecast and safe to spend both take each debt's minimum. When the same payment is also
kept as a bill, it is counted twice unless the bill is linked to the debt. Examples are a "Car
Payment" bill beside a Car Loan debt, or a loan payment detected from the bank beside a debt with a
minimum. The double count only understates safe to spend and never overstates it, which is why it
did not block the launch.

**Already in 526897** A manual link, by identity only (`bill.debtId` = `debtLinkKey(debt)`), with
nothing linked automatically:
- The bills sheet (`ManualBillForm` in `src/App.jsx`) asks "Which debt does this pay?" when a
  recurring bill is added or edited.
- Each bill detected from the bank has a "Pays a debt" choice.
- A linked bill replaces that debt's minimum in the forecast, in safe to spend's reservation, in
  Today's "Due soon" and in the daily-spend rule. All of them read `unbilledDebtMinimums`.

**To build**
- Word the choice on the bill edit sheet as "This pays my ..." (the debt's name).
- Suggest the link with one tap when a bill is a recognised card or loan payment close to a debt's
  minimum:
  - "Recognised" means `isCCPayment`, `isLoanPayment` or a card issuer's name.
  - "Close" means within $2 or 5%, the tolerance `paysADebtMinimum` uses.
- Suggest only. The household taps to accept, and a dismissal is remembered so the suggestion does
  not come back.
- Until it is linked, such a bill is still counted twice (see above).

**Where** `src/App.jsx` (`ManualBillForm`); `src/lib/financialCalculations.js` (`billPaysDebt`,
`debtLinkKey`, `unbilledDebtMinimums`, `paysADebtMinimum`).
