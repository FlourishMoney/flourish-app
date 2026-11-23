// tests/review1122Data.test.cjs
// -----------------------------------------------------------------------------
// THE FULL-APP REVIEW OF 2026-11-22: DATA LOSS, HOUSEHOLDS AND SAVING.
//
// One block per finding, each assertion numbered with the finding's id. A REAL finding's checks failed on main
// (eec2c36) before its fix; a NOT REAL finding's checks pass on main as it stood and hold what makes it so.
//
//   P4-02   two members editing different records in one section: both edits are kept (was: one section wins)
//   P5-03   a profile holding only the device's default country is not "real data" (was: it outranked the cloud)
//   P10-03  the exit save lands only over an OLDER saved copy (was: an unconditional upsert, whatever arrived last)
//   P10-02  a save that fails before a household is created is kept and stops the invite (was: dropped, unchecked)
//   P10-08  this person's own keys are tried again by themselves after a failed save (was: only with the next change)
//   P9-03   the export carries every part of the household's data and the side stores (was: a fixed short list)
//   G6      in a store app the export goes through the share sheet (was: a download link the WebView ignores)
//   P1-03   a member who leaves takes their own banks' corrections and deposit answers with them
//   P1-01   NOT REAL: starting fresh on leaving is the product's rule, told on both consent screens and on Leave
//   P4-03 / G14  NOT REAL: flourish keeps nothing in IndexedDB, so there is no private cache for a wipe to miss
//   P5-07   NOT REAL: a consent kept offline is sent later with its original times and dates
//   P1-07   REAL, low, waits: the gift page removes the session from this browser instead of asking the server
// -----------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
const fn = (o, name) => (o && typeof o[name] === "function" ? o[name] : null);

class FakeStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(k); }
}

(async () => {
  const t = create();
  const H = await import("../src/lib/household.js");
  const PS = await import("../src/lib/persistence.js");
  const HW = await import("../src/lib/householdWords.js");
  const LC = await import("../src/lib/legalConsent.js");
  let DX = null;
  try { DX = await import("../src/lib/dataExport.js"); } catch { DX = null; }
  const app = read("src", "App.jsx");

  // ══ P4-02 ═══════════════════════════════════════════════════════════════════════════════════════════════
  {
    const blob = (appData, sideKeys = {}) => ({ core: { onboarded: true, checkInBonus: 0, appData }, sideKeys });
    const bills = [{ id: "b1", name: "Rent", amount: 1500 }, { id: "b2", name: "Hydro", amount: 80 }, { id: "b3", name: "Phone", amount: 60 }];
    const base = blob({ bills, goals: [{ id: "g1", name: "Trip", saved: 0 }] });
    const mine = blob({ bills: [{ ...bills[0], amount: 1550 }, bills[1], bills[2]], goals: base.core.appData.goals });
    const theirs = blob({ bills: [bills[0], { ...bills[1], amount: 95 }, bills[2]], goals: base.core.appData.goals });
    const m = H.mergeHouseholdBlobs(base, mine, theirs);
    t.eq(m.core.appData.bills, [{ id: "b1", name: "Rent", amount: 1550 }, { id: "b2", name: "Hydro", amount: 95 }, { id: "b3", name: "Phone", amount: 60 }],
      "P4-02a each member edited a DIFFERENT bill: both edits are in the merged list");

    const added = H.mergeHouseholdBlobs(base, mine, blob({ bills: [...bills, { id: "b4", name: "Gym", amount: 40 }], goals: base.core.appData.goals }));
    t.eq(added.core.appData.bills.map((b) => [b.id, b.amount]), [["b1", 1550], ["b2", 80], ["b3", 60], ["b4", 40]],
      "P4-02b this phone edited one bill while the other member ADDED one: the edit and the new bill both stay");

    const removed = H.mergeHouseholdBlobs(base, mine, blob({ bills: [bills[0], bills[2]], goals: base.core.appData.goals }));
    t.eq(removed.core.appData.bills.map((b) => [b.id, b.amount]), [["b1", 1550], ["b3", 60]],
      "P4-02c the other member DELETED a bill this phone did not touch: it stays deleted, and this phone's edit is kept");

    const same = H.mergeHouseholdBlobs(base, mine, blob({ bills: [{ ...bills[0], amount: 1400 }, bills[1], bills[2]], goals: base.core.appData.goals }));
    t.eq(same.core.appData.bills[0].amount, 1550, "P4-02d both edited the SAME bill: the later save (this phone's) wins, as before");

    const iDeleted = H.mergeHouseholdBlobs(base, blob({ bills: [bills[0], bills[2]], goals: base.core.appData.goals }), theirs);
    t.eq(iDeleted.core.appData.bills.map((b) => b.id), ["b1", "b3"], "P4-02e a bill this phone deleted stays deleted, whatever the other member did to it meanwhile");

    // Records made in onboarding carry no id: the name stands in for it.
    const named = [{ name: "Rent", amount: 1500, date: "1" }, { name: "Hydro", amount: 80, date: "15" }];
    const byName = H.mergeHouseholdBlobs(blob({ bills: named }), blob({ bills: [{ ...named[0], amount: 1600 }, named[1]] }), blob({ bills: [named[0], { ...named[1], date: "20" }] }));
    t.eq(byName.core.appData.bills, [{ name: "Rent", amount: 1600, date: "1" }, { name: "Hydro", amount: 80, date: "20" }],
      "P4-02f bills with no id are matched by name: both edits are kept");

    // Nothing to tell two records apart by (two with one name, none with an id): the whole section, as before.
    const twins = [{ name: "Card", amount: 10 }, { name: "Card", amount: 20 }];
    const fallback = H.mergeHouseholdBlobs(blob({ bills: twins }), blob({ bills: [{ name: "Card", amount: 11 }, twins[1]] }), blob({ bills: [twins[0], { name: "Card", amount: 22 }] }));
    t.eq(fallback.core.appData.bills, [{ name: "Card", amount: 11 }, { name: "Card", amount: 20 }],
      "P4-02g records that cannot be told apart are not guessed at: this phone's section wins, as before");

    // Category corrections: one JSON map in a shared side key, keyed by transaction.
    const cats = (o) => ({ flourish_cat_overrides: JSON.stringify(o) });
    const side = H.mergeHouseholdBlobs(blob({ bills }, cats({ t1: "Dining" })), blob({ bills }, cats({ t1: "Dining", t2: "Groceries" })), blob({ bills }, cats({ t1: "Dining", t3: "Fuel" })));
    t.eq(JSON.parse(side.sideKeys.flourish_cat_overrides), { t1: "Dining", t2: "Groceries", t3: "Fuel" },
      "P4-02h each member corrected a different transaction's category: both corrections are kept");

    const prof = H.mergeHouseholdBlobs(blob({ profile: { name: "A", province: "ON", creditScore: 680 } }), blob({ profile: { name: "A", province: "ON", creditScore: 720 } }), blob({ profile: { name: "A", province: "BC", creditScore: 680 } }));
    t.eq(prof.core.appData.profile, { name: "A", province: "BC", creditScore: 720 }, "P4-02i each changed a different profile field: both are kept");

    const dep = H.mergeHouseholdBlobs(blob({ depositDecisions: { t1: { reason: "income" } } }), blob({ depositDecisions: { t1: { reason: "income" }, t2: { reason: "gift" } } }), blob({ depositDecisions: { t3: { reason: "refund" } } }));
    t.eq(dep.core.appData.depositDecisions, { t2: { reason: "gift" }, t3: { reason: "refund" } },
      "P4-02j deposit answers: one added, one added and one removed on the other side: all three changes hold");

    // What was true before still is: a section only one side changed, and a removed bank account.
    const one = H.mergeHouseholdBlobs(base, mine, blob({ bills, goals: [{ id: "g1", name: "Trip", saved: 50 }] }));
    t.eq([one.core.appData.bills[0].amount, one.core.appData.goals[0].saved], [1550, 50], "P4-02k a section only the other member changed is still theirs");
    const acc = (list, extra = {}) => blob({ accounts: list, ...extra });
    const banks = [{ id: "a1", _item: "i1", balance: 10 }, { id: "a2", _item: "i2", balance: 5 }];
    const gone = H.mergeHouseholdBlobs(acc(banks, { debts: [{ id: "d2", account_id: "a2" }] }), acc([{ ...banks[0], balance: 11 }, { ...banks[1], balance: 6 }], { debts: [{ id: "d2", account_id: "a2", min: 9 }] }), acc([banks[0]], { debts: [] }));
    t.eq([gone.core.appData.accounts.map((a) => [a.id, a.balance]), gone.core.appData.debts], [[["a1", 11]], []],
      "P4-02l a bank account the other member took away stays away, with the debt made from it, although this phone had just refreshed both");
  }

  // ══ P5-03 ═══════════════════════════════════════════════════════════════════════════════════════════════
  {
    // What onboarding starts every profile with (App.jsx Onboarding's `p`): the device's country, nothing typed.
    const blank = { profile: { name: "", country: "CA", province: "", partnerName: "", creditScore: 680, creditKnown: false, lifeStages: ["t4"] }, incomes: [], bills: [], debts: [], transactions: [], accounts: [], bankConnected: false };
    t.eq(PS.isBlobEmpty({ core: { appData: blank } }), true, "P5-03a a profile holding only the device's default country, and no record, is an EMPTY blob");
    t.eq(PS.hasRealLocalData(blank), false, "P5-03b …so this device does not count as holding real data");
    t.eq(PS.hasRealLocalData({ ...blank, profile: { ...blank.profile, country: "US" } }), false, "P5-03c the same for a device the United States was guessed for");
    const d = PS.decideHydrate({ remoteUpdatedAt: "2026-11-01T10:00:00.000Z", localSavedAt: "2026-11-22T10:00:00.000Z", localHasRealData: PS.hasRealLocalData(blank) });
    t.eq([d.apply, d.pushLocal, d.reason], [true, false, "local-empty"], "P5-03d at sign-in the cloud's copy is applied, never overwritten by that blank device, whatever its time stamp says");

    const writes = [];
    const realRow = { core: { appData: { profile: { name: "Sam", country: "CA" }, bills: [{ name: "Rent", amount: 1500 }] } } };
    const sb = { from() { const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { data: { data: realRow, updated_at: "2026-11-01T10:00:00.000Z" }, error: null }; },
      async upsert(row) { writes.push(row); return { error: null }; } }; return q; } };
    const log = console.error; console.error = () => {};
    const r = await PS.upsertUserData(sb, "u1", { schemaVersion: 1, core: { onboarded: true, appData: blank }, sideKeys: {} });
    console.error = log;
    t.eq([r.ok, !!r.refused, writes.length], [false, true, 0], "P5-03e the save itself refuses to put that blank blob over a row that holds real data");

    t.eq(PS.hasRealLocalData({ profile: { name: "Sam", country: "CA" } }), true, "P5-03f a name someone typed is still real data");
    t.eq(PS.hasRealLocalData({ profile: { country: "CA", province: "ON" } }), true, "P5-03g so is a province someone picked (it starts unset)");
    t.eq(PS.hasRealLocalData({ profile: { country: "CA" }, incomes: [{ amount: 2100 }] }), true, "P5-03h and any record: an income, a bill, a debt, a goal, an account, a transaction");
    t.ok(/const \[p,setP\]=useState\(\(\)=>\{ const country=deviceCountry\(\); return \{name:"",country,province:""/.test(app),
      "P5-03i onboarding does start every profile with the device's country and an unset province, which is why country alone proves nothing");
  }

  // ══ P10-03 ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    const beacon = fn(PS, "beaconRequest");
    const blob = { schemaVersion: 1, savedAt: "2026-11-22T15:04:05.678Z", core: { appData: { bills: [{ name: "Rent", amount: 1 }] } }, sideKeys: {} };
    const req = beacon ? beacon({ userId: "11111111-1111-4111-8111-111111111111", blob }, { baseUrl: "https://db.example" }) : null;
    t.ok(!!req && req.method === "PATCH", "P10-03a the exit save for one's own data is an UPDATE of the row, never an insert-or-replace");
    const u = req ? new URL(req.url) : null;
    t.eq(u && [u.pathname, u.searchParams.get("user_id")], ["/rest/v1/user_data", "eq.11111111-1111-4111-8111-111111111111"], "P10-03b …of this account's own row");
    t.eq(u && u.searchParams.get("or"), '(data->>savedAt.is.null,data->>savedAt.lt."2026-11-22T15:04:05.678Z")',
      "P10-03c …and only where the saved copy is OLDER than this one (or carries no time): a newer save already there is left alone");
    t.eq(req && JSON.parse(req.body), { data: blob, schema_version: 1 }, "P10-03d the body is the blob, as before");
    t.eq(beacon && beacon({ userId: "u", blob: { ...blob, savedAt: null } }, { baseUrl: "https://db.example" }), null,
      "P10-03e a blob with no time of its own is not sent this way at all (the awaited save still goes)");
    const hreq = beacon ? beacon({ userId: "u", householdId: "22222222-2222-4222-8222-222222222222", blob }, { baseUrl: "https://db.example", householdVersion: 7 }) : null;
    const hu = hreq ? new URL(hreq.url) : null;
    t.eq(hu && [hreq.method, hu.pathname, hu.searchParams.get("household_id"), hu.searchParams.get("version")], ["PATCH", "/rest/v1/household_data", "eq.22222222-2222-4222-8222-222222222222", "eq.7"],
      "P10-03f a household's exit save is unchanged: only over the version this device read");

    // The rule itself, as the database applies it: three arrivals in the wrong order.
    const lands = fn(PS, "beaconLands");
    t.eq(lands && [lands("2026-11-22T15:00:00.000Z", "2026-11-22T15:04:05.678Z"), lands("2026-11-22T15:09:00.000Z", "2026-11-22T15:04:05.678Z"), lands(null, "2026-11-22T15:04:05.678Z"), lands("2026-11-22T15:04:05.678Z", "2026-11-22T15:04:05.678Z")],
      [true, false, true, false], "P10-03g over an older copy it lands; over a NEWER one (the late arrival) it does not; over one with no time it lands; over itself it changes nothing");
    const body = app.slice(app.indexOf("const beaconPersist = (payload) => {"), app.indexOf("// The account was deleted in another tab of this device"));
    t.ok(/beaconRequest\(payload,/.test(body) && !/resolution=merge-duplicates/.test(body) && !/user_data\?on_conflict=user_id/.test(body),
      "P10-03h the app's exit save uses it, and no longer sends an unconditional upsert");
    t.ok(/if \(saver\?\.hasPending\?\.\(\)\) beaconPersist\(saver\.peek\?\.\(\)\);\s*\n\s*saver\?\.flush\?\.\(\);/.test(app),
      "P10-03i the awaited save still follows it every time (Bug B's rule: the exit save is best effort, never the only one)");
  }

  // ══ P10-02 ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    const flush = fn(PS, "flushPendingSave");
    const mk = () => PS.makeDebouncedSaver(() => {}, 60000);
    const log = console.log; console.log = () => {};
    const s1 = mk(); s1.schedule({ userId: "u", blob: { n: 1 } });
    const r1 = flush ? await flush(s1, async () => ({ ok: false, error: new Error("offline") })) : null;
    t.eq(r1 && [r1.ok, s1.hasPending(), s1.peek()], [false, true, { userId: "u", blob: { n: 1 } }],
      "P10-02a the save before a household is created FAILED: it says so, and the save is still waiting (not dropped)");
    const s2 = mk(); s2.schedule({ userId: "u", blob: { n: 2 } });
    const sent = [];
    const r2 = flush ? await flush(s2, async (p) => { sent.push(p); return { ok: true }; }) : null;
    t.eq(r2 && [r2.ok, s2.hasPending(), sent], [true, false, [{ userId: "u", blob: { n: 2 } }]], "P10-02b it went through: sent once, nothing left waiting");
    const s3 = mk();
    t.eq(flush && await flush(s3, async () => { throw new Error("never called"); }), { ok: true, nothing: true }, "P10-02c nothing was waiting: nothing is sent, and that is not a failure");
    const s4 = mk(); s4.schedule({ userId: "u", blob: { n: 4 } });
    const r4 = flush ? await flush(s4, async () => { s4.schedule({ userId: "u", blob: { n: 5 } }); return { ok: false }; }) : null;
    t.eq(r4 && [r4.ok, s4.peek()], [false, { userId: "u", blob: { n: 5 } }], "P10-02d a newer change made while it was failing is the one left waiting, not the older copy");
    const s5 = mk(); s5.schedule({ userId: "u", blob: { n: 6 } });
    const r5 = flush ? await flush(s5, async () => { throw new Error("network"); }) : null;
    t.eq(r5 && [r5.ok, s5.hasPending()], [false, true], "P10-02e a save that throws is a failure too, and is kept");
    for (const s of [s1, s2, s3, s4, s5]) s.discard();
    console.log = log;
    const invite = app.slice(app.indexOf("onInvite: async (email)=>{"), app.indexOf("onRevoke: async ()=>{"));
    t.ok(/const saved = await flushSaveNow\(\);\s*\n\s*if \(!saved\.ok\) return \{ error: "generic" \};/.test(invite) && invite.indexOf("flushSaveNow()") < invite.indexOf('callHousehold("create_invite"'),
      "P10-02f the invite stops there: the server is not asked to copy this account's data into a household until the save is confirmed");
    t.eq(HW.householdErrorLine("generic"), "Something went wrong and nothing changed. Please try again.", "P10-02g …and the person reads the approved line for it, which is true: nothing changed");
  }

  // ══ P10-08 ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    const waits = H.PERSONAL_RETRY_MS;
    t.ok(Array.isArray(waits) && waits.length >= 2 && waits.every((w, i) => w >= 1000 && (i === 0 || w > waits[i - 1])),
      "P10-08a a failed save of this person's own keys is tried again by itself, a few times, further apart each time");
    const save = app.slice(app.indexOf("const saveHousehold = async ({ userId, householdId, blob, personal }) => {"), app.indexOf("// The pending save, sent now and awaited"));
    t.ok(/if \(!mine\.ok\) \{ personalErr = mine\.error \|\| new Error\("personal_keys"\); retryPersonalKeysLater\(userId\); \}/.test(save),
      "P10-08b the app arranges that retry the moment the save of their own keys fails");
    t.ok(/else \{ personalRetryRef\.current\.n = 0;/.test(save), "P10-08c …and a save that works starts the count again");
    const later = app.slice(app.indexOf("const retryPersonalKeysLater = (userId) => {"), app.indexOf("const saveHousehold = async ({ userId, householdId, blob, personal }) => {"));
    t.ok(/PERSONAL_RETRY_MS\[/.test(later) && /getSaver\(\)\.schedule\(householdPayload\(latestStateRef\.current, userId\)\)/.test(later) && /if \(!householdRef\.current/.test(later),
      "P10-08d the retry is an ordinary save of what the app holds then (so the keys go only if they still differ), and never after leaving the household");
    t.ok(/A failure there is reported[\s\S]{0,200}never holds up the household's own save/.test(save), "P10-08e the household's own save is still never held up by it");
  }

  // ══ P9-03 and G6 ════════════════════════════════════════════════════════════════════════════════════════
  {
    const build = fn(DX, "buildExport"), stores = fn(DX, "readExportStores"), deliver = fn(DX, "deliverExport");
    const data = {
      profile: { name: "Sam" }, incomes: [{ amount: 2100 }], bills: [{ name: "Rent" }], debts: [], goals: [], budgets: { Dining: 200 }, accounts: [{ id: "a1" }], transactions: [{ id: "t1" }],
      forecastEdits: { skips: {} }, depositDecisions: { t1: { reason: "income" } }, depositRules: {},
      investments: [{ name: "Index fund", value: 100 }], liabilities: { credit: [{ account_id: "a1" }] }, debtLinkDismissed: ["d|a"], dashboardLayout: { hidden: ["x"] },
      meetingRecords: [{ id: "m1" }], bankConnected: true, incomeSuggestion: { amount: 1 }, demo: false,
    };
    const local = new FakeStorage({
      flourish_custom_cats: '["Pets"]', flourish_cat_overrides: '{"t1":"Dining"}', flourish_coach_history: '[{"q":"hi"}]',
      flourish_cat_merchant_overrides: '{"loblaws":"Groceries"}', flourish_nw_history: '[{"m":"2026-10","v":1}]', flourish_kids: '[{"id":"k1"}]', flourish_kid_k1_chores: '[{"c":1}]',
      flourish_streak: '{"n":3}', flourish_plaid_token_x: "SECRET", "sb-abc-auth-token": '{"access_token":"SECRET"}', flourish_uid: "u1",
    });
    const side = stores ? stores(local, { loanActivityKey: "flourish_loan_activity" }) : null;
    const out = build ? build(data, side, new Date("2026-11-22T12:00:00.000Z")) : null;
    t.eq(out && [out.profile, out.incomes, out.bills, out.budgets, out.accounts, out.transactions, out.forecastEdits, out.depositDecisions, out.customCategories, out.categoryOverrides, out.coachHistory],
      [data.profile, data.incomes, data.bills, data.budgets, data.accounts, data.transactions, data.forecastEdits, data.depositDecisions, ["Pets"], { t1: "Dining" }, [{ q: "hi" }]],
      "P9-03a everything the export held before is still there, under the same names");
    t.eq(out && [out.investments, out.liabilities], [data.investments, data.liabilities], "P9-03b the holdings and the loan and card details a bank sent are in it now");
    t.eq(out && [out.merchantCategoryRules, out.netWorthHistory, out.kids, out.streak], [{ loblaws: "Groceries" }, [{ m: "2026-10", v: 1 }], { flourish_kids: [{ id: "k1" }], flourish_kid_k1_chores: [{ c: 1 }] }, { n: 3 }],
      "P9-03c so are the stores kept beside it: the rules by merchant, the net-worth history, the kids' data, the streak");
    t.eq(out && out.more, { debtLinkDismissed: ["d|a"], dashboardLayout: { hidden: ["x"] }, meetingRecords: [{ id: "m1" }], bankConnected: true, incomeSuggestion: { amount: 1 } },
      "P9-03d and any other part of the household's data, whatever it is called, so a part added later cannot be left out");
    t.ok(!!out && !/SECRET/.test(JSON.stringify(out)) && !("flourish_uid" in (out.more || {})), "P9-03e no token and no sign-in session is ever in it");
    t.eq(out && [out._meta.schema, out._meta.exportedAt], [2, "2026-11-22T12:00:00.000Z"], "P9-03f the file says which layout it is (2)");
    const exp = app.slice(app.indexOf("const exportMyData = "), app.indexOf("const exportMyData = ") + 2600);
    t.ok(/buildExport\(data, readExportStores\(localStorage/.test(exp), "P9-03g the Settings button builds the file this way");

    // G6: where the file goes.
    const calls = [];
    const file = { json: '{"a":1}', filename: "flourish-export-2026-11-22.json" };
    const webDl = deliver ? await deliver(file, { platform: "web", download: (f) => { calls.push(["download", f.filename]); } }) : null;
    t.eq([webDl, calls], ["downloaded", [["download", "flourish-export-2026-11-22.json"]]], "G6a on the website: the file is downloaded, as before");
    calls.length = 0;
    const ios = deliver ? await deliver(file, { platform: "ios", download: () => calls.push(["download"]), shareFile: async (f) => { calls.push(["shareFile", f.filename, f.json]); }, shareText: async () => calls.push(["shareText"]) }) : null;
    t.eq([ios, calls], ["shared", [["shareFile", "flourish-export-2026-11-22.json", '{"a":1}']]], "G6b in a store app: the file goes to the system share sheet (Save to Files, Mail, …), never to a download link the WebView ignores");
    calls.length = 0;
    const android = deliver ? await deliver(file, { platform: "android", download: () => calls.push(["download"]), shareFile: null, shareText: async (p) => { calls.push(["shareText", p.text]); } }) : null;
    t.eq([android, calls], ["shared", [["shareText", '{"a":1}']]], "G6c a WebView that cannot share a file: the same JSON goes to the share sheet as text");
    calls.length = 0;
    const cancelled = deliver ? await deliver(file, { platform: "ios", shareFile: async () => { const e = new Error("Share canceled"); e.name = "AbortError"; throw e; }, shareText: async () => calls.push(["shareText"]) }) : null;
    t.eq([cancelled, calls], ["cancelled", []], "G6d closing the share sheet is not a failure, and nothing else opens");
    const big = { json: "x".repeat((DX && DX.SHARE_TEXT_LIMIT ? DX.SHARE_TEXT_LIMIT : 1) + 1), filename: "f.json" };
    const tooBig = deliver ? await deliver(big, { platform: "android", shareFile: null, shareText: async () => calls.push(["shareText"]) }) : null;
    t.eq([tooBig, calls], ["failed", []], "G6e too large to hand over as text, and no way to share a file: it says it failed (the app then shows its message) instead of doing nothing");
    calls.length = 0;
    const compact = deliver ? await deliver({ ...file, text: '{"a":1,"compact":true}' }, { platform: "android", shareFile: null, shareText: async (p) => { calls.push(p.text); } }) : null;
    t.eq([compact, calls], ["shared", ['{"a":1,"compact":true}']], "G6i as text it goes without the file's indenting, so more fits");
    const none = deliver ? await deliver(file, { platform: "ios", shareFile: async () => { throw new Error("NotAllowedError"); }, shareText: async () => { throw new Error("plugin missing"); } }) : null;
    t.eq(none, "failed", "G6f nothing worked: failed, never a silent nothing");
    t.ok(/deliverExport\(/.test(exp) && /=== "failed"\) alertModal\(\{message:"Could not export your data\. Please try again\."\}\)/.test(exp),
      "G6g the Settings button sends the file that way and shows its existing message when it could not");
    t.ok(!/WKDownloadDelegate|setDownloadListener/.test(read("ios", "App", "App", "MainViewController.swift") + read("ios", "App", "App", "AppDelegate.swift")),
      "G6h (why) the iPhone shell has no download handler, so a download link in its WebView goes nowhere");
  }

  // ══ P1-03 ═══════════════════════════════════════════════════════════════════════════════════════════════
  {
    // What stays today, and where: the stayer's phone removes the leaver's answers for the transactions it holds…
    const kept = H.localAfterRemoval({ catOverrides: { p1: "Dining", p2: "Fuel", m1: "Rent" }, depositDecisions: { p1: { reason: "income" }, p3: { reason: "gift" } }, loanActivity: [] }, { accountIds: ["a2"], transactionIds: ["p1"] });
    t.eq([kept.catOverrides, kept.depositDecisions], [{ p2: "Fuel", m1: "Rent" }, { p3: { reason: "gift" } }],
      "P1-03a the stayer's phone removes the leaver's corrections for transactions it holds; ones it never held (p2, p3) stay: a transaction id and a category, nothing shown");
    t.ok(/Category corrections and deposit answers keyed by a\s*\n-- bank transaction's id cannot be matched here \(the bank's transactions are never stored\)/.test(read("supabase", "migrations", "0031_couple_household_private.sql")),
      "P1-03b the database cannot do it: it never stores a bank's transactions, so it cannot tell whose a transaction id was");
    // …so the one who leaves, whose phone does hold them, takes them out first.
    const tidy = fn(H, "withoutOwnBankAnswers");
    const appData = { accounts: [{ id: "a1", _item: "i1" }, { id: "a2", _item: "i2" }, { id: "cash", institution: "Manual" }],
      transactions: [{ id: "p1", account_id: "a2" }, { id: "p2", account_id: "a2" }, { id: "q1", account_id: "a1" }, { id: "m1", account_id: "cash" }],
      depositDecisions: { p1: { reason: "income" }, q1: { reason: "gift" } }, bills: [{ name: "Rent" }] };
    const out = tidy ? tidy({ appData, catOverrides: { p1: "Dining", p2: "Fuel", q1: "Fuel", m1: "Rent" } }, ["i2"]) : null;
    t.eq(out && [out.removed, out.catOverrides, out.appData.depositDecisions], [3, { q1: "Fuel", m1: "Rent" }, { q1: { reason: "gift" } }],
      "P1-03c the leaver's phone takes out the corrections and deposit answers for the transactions on THEIR banks, and no one else's");
    t.eq(out && [out.appData.accounts.length, out.appData.transactions.length, out.appData.bills], [3, 4, [{ name: "Rent" }]], "P1-03d nothing else changes (the accounts themselves leave on the server, in the leave's own transaction)");
    const nothing = tidy ? tidy({ appData, catOverrides: { q1: "Fuel" } }, ["i9"]) : null;
    t.eq(nothing && [nothing.removed, nothing.appData === appData], [0, true], "P1-03e none of their banks here: nothing is touched");
    const leave = app.slice(app.indexOf("onLeave: async ()=>{"), app.indexOf("onRemove: async ()=>{"));
    t.ok(/const putBack = await takeOwnBankAnswers\(\);\s*\n\s*const r = await callHousehold\("leave"\);\s*\n\s*if \(r\.status !== 200\) \{ putBack\(\); return/.test(leave),
      "P1-03f the app does this before it asks the server to leave, and puts them back if the server refuses the leave");
    const take = app.slice(app.indexOf("const takeOwnBankAnswers = async () => {"), app.indexOf("const householdActions = {"));
    t.ok(/members\.length < 2\) return nothing;/.test(take) && /catch \{ \/\* the leave goes ahead/.test(take),
      "P1-03g only when someone stays behind (the last one out keeps everything), and a failure here never stops the leave");
  }

  // ══ P1-01 (NOT REAL: the rule) ══════════════════════════════════════════════════════════════════════════
  {
    const W = HW.HOUSEHOLD_WORDS;
    t.ok(/What's on your own account now is replaced by the household's, not combined with it\./.test(W.partnerConsentBody) && /leaving starts you fresh/.test(W.partnerConsentBody),
      "P1-01a before joining, the partner is told: their own data is replaced by the household's, and leaving starts them fresh");
    t.ok(/You'll lose access to the shared data right away and start fresh\./.test(W.leaveBody) && /start fresh/.test(W.removeBody),
      "P1-01b on Leave (and on Remove) the screen says it again before anything happens");
    t.eq(W.leaveBodyAlone, "Any open invite is cancelled. Your data stays with you.", "P1-01c the last one out keeps the data, and is told so");
    const spec = read("docs", "product", "COUPLE-MODE-SPEC.md");
    t.ok(/Their `user_data` and private rows are deleted and their phone is wiped, so they start fresh\./.test(spec) && /\*\*The partner's own data is replaced when they join, not merged\.\*\*/.test(spec),
      "P1-01d the spec says the same: it is the rule, not an accident");
    const sql = read("supabase", "migrations", "0041_leave_keeps_meetings.sql");
    const leaveFn = sql.slice(sql.indexOf("create or replace function public.household_leave_locked"), sql.indexOf("end; $$;", sql.indexOf("create or replace function public.household_leave_locked")));
    t.ok(/if others > 0 then[\s\S]*delete from public\.user_data where user_id = p_user;[\s\S]*else[\s\S]*insert into public\.user_data[\s\S]*from public\.household_data d where d\.household_id = p_household/.test(leaveFn),
      "P1-01e the function does exactly that: fresh when someone stays, the household's data back to their own row when nobody does");
    t.ok(/delete from public\.user_data where user_id = p_user;/.test(read("supabase", "migrations", "0031_couple_household_private.sql").split("create or replace function public.household_accept_invite")[1] || ""),
      "P1-01f there is no earlier copy to restore: the partner's own row already went when they joined, as the consent screen said");
  }

  // ══ P4-03 and G14 (NOT REAL: nothing is kept there) ═════════════════════════════════════════════════════
  {
    const pkg = read("package.json");
    const libs = fs.readdirSync(path.join(REPO, "src", "lib")).filter((f) => f.endsWith(".js") && f !== "accountWipe.js").map((f) => read("src", "lib", f)).join("\n");
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    t.ok(!/indexedDB|caches\.open\(/.test(strip(app)) && !/indexedDB/.test(strip(libs)) && !/indexedDB/.test(strip(read("src", "main.jsx"))),
      "P4-03a no code of flourish's opens an IndexedDB database: there is no private cache of ours for a blocked or timed-out delete to leave behind");
    t.ok(!/"idb"|"idb-keyval"|localforage|dexie|@capacitor\/preferences|@capacitor\/filesystem/.test(pkg), "P4-03b and no library that keeps one is installed");
    t.ok(!/OfflineTransport|makeBrowserOffline/.test(strip(libs + app)), "P4-03c the error reporter is not set to queue reports in IndexedDB either");
    const W = await import("../src/lib/accountWipe.js");
    const local = new FakeStorage({ flourish_v1: "{}", flourish_uid: "u1", flourish_nw_history: "[]", other: "x" });
    const session = new FakeStorage({ flourish_household_invite: "t" });
    const out = await W.wipeDeletedAccount({ local, session, idb: {}, now: 1763000000000 });   // a browser with no indexedDB.databases()
    t.eq([out.local, out.session, out.databases, [...local.m.keys()].sort()], [3, 1, 0, [W.DELETED_MARK, "other"]],
      "G14a in a browser without indexedDB.databases(): everything of ours still goes, because all of it is in localStorage and sessionStorage");
  }

  // ══ P5-07 (NOT REAL: the original times are kept) ═══════════════════════════════════════════════════════
  {
    const USER = "u-consent";
    const storage = new FakeStorage();
    const tap = Date.parse("2026-11-20T09:00:00.000Z");
    LC.markConsentShown(USER, tap - 30000);
    const offline = async () => { throw new Error("offline"); };
    t.eq(await LC.recordLegalConsent({ uid: USER, storage, now: tap, getJwt: async () => "jwt", fetchImpl: offline }), "kept", "P5-07a agreed with no connection: kept on the device");
    const sent = [];
    const online = async (url, init) => { if (init && init.body) sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; };
    t.eq(await LC.flushLegalConsent({ uid: USER, storage, getJwt: async () => "jwt", fetchImpl: online }), "recorded", "P5-07b two days later it is sent");
    t.eq(sent.length && [sent[0].agreed_at, sent[0].shown_at], ["2026-11-20T09:00:00.000Z", "2026-11-20T08:59:30.000Z"], "P5-07c with the time Get started was tapped and the time the step was shown, not the time it was sent");
    const { consentRow } = require("../netlify/functions/_lib/legalConsent.js");
    const row = consentRow(USER, sent[0], "ios", tap + 2 * 86400000).row;
    t.eq(row && [row.recorded_at, row.shown_at], ["2026-11-20T09:00:00.000Z", "2026-11-20T08:59:30.000Z"], "P5-07d and the server writes those down, not its own clock");
    t.eq(row && [row.terms_version, row.privacy_version], [sent[0].terms_version, sent[0].privacy_version], "P5-07e with the page dates kept on the device at that first try");
  }

  // ══ P1-07 (REAL, low, waits) ════════════════════════════════════════════════════════════════════════════
  {
    const redeem = read("public", "gift", "redeem.js");
    t.ok(/try \{ if \(s\) localStorage\.removeItem\(s\.key\); \} catch/.test(redeem) && !/createClient|\/auth\/v1\/logout/.test(redeem),
      "P1-07a the gift page has no Supabase client or key: 'Use another account' removes this browser's only copy of the session");
    t.ok(/if \(\(localUid && localUid !== user\.id\) \|\| ownerlessRefused\) \{[\s\S]{0,200}clearAllUserLocal\(\);/.test(app),
      "P1-07b and the next sign-in as someone else clears the first account's data from this browser, as on any shared device");
  }

  t.summary("review1122Data.test");
})();
