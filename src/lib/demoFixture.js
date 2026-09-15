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
