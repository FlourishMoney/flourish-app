// tests/loanActivity.test.cjs
// -----------------------------------------------------------------------------
// MATH-LOCK: A LOAN'S OWN ENTRIES CHANGE NO FIGURE (loan-account-txns, 2026-10-14).
//
// Plaid now returns transactions on loan accounts: a payment RECEIVED (money in), interest and draws
// (money out). Read as the household's own, they became income, spending, bills, and a payment
// counted twice. lib/loanActivity.js keeps every row on an account of type "loan" out of the working
// set (data.transactions) at fetchItemTxns, the one door synced rows come through, and once at load
// for rows saved before the rule. This suite drives that real path end to end:
//
//   Plaid sync page -> netlify/functions/plaid.js (labels each row with its account's type)
//   -> App.jsx fetchItemTxns (splits off loan activity) -> normaliseTxns -> markTransfers -> engines
//
// and asserts that a household with chequing, a card, an auto loan, a HELOC and a mortgage, with
// realistic loan-side entries, shows EXACTLY the figures of the same household without them, on every
// surface: Today (safe to spend, its rows, the pace), Watch (7/30/90 summaries, lowest day), income
// detection and the deposits it asks about, bill detection and bill reconcile, Budget, Patterns,
// the weekly review, Debt Sim and minimums, net worth, the coach's figures, and Meet. It also checks
// the same entries DO move those figures when the rule is bypassed (so the fixture is not inert),
// the classification of the new loan subtypes, the one-tap link for loans, and the demo figures.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const path = require("path");
const { loadApp, describe } = require("./_renderApp.cjs");

const REPO = path.join(__dirname, "..");
const SUPA_PATH = require.resolve("@supabase/supabase-js", { paths: [path.join(REPO, "netlify", "functions")] });
const PLAID_PATH = require.resolve("../netlify/functions/plaid.js");
const AUTH_PATH = require.resolve("../netlify/functions/_lib/auth.js");

(async () => {
  const t = create();
  const LA = await import("../src/lib/loanActivity.js");
  const PN = await import("../src/lib/plaidNormalize.js");
  const F = await import("../src/lib/financialCalculations.js");
  const D = await import("../src/lib/demoFixture.js");
  const DC = await import("../src/lib/depositClassify.js");
  const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
  const { ForecastEngine } = await import("../src/lib/forecastEngine.js");
  const { safeToSpendView } = await import("../src/lib/safeToSpendView.js");
  const { suggestedDailyView } = await import("../src/lib/suggestedDaily.js");
  const W = await import("../src/lib/watchRange.js");
  const { forecastLow } = await import("../src/lib/forecastView.js");
  const { reconcileBills } = await import("../src/lib/billReconcile.js");
  const { billPrompts } = await import("../src/lib/billsReconcile.js");
  const { monthSpendByCategory } = await import("../src/lib/budgetSpend.js");
  const { observedMonthlySpend } = await import("../src/lib/budgetBasis.js");
  const WR = await import("../src/lib/weeklyReview.js");
  const M = await import("../src/lib/meetSnapshot.js");
  const { coachSafeToSpendLine } = await import("../src/lib/decisionEngine.js");

  let A = {};
  try { A = loadApp(["fetchItemTxns", "computeStats"]); }
  catch (e) { t.ok(false, `App.jsx bundles: ${describe(e)}`); }

  const now = new Date(2026, 9, 14, 12, 0, 0); // Oct 14 2026, after Plaid's Oct 5 change
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return ymd(d); };

  // ── 1. the rule ─────────────────────────────────────────────────────────────────────────────
  {
    const acct = (id, type, subtype) => ({ id, type, subtype });
    const accounts = [acct("auto", "loan", "auto"), acct("heloc", "loan", "home equity"), acct("hel", "loan", "home equity loan"),
      acct("com", "loan", "commercial"), acct("cloc", "loan", "commercial line of credit"), acct("loc", "loan", "line of credit"),
      acct("boat", "loan", "boat"), acct("odd", " Loan ", null), acct("card", "credit", "credit card"), acct("credloc", "credit", "line of credit"),
      acct("chq", "depository", "checking"), acct("notype", null, null)];
    const row = (account_id, extra = {}) => ({ id: `r-${account_id}`, account_id, amount: -100, ...extra });
    for (const id of ["auto", "heloc", "hel", "com", "cloc", "loc", "boat", "odd"])
      t.eq(LA.isLoanActivity(row(id), accounts), true, `1a a row on a "${accounts.find((a) => a.id === id).subtype || "loan"}" loan account is loan activity`);
    for (const id of ["card", "credloc", "chq", "notype", "missing"])
      t.eq(LA.isLoanActivity(row(id), accounts), false, `1b a row on "${id}" keeps today's behaviour (cards, type credit, chequing, no type, unknown account)`);
    t.eq(LA.isLoanActivity({ id: "x", amount: 5 }, accounts), false, "1c a row with no account is never loan activity");
    t.eq(LA.isLoanActivity(row("chq", { account_type: "loan" }), accounts), true, "1d the server's label wins (it came with the row)");
    t.eq(LA.isLoanActivity(row("auto", { account_type: "depository" }), accounts), false, "1e …both ways");
    t.eq(LA.isLoanActivity(row("missing", { account_type: "loan" }), []), true, "1f a labelled row needs no stored account");
    const rows = ["chq", "auto", "card", "heloc", "missing"].map((id) => row(id));
    const s = LA.splitLoanActivity(rows, accounts);
    t.eq([s.transactions.map((r) => r.account_id), s.loanActivity.map((r) => r.account_id)], [["chq", "card", "missing"], ["auto", "heloc"]], "1g split keeps order on each side");
  }

  // ── 2. the store ────────────────────────────────────────────────────────────────────────────
  {
    const mem = new Map(); const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    LA.storeLoanActivity([{ id: "a", account_id: "L", date: "2026-10-01", amount: -1 }, { id: "b", account_id: "L", date: "2026-10-05", amount: 2 }], [], st);
    LA.storeLoanActivity([{ id: "a", account_id: "L", date: "2026-10-01", amount: -9 }, { id: "c", account_id: "K", date: "2026-10-03", amount: 3 }], ["b"], st);
    t.eq(LA.readLoanActivity(st).map((r) => [r.id, r.amount]), [["c", 3], ["a", -9]], "2a merged by id (modified wins), removed ids dropped, newest first");
    t.eq(LA.loanActivityFor("L", st).map((r) => r.id), ["a"], "2b one account's loan activity");
    t.eq(LA.LOAN_ACTIVITY_KEY.startsWith("flourish_"), true, "2c the key is cleared on sign-out with every flourish_ key");
    const saved = { appData: { accounts: [{ id: "L", type: "loan", subtype: "auto" }, { id: "C", type: "depository" }], transactions: [{ id: "x", account_id: "C" }, { id: "y", account_id: "L", date: "2026-10-02" }], incomes: [1] } };
    const moved = LA.moveSavedLoanActivity(saved, st);
    t.eq([moved.appData.transactions.map((r) => r.id), moved.appData.incomes, LA.loanActivityFor("L", st).map((r) => r.id).sort()], [["x"], [1], ["a", "y"]], "2d rows saved before the rule move to the store at load; nothing else changes");
    t.ok(LA.moveSavedLoanActivity({ appData: { accounts: [], transactions: [{ id: "x" }] } }, st).appData.transactions.length === 1, "2e no loan rows: the saved state is returned as it was");
  }

  // ── The household ───────────────────────────────────────────────────────────────────────────
  // Plaid-shaped accounts and transactions. Chequing pays the card, the auto loan, the HELOC and the
  // mortgage every month; each loan reports its own side: the payment received, interest, and on the
  // HELOC a draw. Amounts are Plaid's sign (positive = money out of THAT account).
  const PA = [
    { account_id: "chq", name: "Chequing", type: "depository", subtype: "checking", balances: { available: 4210.55, current: 4210.55, iso_currency_code: "CAD" } },
    { account_id: "card", name: "Visa", type: "credit", subtype: "credit card", balances: { current: 812.4, limit: 5000, iso_currency_code: "CAD" } },
    { account_id: "auto", name: "Auto loan", type: "loan", subtype: "auto", balances: { current: 18400, iso_currency_code: "CAD" } },
    { account_id: "heloc", name: "Home equity line", type: "loan", subtype: "home equity", balances: { current: 42000, iso_currency_code: "CAD" } },
    { account_id: "mort", name: "Mortgage", type: "loan", subtype: "mortgage", balances: { current: 312000, iso_currency_code: "CAD" } },
  ];
  const tx = (id, account_id, n, amount, name, primary, detailed) => ({ transaction_id: id, account_id, date: ago(n), authorized_date: ago(n), amount, name,
    merchant_name: null, original_description: name, iso_currency_code: "CAD", pending: false, personal_finance_category: { primary, detailed } });
  const base = [];
  for (const [m, d] of [[0, 2], [1, 32], [2, 62]]) {
    base.push(tx(`pay-${m}a`, "chq", d + 1, -2840, "PAYROLL DEPOSIT ACME", "INCOME", "INCOME_WAGES"));
    base.push(tx(`pay-${m}b`, "chq", d + 15, -2840, "PAYROLL DEPOSIT ACME", "INCOME", "INCOME_WAGES"));
    base.push(tx(`gro-${m}a`, "card", d + 3, 142.18, "LOBLAWS", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"));
    base.push(tx(`gro-${m}b`, "card", d + 11, 96.4, "METRO", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"));
    base.push(tx(`cof-${m}`, "card", d + 6, 18.75, "TIM HORTONS", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"));
    base.push(tx(`gas-${m}`, "chq", d + 8, 71.2, "PETRO-CANADA", "TRANSPORTATION", "TRANSPORTATION_GAS"));
    base.push(tx(`hyd-${m}`, "chq", d + 5, 96.0, "HYDRO ONE", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"));
    base.push(tx(`net-${m}`, "card", d + 9, 18.99, "NETFLIX", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"));
    base.push(tx(`ccp-${m}`, "chq", d + 4, 600, "VISA PAYMENT THANK YOU", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"));
    base.push(tx(`ccp-${m}r`, "card", d + 4, -600, "PAYMENT - THANK YOU", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"));
    base.push(tx(`autop-${m}`, "chq", d + 7, 425, "AUTO LOAN PAYMENT", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"));
    base.push(tx(`help-${m}`, "chq", d + 10, 300, "HELOC PAYMENT", "LOAN_PAYMENTS", "LOAN_PAYMENTS_OTHER_PAYMENT"));
    base.push(tx(`mortp-${m}`, "chq", d + 1, 1650, "MORTGAGE PAYMENT", "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"));
  }
  const loanSide = [];
  for (const [m, d] of [[0, 2], [1, 32], [2, 62]]) {
    loanSide.push(tx(`L-autop-${m}`, "auto", d + 6, -425, "PAYMENT RECEIVED", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"));
    loanSide.push(tx(`L-autoi-${m}`, "auto", d + 12, 92.11, "INTEREST CHARGED", "BANK_FEES", "BANK_FEES_INTEREST_CHARGE"));
    loanSide.push(tx(`L-help-${m}`, "heloc", d + 9, -300, "PAYMENT RECEIVED THANK YOU", "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"));
    loanSide.push(tx(`L-heli-${m}`, "heloc", d + 14, 211.48, "INTEREST", "OTHER", "OTHER_OTHER"));
    loanSide.push(tx(`L-mortp-${m}`, "mort", d, -1650, "MORTGAGE PAYMENT RECEIVED", "INCOME", "INCOME_OTHER_INCOME"));
    loanSide.push(tx(`L-morti-${m}`, "mort", d + 3, 1068.21, "INTEREST", "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"));
    loanSide.push(tx(`L-morte-${m}`, "mort", d + 3, 312.5, "ESCROW DISBURSEMENT PROPERTY TAX", "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT"));
  }
  loanSide.push(tx("L-draw", "heloc", 9, 1500, "ADVANCE", "TRANSFER_OUT", "TRANSFER_OUT_WITHDRAWAL"));
  loanSide.push(tx("L-draw2", "heloc", 41, 2200, "LINE OF CREDIT ADVANCE", "OTHER", "OTHER_OTHER"));

  // ── 3. the real path: server labels, fetchItemTxns splits ────────────────────────────────────
  // plaid.js get_transactions against a fake Plaid (/transactions/sync, nothing leaves the machine),
  // then the app's own fetchItemTxns against a fake /api/plaid that answers with that server output.
  function fakeSupabase() {
    const q = { select() { return q; }, eq() { return q; }, update() { return q; }, single: async () => ({ data: { access_token: "access-sandbox-test", next_cursor: null }, error: null }), maybeSingle: async () => ({ data: null, error: null }),
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } };
    return { from: () => q, auth: { admin: {} } };
  }
  async function serverSync(plaidTxns, { withAccounts = true } = {}) {
    const saved = { ...process.env };
    Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.test", SUPABASE_SECRET_KEY: "test-service-role", PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox" });
    require.cache[SUPA_PATH] = { id: SUPA_PATH, filename: SUPA_PATH, loaded: true, exports: { createClient: () => fakeSupabase() } };
    delete require.cache[AUTH_PATH]; delete require.cache[PLAID_PATH];
    const auth = require(AUTH_PATH);
    auth.getUserFromRequest = async () => ({ user_id: "u1", error: null });
    const plaid = require(PLAID_PATH);
    const realFetch = global.fetch; const calls = [];
    global.fetch = async (url, init) => {
      const u = String(url); calls.push(u.replace(/^https:\/\/[^/]+/, ""));
      const json = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
      if (u.endsWith("/transactions/sync")) return json({ added: plaidTxns, modified: [], removed: [], next_cursor: "c1", has_more: false, ...(withAccounts ? { accounts: PA } : {}) });
      if (u.endsWith("/accounts/get")) return json({ accounts: PA, item: {} });
      if (u.includes("supabase")) return json([]);
      throw new Error("network blocked in test: " + u);
    };
    try {
      const res = await plaid.handler({ httpMethod: "POST", headers: { origin: "https://flourishmoney.app", authorization: "Bearer x" },
        body: JSON.stringify({ action: "get_transactions", item_id: "item-1", access_token: "access-sandbox-test", days: 90, full_resync: true }) });
      return { status: res.statusCode, body: JSON.parse(res.body || "{}"), calls };
    } finally { global.fetch = realFetch; process.env = saved; delete require.cache[PLAID_PATH]; delete require.cache[AUTH_PATH]; delete require.cache[SUPA_PATH]; }
  }
  async function clientFetch(serverBody, storedAccounts) {
    const realFetch = global.fetch;
    if (storedAccounts) globalThis.localStorage.setItem("flourish_v1", JSON.stringify({ appData: { accounts: storedAccounts } }));
    global.fetch = async (url) => {
      if (!String(url).includes("/api/plaid")) throw new Error("network blocked in test: " + url);
      return { ok: true, status: 200, json: async () => serverBody };
    };
    try { return await A.fetchItemTxns("item-1", "jwt", true); } finally { global.fetch = realFetch; }
  }

  const srv = await serverSync([...base, ...loanSide]);
  t.eq(srv.status, 200, "3a the server answers get_transactions");
  const rows = srv.body.transactions || [];
  const lab = (id) => rows.find((r) => r.id === id) || {};
  t.eq([lab("pay-0a").account_type, lab("ccp-0r").account_type, lab("L-autop-0").account_type, lab("L-heli-0").account_subtype, lab("L-mortp-0").account_subtype],
    ["depository", "credit", "loan", "home equity", "mortgage"], "3b every row is labelled with its account's type and subtype from the same Plaid response");
  t.eq(rows.length, base.length + loanSide.length, "3c the server drops nothing: the split is the client's, in one place");
  const srvNoAcct = await serverSync([...base, ...loanSide], { withAccounts: false });
  t.ok(srvNoAcct.calls.some((c) => c.endsWith("/accounts/get")), "3d a sync page without accounts: one /accounts/get call supplies them");
  t.eq((srvNoAcct.body.transactions || []).find((r) => r.id === "L-autop-0")?.account_type, "loan", "3e …and the rows are still labelled");

  let fetched = { transactions: [] };
  try { fetched = await clientFetch(srv.body); } catch (e) { t.ok(false, `3f fetchItemTxns runs: ${describe(e)}`); }
  const ids = new Set((fetched.transactions || []).map((r) => r.id));
  t.eq(loanSide.filter((r) => ids.has(r.transaction_id)).map((r) => r.transaction_id), [], "3f fetchItemTxns returns no loan-side row to any caller");
  t.eq(base.every((r) => ids.has(r.transaction_id)), true, "3g …and every chequing and card row, the card payment included");
  const storedLoan = (() => { try { return JSON.parse((A.store && A.store.get(LA.LOAN_ACTIVITY_KEY)) || "[]"); } catch { return []; } })();
  t.eq(storedLoan.map((r) => r.id).sort(), loanSide.map((r) => r.transaction_id).sort(), "3h the loan-side rows are kept, in the loan-activity store");
  // A row the server did not label (an older server) falls back to the stored accounts.
  const unlabelled = { transactions: (srv.body.transactions || []).map(({ account_type, account_subtype, ...r }) => r), removed: [] };
  let fb = { transactions: [] };
  try { fb = await clientFetch(unlabelled, PA.map((a) => ({ id: a.account_id, type: a.type, subtype: a.subtype }))); } catch (e) { t.ok(false, `3i fallback runs: ${describe(e)}`); }
  t.eq((fb.transactions || []).filter((r) => r.id.startsWith("L-")).length, 0, "3i unlabelled rows: the stored accounts still keep loan activity out");

  // The two households: the one through the real path, and the same one with no loan-side rows.
  const accounts = PA.map((a) => ({ id: a.account_id, name: a.name, type: a.type, subtype: a.subtype, balance: PN.normalizeAccountBalance({ type: a.type, balance: a.balances }), currency: "CAD", institution: "Sandbox Bank", _item: "item-1" }));
  const household = (txnRows) => {
    const debts = [{ id: "d-card", name: "Visa", balance: "812.40", rate: "20.99", min: "25", fromBank: true, account_id: "card" }];
    const ts = PN.markTransfers(PN.normaliseTxns(txnRows, now), (x) => F.isInternalTransfer(x) || F.isCCPayment(x, debts), F.isCashAdvance);
    return { profile: { country: "CA", name: "Sam" }, accounts, debts, transactions: ts, bankConnected: true,
      incomes: [{ id: "i1", label: "Acme payroll", amount: "2840", freq: "biweekly", date: ago(2) }],
      bills: [{ id: "b1", name: "Hydro One", amount: "96", freq: "monthly", date: String(new Date(ago(2)).getDate()) }],
      goals: [], depositDecisions: {}, depositRules: [] };
  };
  // Both households take the same path: the server, then fetchItemTxns. The third is the first with
  // the rule bypassed: the server's rows straight into the pipeline.
  globalThis.localStorage.removeItem(LA.LOAN_ACTIVITY_KEY);
  let fetchedWithout = { transactions: [] };
  try { fetchedWithout = await clientFetch((await serverSync(base)).body); } catch (e) { t.ok(false, `4 the household without loan entries fetches: ${describe(e)}`); }
  const withLoans = household((fetched.transactions || []).map((r) => ({ ...r })));
  const without = household((fetchedWithout.transactions || []).map((r) => ({ ...r })));
  const bypass = household((srv.body.transactions || []).map((r) => ({ ...r })));

  // ── 4. every figure, identical ───────────────────────────────────────────────────────────────
  function figures(data) {
    const f = {};
    const ss = SafeSpendEngine.calculate(data, now); const v = safeToSpendView(ss);
    f["Today safe to spend"] = v.headline; f["Today rows"] = v.rows.map((r) => [r.label, r.display]); f["Today safety buffer"] = ss.safetyBuf;
    f["Today pace"] = suggestedDailyView(v.headline, data.incomes, data.transactions, now, data);
    const fc = ForecastEngine.generate(data, 90, null, now);
    f["Watch daily spend"] = fc.avgDailySpend;
    for (const r of W.WATCH_RANGES) { const s = W.rangeSummary(fc.forecast, r, { avgDailySpend: fc.avgDailySpend }); f[`Watch ${r}d check`] = s.check.line; f[`Watch ${r}d lowest`] = s.text.low; }
    f["Watch lowest day"] = forecastLow(fc.forecast);
    f["Watch forecast"] = fc.forecast.map((d) => Math.round(d.balance * 100));
    f["Income detection"] = PN.detectIncomeFromTxns(DC.incomeEvidence(data));
    f["Income: deposits asked about"] = DC.depositsToAsk(data, now);
    f["Bill detection"] = PN.detectRecurringBills(data.transactions, { overrides: {}, debts: data.debts });
    f["Bill reconcile"] = reconcileBills(data.bills, data.transactions, now);
    f["Bill prompts"] = billPrompts({ detectedBills: f["Bill detection"], currentBills: data.bills, now: now.getTime() });
    f["Budget actuals"] = monthSpendByCategory(data.transactions, { now, debts: data.debts });
    f["Budget observed"] = observedMonthlySpend(data, now);
    f["Patterns stats"] = A.computeStats ? A.computeStats(data.transactions) : "unloaded";
    const cf = F.FinancialCalcEngine.cashFlow(data, {}, now); f["cashFlow"] = [cf.monthlyIncome, cf.monthlySpend, cf.totalExpenses, cf.cashFlow];
    f["Weekly review"] = [WR.weekVersusUsual({ transactions: data.transactions, now }), WR.categoryPaceDeltas({ transactions: data.transactions, now })];
    f["Debt Sim"] = F.buildDebtListForSimulator(data.debts, data.liabilities, data);
    f["Debt minimums"] = F.debtMinimums(data.debts).map((x) => x.amount);
    f["Net worth"] = F.netWorthRows(data).total;
    f["What-If inputs"] = [ss.safeAmount, F.FinancialCalcEngine.avgDailySpend(data), F.FinancialCalcEngine.emergencyFundMonths(data, {})];
    f["Coach safe-to-spend line"] = coachSafeToSpendLine(data, now);
    const recent = data.transactions.slice(0, 40); // buildContext's own slice: "Recent spending" and "Top categories"
    f["Coach recent spending"] = recent.filter((x) => x.amount > 0 && !x.isTransfer).reduce((s, x) => s + x.amount, 0);
    f["Meet agenda"] = M.buildMeetSnapshot(data);
    f["Meet reconcile prompts"] = M.buildReconcilePrompts(data);
    return f;
  }
  const fw = figures(withLoans), fo = figures(without), fb2 = figures(bypass);
  t.eq(withLoans.transactions, without.transactions, "4a the working set every surface reads is the same transactions, row for row");
  for (const k of Object.keys(fo)) t.eq(fw[k], fo[k], `4b ${k}: identical with and without the loan-side entries`);
  // Not inert: the same entries, with the rule bypassed, move the household's figures.
  const moved = Object.keys(fo).filter((k) => JSON.stringify(fb2[k]) !== JSON.stringify(fo[k]));
  t.ok(moved.length >= 8, `4c with the rule bypassed, the loan-side entries change ${moved.length} of these figures (${moved.slice(0, 6).join(", ")}…)`);
  t.ok(["Today safe to spend", "Watch 30d check", "Budget actuals", "Patterns stats"].every((k) => moved.includes(k)), "4d …among them safe to spend, the 30-day forecast, Budget and Patterns");

  // ── 5. the new subtypes are liabilities, never cash ──────────────────────────────────────────
  {
    for (const subtype of ["home equity", "home equity loan", "commercial", "commercial line of credit"]) {
      const a = { id: "x", name: subtype, type: "loan", subtype, balance: PN.normalizeAccountBalance({ type: "loan", balance: { current: 25000 } }), currency: "CAD" };
      const d = { profile: { country: "CA" }, accounts: [{ id: "c", name: "Chequing", type: "depository", subtype: "checking", balance: 1000, currency: "CAD" }, a], debts: [], incomes: [], bills: [], transactions: [] };
      t.eq([F.isCashAccount(a), F.isCreditLiability(a), a.balance < 0], [false, true, true], `5a ${subtype}: not cash, a liability, stored as owed`);
      t.eq(SafeSpendEngine.calculate(d, now).balance, 1000, `5b ${subtype}: safe to spend's balance is the chequing alone`);
      const nw = F.netWorthRows(d);
      t.eq([nw.total, nw.rows.find((r) => r.id === "x")?.cents], [1000 - 25000, -2500000], `5c ${subtype}: net worth counts it as owed (it was missing from net worth)`);
      const coach = String(coachSafeToSpendLine(d, now));
      t.ok(!/26,000|26000/.test(coach), `5d ${subtype}: the coach's money line never adds it to cash`);
    }
  }

  // ── 6. the one-tap link covers a loan ────────────────────────────────────────────────────────
  {
    const auto = { id: "auto", name: "Auto loan", type: "loan", subtype: "auto", balance: -8200, currency: "CAD", institution: "Sandbox Bank" };
    const chq = { id: "c", name: "Chequing", type: "depository", subtype: "checking", balance: 3000, currency: "CAD" };
    const hand = { id: "d1", name: "Car Loan", balance: "8200", rate: "6.99", min: "280" };
    const bankRow = { id: "d2", name: "Auto loan", balance: "8200.00", rate: "", min: "", fromBank: true, account_id: "auto" };
    const d = { profile: { country: "CA" }, accounts: [chq, auto], debts: [hand, bankRow], incomes: [], bills: [], transactions: [] };
    const m = F.likelyDebtAccountMatches(d);
    t.eq(m.map((x) => [x.debtLabel, x.accountId, x.accountKind]), [["Car Loan", "auto", "auto"]], "6a a hand-entered Car Loan and a linked auto loan are offered as the same debt");
    t.eq(F.debtAccountKindWord(m[0] && m[0].accountKind), "auto loan", "6b …in words the prompt can say (not \"card\")");
    t.eq(F.buildDebtListForSimulator(d.debts, null, d).length, 2, "6c before the answer, Debt Sim lists both (marked as possibly the same)");
    const linked = F.linkDebtToAccount(d, m[0]);
    t.eq(F.buildDebtListForSimulator(linked.debts, null, linked).map((x) => [x.name, x.balance]), [["Auto loan", 8200]], "6d after \"Yes\": Debt Sim and the coach's debts line count it once");
    t.eq(F.debtMinimums(linked.debts).map((x) => x.amount), [280], "6e …the minimum once");
    t.eq(F.netWorthRows(linked).total, 3000 - 8200, "6f …and net worth once");
    const visa = { id: "d3", name: "Visa card", balance: "500" };
    t.eq(F.likelyDebtAccountMatches({ ...d, debts: [visa] }).length, 0, "6g a card never pairs with a loan account");
  }

  // ── 7. the demo is unchanged ─────────────────────────────────────────────────────────────────
  {
    const today = new Date();
    const demo = { profile: D.demoProfileFor("CA"), accounts: D.demoAccountsFor("CA"), debts: D.demoDebtsFor("CA", today), incomes: D.buildDemoIncomes(today, "CA"),
      bills: D.buildDemoBills(today, "CA"), transactions: D.buildDemoTxns(today, "CA"), bankConnected: true, demo: true };
    t.eq(LA.splitLoanActivity(demo.transactions, demo.accounts).loanActivity.length, 0, "7a the demo has no loan activity: the rule leaves it alone");
    const ss = SafeSpendEngine.calculate(demo, today); const v = safeToSpendView(ss);
    const pace = suggestedDailyView(v.headline, demo.incomes, demo.transactions, today, demo);
    const fc = ForecastEngine.generate(demo, 30, null, today);
    const s30 = W.rangeSummary(fc.forecast, 30, { avgDailySpend: fc.avgDailySpend });
    t.eq([v.balanceText, `$${v.headline.toLocaleString("en-US")}`, pace && pace.dailyText], ["$3,083", "$1,944", "$138"], "7b the demo still reads $3,083, $1,944 and a $138 pace");
    t.eq(s30.check.line, "$3,083.88 + $6,240.00 − $2,176.99 − $1,003.85 = $6,143.04", "7c …and its Watch 30-day check line");
  }

  t.summary("loanActivity.test");
})();
