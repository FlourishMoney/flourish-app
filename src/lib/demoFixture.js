// src/lib/demoFixture.js
// -----------------------------------------------------------------------------
// Truth-fix item 8: the demo's income + transactions in ONE pure, testable place.
//
// The fixture is now internally consistent: the Payroll Deposit transactions pay
// DEMO.income (= $2,840, the Full-time Job's biweekly amount), so findAnchor MATCHES
// them and the demo exercises the real ANCHOR path — the same path every real user
// takes — instead of forecastEngine's "count forward from today" FALLBACK. Before this,
// the payroll deposits were $1,847.50 against a $2,840 declared income (35% off), so the
// anchor never matched and the correct-looking next-payday date was a coincidence.
//
// PURE data + a pure transaction builder (dates computed from an injected `now`).
// -----------------------------------------------------------------------------

export const DEMO = {
  balance: 1_243.88,
  income: 2_840,      // Full-time Job, biweekly — MUST equal the incomes[0] amount below (item 8)
  netWorthAdd: 1_840, // mock savings/TFSA for net worth calc
};

export const DEMO_INCOMES = [
  { id: 1, label: "Full-time Job", amount: "2840", freq: "biweekly", type: "employment" },
  { id: 2, label: "Canada Child Benefit", amount: "560", freq: "monthly", type: "ccb" },
];

// ── Phase anchoring (demo fixture ONLY — never a real user's data) ───────────────────────────────
// The transactions are dated relative to "now", but the bills and the monthly benefit used to sit on
// fixed days of the month. That mix made the demo land on a different point in the pay cycle every
// day: safe-to-spend swung between $2,009 and $359 as rent drifted in and out of the reservation
// window, and the "next deposit" flipped between the $2,840 paycheque and the $560 benefit as the
// benefit overtook it (collapsing the horizon from 13 days to 2, which dragged the buffer and savings
// allocation with it). A visitor — and a screenshot — got a different app depending on the date.
//
// So the PHASE is anchored, not the outputs. Every figure is still computed by the engines exactly as
// it is for a real user; we only fix where in the cycle the sample data sits: the paycheque 13 days
// out, the benefit behind it, rent already paid for the period — and ONE bill deliberately inside the
// reservation window.
//
// That last part is the demonstration, not an accident. The product's claim is that a balance is not
// spendable because money is already committed; a breakdown with no "Upcoming bills" row demonstrates
// nothing. Phone sits at +6 days so the visitor sees a five-row breakdown and a populated "one thing
// to know" line, at the cost of a lower headline ($1,944 rather than $2,009) — the better trade.
//
// The "beyond the horizon" offsets stay in 14..27 days: below 14 they would fall inside the window,
// and at 28..31 a bill's day-of-month could collide with today's in a short month and land on day 0.
export const DEMO_PHASE = { ccb: 20, phone: 6, netflix: 16, hydro: 22, rent: 26 };

const _addDays = (now, n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
const _iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Incomes with the benefit phase-anchored behind the paycheque, so the next deposit is always the
// $2,840 paycheque 13 days out rather than sometimes the $560 benefit.
export function buildDemoIncomes(now = new Date()) {
  const ccbDay = _addDays(now, DEMO_PHASE.ccb).getDate();
  return DEMO_INCOMES.map(i => (i.type === "ccb" ? { ...i, anchorDay: ccbDay } : { ...i }));
}

// Bills phase-anchored past the reservation horizon (rent already paid for this period). `date` keeps
// the day-of-month the UI displays; `nextDueDate` is the anchor the bill engine actually schedules from.
export function buildDemoBills(now = new Date()) {
  const bill = (name, amount, offset) => {
    const due = _addDays(now, offset);
    return { name, amount, date: String(due.getDate()), nextDueDate: _iso(due), freq: "monthly" };
  };
  return [
    bill("Rent", "1650", DEMO_PHASE.rent),
    bill("Hydro", "95", DEMO_PHASE.hydro),
    bill("Phone", "65", DEMO_PHASE.phone),
    bill("Netflix", "18.99", DEMO_PHASE.netflix),
  ];
}

// Each row: [id, daysAgo, name, amount, category, icon, color]. Payrolls sit ~bi-weekly (1/12/26 days
// ago) and pay DEMO.income, so the most recent one anchors the biweekly cadence off real history.
export function buildDemoTxns(now = new Date()) {
  const at = (daysAgo) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); return { date: d.toISOString().slice(0, 10), dow: d.getDay() }; };
  const rows = [
    ["t1",  0,  "Loblaws",         67.43,        "Groceries",       "🛒", "#2E8B2E"],
    ["t2",  0,  "Tim Hortons",     4.85,         "Coffee & Dining", "☕", "#D97A3A"],
    ["t3",  0,  "Tim Hortons",     5.10,         "Coffee & Dining", "☕", "#D97A3A"],
    ["t4",  1,  "Payroll Deposit", -DEMO.income, "Income",          "💰", "#6FE494"],
    ["t5",  1,  "Shell Gas",       62.10,        "Gas & Transport", "⛽", "#CFA03E"],
    ["t6",  2,  "Starbucks",       6.75,         "Coffee & Dining", "☕", "#D97A3A"],
    ["t7",  3,  "Netflix",         18.99,        "Subscriptions",   "🎬", "#8A5FC8"],
    ["t8",  3,  "Amazon.ca",       34.99,        "Shopping",        "📦", "#C45898"],
    ["t9",  4,  "Uber Eats",       28.40,        "Coffee & Dining", "🍕", "#D97A3A"],
    ["t10", 5,  "LCBO",            24.15,        "Shopping",        "🛍️", "#C45898"],
    ["t11", 6,  "Walmart",         89.22,        "Groceries",       "🛒", "#2E8B2E"],
    ["t12", 7,  "Hydro One",       124.00,       "Utilities",       "⚡", "#CFA03E"],
    ["t13", 6,  "Starbucks",       6.50,         "Coffee & Dining", "☕", "#D97A3A"],
    ["t14", 7,  "Spotify",         11.99,        "Subscriptions",   "🎵", "#8A5FC8"],
    ["t15", 7,  "Rexall Pharmacy", 18.40,        "Health",          "💊", "#4A8FCC"],
    ["t16", 8,  "H&M",             67.00,        "Shopping",        "👕", "#C45898"],
    ["t17", 9,  "Harvey's",        14.50,        "Coffee & Dining", "🍔", "#D97A3A"],
    ["t18", 9,  "Tim Hortons",     4.25,         "Coffee & Dining", "☕", "#D97A3A"],
    ["t19", 10, "Amazon.ca",       29.99,        "Shopping",        "📦", "#C45898"],
    ["t20", 12, "Payroll Deposit", -DEMO.income, "Income",          "💰", "#6FE494"],
    ["t21", 13, "Loblaws",         73.18,        "Groceries",       "🛒", "#2E8B2E"],
    ["t22", 13, "Uber Eats",       31.20,        "Coffee & Dining", "🍕", "#D97A3A"],
    ["t23", 15, "Winners",         45.00,        "Shopping",        "🛍️", "#C45898"],
    ["t24", 16, "Apple.com/bill",  3.99,         "Subscriptions",   "☁️", "#8A5FC8"],
    ["t25", 17, "Starbucks",       7.10,         "Coffee & Dining", "☕", "#D97A3A"],
    ["t26", 19, "Bell Canada",     65.00,        "Utilities",       "📱", "#CFA03E"],
    ["t27", 20, "Kelsey's",        54.20,        "Coffee & Dining", "🍷", "#D97A3A"],
    ["t28", 22, "Shopify/Etsy",    38.00,        "Shopping",        "🎁", "#C45898"],
    ["t29", 24, "Costco Gas",      55.80,        "Gas & Transport", "⛽", "#CFA03E"],
    ["t30", 26, "Payroll Deposit", -DEMO.income, "Income",          "💰", "#6FE494"],
  ];
  return rows.map(([id, daysAgo, name, amount, cat, icon, color]) => ({ id, name, amount, cat, icon, color, ...at(daysAgo) }));
}
