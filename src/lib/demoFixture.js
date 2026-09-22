// src/lib/demoFixture.js
// -----------------------------------------------------------------------------
// The demo's synthetic household(s) in ONE pure, testable place — now keyed by country.
//
// Truth-fix item 8: the fixture is internally consistent. The Payroll Deposit transactions pay
// exactly the primary income's amount, so findAnchor MATCHES them and the demo exercises the real
// ANCHOR path — the same path every real user takes — instead of forecastEngine's "count forward
// from today" FALLBACK. Before this, the CA payroll deposits were $1,847.50 against a $2,840
// declared income (35% off), so the anchor never matched and the correct-looking next-payday date
// was a coincidence.
//
// SYNTHETIC DATA ONLY. No real account, person or balance appears here.
//
// PURE data + pure builders (every date computed from an injected `now`).
// -----------------------------------------------------------------------------

// ── Phase anchoring (demo fixtures ONLY — never a real user's data) ──────────────────────────────
// The transactions are dated relative to "now", but the bills and the monthly secondary income used
// to sit on fixed days of the month. That mix made the demo land on a different point in the pay
// cycle every day: safe-to-spend swung between $2,009 and $359 as rent drifted in and out of the
// reservation window, and the "next deposit" flipped between the paycheque and the benefit as the
// benefit overtook it (collapsing the horizon from 13 days to 2, which dragged the buffer and
// savings allocation with it). A visitor — and a screenshot — got a different app depending on the
// date.
//
// So the PHASE is anchored, not the outputs. Every figure is still computed by the engines exactly
// as it is for a real user; we only fix where in the cycle the sample data sits: the pay deposit 13
// days out, the secondary income behind it, rent already paid for the period — and ONE bill
// deliberately inside the reservation window.
//
// That last part is the demonstration, not an accident. The product's claim is that a balance is not
// spendable because money is already committed; a breakdown with no "Upcoming bills" row demonstrates
// nothing. One bill sits inside the window so the visitor sees a five-row breakdown and a populated
// "one thing to know" line, at the cost of a lower headline — the better trade.
//
// The "beyond the horizon" offsets stay in 14..27 days: below 14 they would fall inside the window,
// and at 28..31 a bill's day-of-month could collide with today's in a short month and land on day 0.

const _addDays = (now, n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
const _iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CANADA — Alex & Jordan, Ontario. Two incomes (biweekly T4 pay + the monthly Canada Child Benefit),
// a Visa and a car loan.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const CA_FIXTURE = {
  country: "CA",
  cashBalance: 1_243.88,      // chequing; savings is a separate account below
  income: 2_840,              // Full-time Job, biweekly — MUST equal incomes[0].amount (item 8)
  netWorthAdd: 1_840,
  // ccb 20 keeps the benefit BEHIND the 13-day paycheque; phone 6 is the bill inside the window.
  phase: { second: 20, phone: 6, netflix: 16, hydro: 22, rent: 26 },
  secondIncomeKey: "second",
  incomes: [
    { id: 1, label: "Full-time Job", amount: "2840", freq: "biweekly", type: "employment" },
    { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb" },
  ],
  // [name, amount, phase key]
  bills: [
    ["Rent", "1650", "rent"],
    ["Hydro", "95", "hydro"],
    ["Phone", "65", "phone"],
    ["Netflix", "18.99", "netflix"],
  ],
  accounts: [
    { id: "a1", name: "TD Chequing ••4521", type: "checking",   balance: 1_243.88, institution: "TD Bank", currency: "CAD" },
    { id: "a2", name: "TD Savings ••8803",  type: "savings",    balance: 1_840.00, institution: "TD Bank", currency: "CAD" },
    { id: "a3", name: "Visa card ••2291",     type: "credit",     balance: -3_420.00, institution: "TD Bank", currency: "CAD" },
    { id: "a4", name: "Questrade TFSA ••7723",   type: "investment", balance: 12_480.00, institution: "Questrade", currency: "CAD", ticker: "XEQT",   gain: 2_140, gainPct: 20.7 },
    { id: "a5", name: "TD e-Series RRSP ••9910", type: "investment", balance: 8_650.00,  institution: "TD Bank",   currency: "CAD", ticker: "TDB902", gain: 890,   gainPct: 11.4 },
  ],
  debts: [
    { name: "Visa card", balance: "3420", rate: "19.99", min: "68" },
    { name: "Car Loan", balance: "8200", rate: "6.99", min: "280" },
  ],
  profile: {
    name: "Alex", country: "CA", province: "ON", status: "couple", hasKids: true, partnerName: "Jordan",
    creditScore: 718, creditKnown: true, lifeStages: ["t4"], partnerLifeStages: ["t4"],
  },
  // [id, daysAgo, name, amount, category, icon, color]. Payrolls sit ~bi-weekly (1/12/26 days ago)
  // and pay the primary income, so the most recent one anchors the cadence off real history.
  txns: [
    ["t1",  0,  "Loblaws",         67.43,  "Groceries",       "🛒", "#2E8B2E"],
    ["t2",  0,  "Tim Hortons",     4.85,   "Coffee & Dining", "☕", "#D97A3A"],
    ["t3",  0,  "Tim Hortons",     5.10,   "Coffee & Dining", "☕", "#D97A3A"],
    ["t4",  1,  "Payroll Deposit", "PAY",  "Income",          "💰", "#6FE494"],
    ["t5",  1,  "Shell Gas",       62.10,  "Gas & Transport", "⛽", "#CFA03E"],
    ["t6",  2,  "Starbucks",       6.75,   "Coffee & Dining", "☕", "#D97A3A"],
    ["t7",  3,  "Netflix",         18.99,  "Subscriptions",   "🎬", "#8A5FC8"],
    ["t8",  3,  "Amazon.ca",       34.99,  "Shopping",        "📦", "#C45898"],
    ["t9",  4,  "Uber Eats",       28.40,  "Coffee & Dining", "🍕", "#D97A3A"],
    ["t10", 5,  "LCBO",            24.15,  "Shopping",        "🛍️", "#C45898"],
    ["t11", 6,  "Walmart",         89.22,  "Groceries",       "🛒", "#2E8B2E"],
    ["t12", 7,  "Hydro One",       124.00, "Utilities",       "⚡", "#CFA03E"],
    ["t13", 6,  "Starbucks",       6.50,   "Coffee & Dining", "☕", "#D97A3A"],
    ["t14", 7,  "Spotify",         11.99,  "Subscriptions",   "🎵", "#8A5FC8"],
    ["t15", 7,  "Rexall Pharmacy", 18.40,  "Health",          "💊", "#4A8FCC"],
    ["t16", 8,  "H&M",             67.00,  "Shopping",        "👕", "#C45898"],
    ["t17", 9,  "Harvey's",        14.50,  "Coffee & Dining", "🍔", "#D97A3A"],
    ["t18", 9,  "Tim Hortons",     4.25,   "Coffee & Dining", "☕", "#D97A3A"],
    ["t19", 10, "Amazon.ca",       29.99,  "Shopping",        "📦", "#C45898"],
    ["t20", 12, "Payroll Deposit", "PAY",  "Income",          "💰", "#6FE494"],
    ["t21", 13, "Loblaws",         73.18,  "Groceries",       "🛒", "#2E8B2E"],
    ["t22", 13, "Uber Eats",       31.20,  "Coffee & Dining", "🍕", "#D97A3A"],
    ["t23", 15, "Winners",         45.00,  "Shopping",        "🛍️", "#C45898"],
    ["t24", 16, "Apple.com/bill",  3.99,   "Subscriptions",   "☁️", "#8A5FC8"],
    ["t25", 17, "Starbucks",       7.10,   "Coffee & Dining", "☕", "#D97A3A"],
    ["t26", 19, "Bell Canada",     65.00,  "Utilities",       "📱", "#CFA03E"],
    ["t27", 20, "Kelsey's",        54.20,  "Coffee & Dining", "🍷", "#D97A3A"],
    ["t28", 22, "Shopify/Etsy",    38.00,  "Shopping",        "🎁", "#C45898"],
    ["t29", 24, "Costco Gas",      55.80,  "Gas & Transport", "⛽", "#CFA03E"],
    ["t30", 26, "Payroll Deposit", "PAY",  "Income",          "💰", "#6FE494"],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// UNITED STATES — Alex & Jordan, Ohio. NOT the Canadian household with the words swapped: it is a
// different household that happens to share the product's demo persona.
//
// What genuinely differs, and why:
//   • THE SECOND INCOME IS NOT A CHILD BENEFIT. The US has no monthly federal child benefit — the
//     Child Tax Credit arrives annually at filing. Giving this family a "US CCB" would be inventing a
//     benefit, which is exactly what we will not do. They have gig income instead, which is both
//     extremely common and one of the income types the product already offers a US user
//     (CC.US.incomeTypes includes ["gig","🚗 Gig / Freelance"]).
//   • THE DEBT SHAPE IS AMERICAN. A federal student loan instead of a car loan, and a credit card at
//     a US-typical APR (24.99%) rather than a Canadian one (19.99%). "Student Loan (Federal)" is in
//     CC.US.debtTypes; a student loan is the most characteristically US household debt there is.
//   • THE ACCOUNTS ARE AMERICAN. Checking (not chequing), a Roth IRA and a 401(k) rather than a TFSA
//     and an RRSP, at institutions drawn from the product's own CC.US.banks list.
//   • lifeStages IS ["w2"], NOT ["t4"]. That code is read by getPersonalizedTaxCredits and by the
//     coach prompt ("W-2 Employee" vs "T4 Employee"); a US household on a T4 would be nonsense.
//   • THE MONEY IS AMERICAN, not the CAD figures at par. Higher rent and electricity, lower phone,
//     lower take-home per cheque, a different cash balance — plausible for a mid-cost US metro.
//
// Phase-anchored to the SAME rules as the CA fixture: biweekly pay 13 days out, the secondary income
// behind it at +19, one bill (Electric, +8) deliberately inside the reservation window, everything
// else beyond it in the 14..27 band. The offsets deliberately differ from Canada's so the two demos
// are not the same screenshot twice.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const US_FIXTURE = {
  country: "US",
  cashBalance: 1_412.55,
  income: 2_465,              // Full-time Job, biweekly — MUST equal incomes[0].amount
  netWorthAdd: 2_260,
  phase: { second: 19, electric: 8, streaming: 15, phone: 21, rent: 25 },
  secondIncomeKey: "second",
  incomes: [
    { id: 1, label: "Full-time Job", amount: "2465", freq: "biweekly", type: "employment" },
    { id: 2, label: "Rideshare & Delivery", amount: "420", freq: "monthly", type: "gig" },
  ],
  bills: [
    ["Rent", "1825", "rent"],
    ["Electric", "142", "electric"],
    ["Phone", "85", "phone"],
    ["Hulu", "18.99", "streaming"],
  ],
  accounts: [
    { id: "u1", name: "Chase Checking ••2891", type: "checking",   balance: 1_412.55, institution: "Chase", currency: "USD" },
    { id: "u2", name: "Chase Savings ••5504",  type: "savings",    balance: 2_260.00, institution: "Chase", currency: "USD" },
    { id: "u3", name: "Chase Sapphire ••4471", type: "credit",     balance: -4_180.00, institution: "Chase", currency: "USD" },
    { id: "u4", name: "Fidelity Roth IRA ••0033", type: "investment", balance: 14_200.00, institution: "Fidelity", currency: "USD", ticker: "FXAIX",       gain: 2_980, gainPct: 26.5 },
    { id: "u5", name: "Fidelity 401(k) ••8812",   type: "investment", balance: 23_400.00, institution: "Fidelity", currency: "USD", ticker: "Target 2055", gain: 3_890, gainPct: 19.9 },
  ],
  debts: [
    { name: "Chase Sapphire", balance: "4180", rate: "24.99", min: "105" },
    { name: "Federal Student Loan", balance: "18400", rate: "5.50", min: "195" },
  ],
  profile: {
    name: "Alex", country: "US", province: "OH", status: "couple", hasKids: true, partnerName: "Jordan",
    creditScore: 718, creditKnown: true, lifeStages: ["w2"], partnerLifeStages: ["w2"],
  },
  txns: [
    ["s1",  0,  "Kroger",           118.40,  "Groceries",       "🛒", "#2E8B2E"],
    ["s2",  0,  "Starbucks",        5.45,   "Coffee & Dining", "☕", "#D97A3A"],
    ["s3",  0,  "Dunkin'",          4.20,   "Coffee & Dining", "☕", "#D97A3A"],
    ["s4",  1,  "Payroll Deposit",  "PAY",  "Income",          "💰", "#6FE494"],
    ["s5",  1,  "Chevron",          71.40,  "Gas & Transport", "⛽", "#CFA03E"],
    ["s6",  2,  "Chipotle",         14.85,  "Coffee & Dining", "🌯", "#D97A3A"],
    ["s7",  3,  "Hulu",             18.99,  "Subscriptions",   "🎬", "#8A5FC8"],
    ["s8",  3,  "Amazon.com",       63.90,  "Shopping",        "📦", "#C45898"],
    ["s9",  4,  "DoorDash",         44.20,  "Coffee & Dining", "🍕", "#D97A3A"],
    ["s10", 5,  "Total Wine",       27.40,  "Shopping",        "🛍️", "#C45898"],
    ["s11", 6,  "Target",           142.30,  "Groceries",       "🛒", "#2E8B2E"],
    ["s12", 7,  "Duke Energy",      142.00, "Utilities",       "⚡", "#CFA03E"],
    ["s13", 6,  "Starbucks",        6.15,   "Coffee & Dining", "☕", "#D97A3A"],
    ["s14", 7,  "Spotify",          11.99,  "Subscriptions",   "🎵", "#8A5FC8"],
    ["s15", 7,  "Walgreens",        38.60,  "Health",          "💊", "#4A8FCC"],
    ["s16", 8,  "Old Navy",         74.25,  "Shopping",        "👕", "#C45898"],
    ["s17", 9,  "Wendy's",          12.95,  "Coffee & Dining", "🍔", "#D97A3A"],
    ["s18", 9,  "Dunkin'",          4.75,   "Coffee & Dining", "☕", "#D97A3A"],
    ["s19", 10, "Amazon.com",       26.49,  "Shopping",        "📦", "#C45898"],
    ["s20", 12, "Payroll Deposit",  "PAY",  "Income",          "💰", "#6FE494"],
    ["s21", 13, "Trader Joe's",     96.75,  "Groceries",       "🛒", "#2E8B2E"],
    ["s22", 13, "DoorDash",         29.15,  "Coffee & Dining", "🍕", "#D97A3A"],
    ["s23", 15, "Marshalls",        68.30,  "Shopping",        "🛍️", "#C45898"],
    ["s24", 16, "Apple.com/bill",   2.99,   "Subscriptions",   "☁️", "#8A5FC8"],
    ["s25", 17, "Starbucks",        7.65,   "Coffee & Dining", "☕", "#D97A3A"],
    ["s26", 19, "Verizon",          85.00,  "Utilities",       "📱", "#CFA03E"],
    ["s27", 20, "Panera Bread",     52.15,  "Coffee & Dining", "🥖", "#D97A3A"],
    ["s28", 22, "Etsy",             34.50,  "Shopping",        "🎁", "#C45898"],
    ["s29", 24, "Costco Gas",       64.85,  "Gas & Transport", "⛽", "#CFA03E"],
    ["s30", 26, "Payroll Deposit",  "PAY",  "Income",          "💰", "#6FE494"],
  ],
};

const FIXTURES = { CA: CA_FIXTURE, US: US_FIXTURE };

/** The whole fixture table entry for a country. Unknown / missing country falls back to CA, which is
 *  the app's own default profile country — never to the US, so a bad value cannot silently move a
 *  visitor to a household with different tax rules. */
export function demoFixtureFor(country) {
  const key = String(country || "").trim().toUpperCase();
  return FIXTURES[key] || FIXTURES.CA;
}

export const DEMO_COUNTRIES = Object.keys(FIXTURES);

// ── Back-compatible CA exports (one copy of the data, read from the table above) ─────────────────
export const DEMO = {
  balance: CA_FIXTURE.cashBalance,
  income: CA_FIXTURE.income,
  netWorthAdd: CA_FIXTURE.netWorthAdd,
};
export const DEMO_INCOMES = CA_FIXTURE.incomes;
export const DEMO_PHASE = { ccb: CA_FIXTURE.phase.second, ...CA_FIXTURE.phase };

export const DEMO_US = {
  balance: US_FIXTURE.cashBalance,
  income: US_FIXTURE.income,
  netWorthAdd: US_FIXTURE.netWorthAdd,
};
export const DEMO_PHASE_US = US_FIXTURE.phase;

// ── Builders ─────────────────────────────────────────────────────────────────────────────────────

// Incomes with the SECONDARY income phase-anchored behind the pay deposit, so the next deposit is
// always the paycheque rather than sometimes the smaller monthly one.
export function buildDemoIncomes(now = new Date(), country = "CA") {
  const f = demoFixtureFor(country);
  const secondDay = _addDays(now, f.phase[f.secondIncomeKey]).getDate();
  return f.incomes.map((i, idx) => (idx === 1 ? { ...i, anchorDay: secondDay } : { ...i }));
}

// Bills phase-anchored past the reservation horizon (rent already paid for this period), except the
// one deliberately inside it. `date` keeps the day-of-month the UI displays; `nextDueDate` is the
// anchor the bill engine actually schedules from.
export function buildDemoBills(now = new Date(), country = "CA") {
  const f = demoFixtureFor(country);
  return f.bills.map(([name, amount, key]) => {
    const due = _addDays(now, f.phase[key]);
    return { name, amount, date: String(due.getDate()), nextDueDate: _iso(due), freq: "monthly" };
  });
}

// "PAY" in the amount column means "this row pays the primary income", so a fixture can never drift
// out of sync with its own declared income the way the CA one silently did (item 8).
export function buildDemoTxns(now = new Date(), country = "CA") {
  const f = demoFixtureFor(country);
  const at = (daysAgo) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); return { date: d.toISOString().slice(0, 10), dow: d.getDay() }; };
  return f.txns.map(([id, daysAgo, name, amount, cat, icon, color]) => ({
    id, name, amount: amount === "PAY" ? -f.income : amount, cat, icon, color, ...at(daysAgo),
  }));
}

export function demoAccountsFor(country = "CA") { return demoFixtureFor(country).accounts.map(a => ({ ...a })); }
export function demoDebtsFor(country = "CA")    { return demoFixtureFor(country).debts.map(d => ({ ...d })); }
export function demoProfileFor(country = "CA")  { return { ...demoFixtureFor(country).profile }; }
