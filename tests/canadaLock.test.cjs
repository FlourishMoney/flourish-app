// tests/canadaLock.test.cjs
// -----------------------------------------------------------------------------
// FLOURISH IS CANADA ONLY (2026-11-25). A separate US app will be built later from this code under its own name,
// so the US code paths stay, behind one build-time setting, APP_REGION. flourish builds with APP_REGION unset,
// which is "CA": the country is always Canada, the currency CAD and Plaid's country_codes ["CA"], and no device,
// language, time zone or store signal can switch it. Before this, onboarding took the country from the device
// (src/lib/deviceCountry.js), so a US time zone or an en-US language made the household "US" inside flourish.
//   1  the setting: one normaliser, "CA" unless it is exactly "US", read by the Vite build from APP_REGION
//   2  a US language, a US time zone and a US store country all still give Canada, CAD and Plaid ["CA"]
//   3  a profile saved as "US" (by the old device rule or the Settings picker) loads as Canada
//   4  APP_REGION="US" keeps today's US behaviour for the future US app
//   5  the server holds the same rule as the app (Plaid's country is decided on the server too)
//   6  App.jsx asks the lock at every place the country is chosen
// Synthetic data only; nothing leaves the machine.
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");
const { create } = require("./_runner.cjs");

const REPO = path.join(__dirname, "..");

(async () => {
  const t = create();
  const R = await import("../src/lib/appRegion.js");
  const D = await import("../src/lib/deviceCountry.js");
  const F = await import("../src/lib/financialCalculations.js");
  const S = require("../netlify/functions/_lib/appRegion.js");

  // ── 1. The setting ─────────────────────────────────────────────────────────────────────────────
  t.eq(R.APP_REGION, "CA", "1a with APP_REGION unset (flourish's build) the region is Canada");
  t.eq([undefined, null, "", "CA", "ca", " CA ", "GB", "usa", "U.S.", "US", "us", " US "].map(R.normalizeRegion),
    ["CA", "CA", "CA", "CA", "CA", "CA", "CA", "CA", "CA", "US", "US", "US"], "1b only an exact US (any case, trimmed) is the US region; anything else is Canada");
  {
    const saved = process.env.APP_REGION;
    try {
      delete process.env.APP_REGION;
      const ca = (await import(path.join(REPO, "vite.config.js") + "?region=unset")).default;
      process.env.APP_REGION = "US";
      const us = (await import(path.join(REPO, "vite.config.js") + "?region=us")).default;
      process.env.APP_REGION = "mexico";
      const junk = (await import(path.join(REPO, "vite.config.js") + "?region=junk")).default;
      t.eq([ca.define["import.meta.env.APP_REGION"], us.define["import.meta.env.APP_REGION"], junk.define["import.meta.env.APP_REGION"]],
        ['"CA"', '"US"', '"CA"'], "1c the Vite build bakes APP_REGION in: unset is CA, US is US, anything else CA");
    } catch (e) {
      t.ok(false, `1c vite.config.js loads and defines import.meta.env.APP_REGION: ${e && e.message}`);
    } finally {
      if (saved === undefined) delete process.env.APP_REGION; else process.env.APP_REGION = saved;
    }
  }

  // ── 2. US signals all give Canada, CAD, Plaid ["CA"] ──────────────────────────────────────────────
  // Each signal is first shown to be live (the raw device rule still answers US for it), so the lock is what
  // turns it into Canada, not a signal that never fired.
  const signals = [
    ["a US device language (en-US, no Canadian time zone)", D.deviceCountry({ languages: ["en-US"], timeZone: "Europe/London" })],
    ["a US time zone (America/New_York, even with en-CA)", D.deviceCountry({ languages: ["en-CA"], timeZone: "America/New_York" })],
    ["both at once (en-US in America/Los_Angeles)", D.deviceCountry({ languages: ["en-US"], timeZone: "America/Los_Angeles" })],
    ["a US store country (StoreKit/Play give US or USA)", "US"],
    ["a US store country as ISO alpha-3", "USA"],
    ["a lower-case us", "us"],
  ];
  t.eq(signals.slice(0, 3).map(([, raw]) => raw), ["US", "US", "US"], "2a the device rule itself still reads those devices as US (the signal is live)");
  for (const [what, raw] of signals) {
    const country = R.appCountry(raw);
    t.eq(country, "CA", `2b ${what}: the country is Canada`);
    t.eq(F.baseCurrencyOf({ profile: { country } }), "CAD", `2c ${what}: the currency is CAD`);
    t.eq(R.plaidCountryCodes(raw), ["CA"], `2d ${what}: Plaid is asked for ["CA"] only`);
    t.eq(S.plaidCountryCodes(raw), ["CA"], `2e ${what}: the server asks Plaid for ["CA"] only`);
  }
  t.eq([R.appCountry("CA"), R.appCountry(undefined), R.appCountry(""), R.appCountry("GB")], ["CA", "CA", "CA", "CA"], "2f Canada, nothing and anything else are Canada too");

  // ── 3. A profile saved as US loads as Canada ───────────────────────────────────────────────────────
  {
    const usSaved = { profile: { name: "Sam", country: "US", province: "OH", creditScore: 720 }, incomes: [{ id: "i1", amount: 2100 }] };
    const locked = R.lockCountry(usSaved);
    t.eq([locked.profile.country, locked.profile.province, locked.profile.name, locked.profile.creditScore, locked.incomes],
      ["CA", "", "Sam", 720, usSaved.incomes], "3a a saved US profile loads as Canada; its US state is unset (no province shown as picked), everything else kept");
    t.eq(F.baseCurrencyOf(locked), "CAD", "3b …and its currency is CAD");
    t.eq(usSaved.profile.country, "US", "3c the saved object itself is not changed in place");
    const caSaved = { profile: { country: "CA", province: "ON" } };
    t.ok(R.lockCountry(caSaved) === caSaved, "3d a Canadian profile is returned as it is (the same object, so nothing re-renders or re-saves)");
    t.eq(R.lockCountry({ profile: { country: "us", province: "TX" } }).profile, { country: "CA", province: "" }, "3e lower-case us likewise");
    t.eq(R.lockCountry({ profile: { country: "CA", province: "QC" }, demo: true }).profile.province, "QC", "3f a Canadian province is kept");
    t.eq([R.lockCountry(null), R.lockCountry(undefined)], [null, undefined], "3g no data: nothing to lock");
    t.ok(R.lockCountry({ incomes: [] }).profile === undefined, "3h no profile yet: left alone");

    // The household's own currency is CAD even when USD was saved; a bank account Plaid reports in USD stays USD
    // (Canadians hold US-dollar accounts), and an account with no stated currency counts as the household's own.
    const usd = { id: "a1", type: "checking", balance: "500", currency: "USD" };
    const unstamped = { id: "a2", type: "checking", balance: "900" };
    for (const [what, profile] of [["a Canadian profile saved with baseCurrency USD", { country: "CA", province: "ON", baseCurrency: "USD" }],
      ["a US profile saved with baseCurrency USD", { country: "US", province: "OH", baseCurrency: "USD" }],
      ["a lower-case usd", { country: "CA", baseCurrency: "usd" }]]) {
      const saved = { profile, accounts: [usd, unstamped] };
      const l = R.lockCountry(saved);
      t.eq([l.profile.country, l.profile.baseCurrency, F.baseCurrencyOf(l)], ["CA", "CAD", "CAD"], `3i ${what}: loads as Canada, base currency CAD`);
      t.ok(l.accounts[0] === usd && l.accounts[0].currency === "USD", `3j ${what}: its USD bank account is left as USD (the same object)`);
      // Review round 1 (MUST 1): the unstamped account was read as the old base, USD, so it keeps USD (section 7);
      // round 1 let it become CAD, which silently counted US dollars as Canadian ones.
      t.eq([F.accountCurrencyOf(l.accounts[0], l), F.isBaseCurrencyAccount(l.accounts[0], l), F.accountCurrencyOf(l.accounts[1], l), F.isBaseCurrencyAccount(l.accounts[1], l)], ["USD", false, "USD", false],
        `3k ${what}: the USD account is read as USD (held apart from CAD), and so is the unstamped one, which was USD before the lock`);
      t.eq(saved.profile.baseCurrency, profile.baseCurrency, `3l ${what}: the saved object is not changed in place`);
    }
    const cad = { profile: { country: "CA", baseCurrency: "CAD" } };
    t.ok(R.lockCountry(cad) === cad, "3m a profile already in CAD is returned as it is");
    t.ok(R.lockCountry({ profile: { country: "US", baseCurrency: "USD" } }, "US").profile.baseCurrency === "USD", "3n APP_REGION=US: a saved USD base is left as it is");
  }

  // ── 4. APP_REGION="US" keeps today's behaviour, for the future US app ───────────────────────────────
  t.eq([R.appCountry("US", "US"), R.appCountry("us", "US"), R.appCountry("CA", "US"), R.appCountry(undefined, "US")], ["US", "US", "CA", "CA"],
    "4a in the US region the country passes through as today (US is US, anything else Canada)");
  t.eq([R.plaidCountryCodes("US", "US"), R.plaidCountryCodes("CA", "US")], [["US"], ["CA"]], "4b …and Plaid is asked for that country");
  t.eq(F.baseCurrencyOf({ profile: { country: R.appCountry("US", "US") } }), "USD", "4c …and a US household's currency is USD");
  {
    const usSaved = { profile: { country: "US", province: "OH" } };
    t.ok(R.lockCountry(usSaved, "US") === usSaved, "4d …and a saved US profile is left as it is");
  }

  // ── 5. The server holds the same rule ──────────────────────────────────────────────────────────────
  {
    const inputs = [undefined, null, "", "CA", "ca", "US", "us", "USA", "GB"];
    const regions = [undefined, "", "CA", "US", "us", "junk"];
    const client = regions.map((rg) => inputs.map((c) => R.appCountry(c, R.normalizeRegion(rg))));
    const server = regions.map((rg) => inputs.map((c) => S.appCountry(c, S.normalizeRegion(rg))));
    t.eq(server, client, "5a the server's appCountry answers as the app's for every country and region");
    const saved = process.env.APP_REGION;
    try {
      delete process.env.APP_REGION;
      t.eq([S.appRegion(), S.plaidCountryCodes("US")], ["CA", ["CA"]], "5b the server with APP_REGION unset: Canada");
      process.env.APP_REGION = "US";
      t.eq([S.appRegion(), S.plaidCountryCodes("US"), S.plaidCountryCodes("CA")], ["US", ["US"], ["CA"]], "5c the server with APP_REGION=US: today's US behaviour");
    } finally {
      if (saved === undefined) delete process.env.APP_REGION; else process.env.APP_REGION = saved;
    }
    const plaid = fs.readFileSync(path.join(REPO, "netlify", "functions", "plaid.js"), "utf8");
    t.ok(/const COUNTRY_CODES = plaidCountryCodes\(body\.country\);/.test(plaid) && !/body\.country === "US"/.test(plaid),
      "5d plaid.js takes its country list from the lock, not straight from what the app sent");
  }

  // ── 6. App.jsx asks the lock wherever the country is chosen ───────────────────────────────────────
  {
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    t.ok(/import \{[^}]*\bappCountry\b[^}]*\blockCountry\b[^}]*\} from "\.\/lib\/appRegion\.js";/.test(app), "6a App.jsx imports appCountry and lockCountry");
    t.ok(/const \[p,setP\]=useState\(\(\)=>\{ const country=appCountry\(deviceCountry\(\)\);/.test(app), "6b onboarding starts from the device's country through the lock");
    t.ok(/const newCountry = appCountry\(e\.target\.value\);/.test(app), "6c the Settings country picker goes through the lock");
    t.ok(/const \[appData,setAppData\]=useState\(\(\)=>lockCountry\(moveSavedLoanActivity\(saved\)\?\.appData\|\|null\)\);/.test(app), "6d data saved on this device loads through the lock");
    t.ok(/setAppData\(\(prev\) => lockCountry\(keepSynced \? keepSyncedTransactions\(c\.appData, prev\) : c\.appData\)\)/.test(app), "6e a row from the server (and a shared household's) loads through the lock");
    t.ok(/function buildDemoState\(country = "CA"\) \{\n  const cc = appCountry\(/.test(app), "6f the demo household goes through the lock");
    // No other place writes profile.country: every other mention reads it (an extra writer would bypass the lock).
    const writes = (app.match(/country\s*:\s*(?!"CA")[A-Za-z_$][\w$.]*/g) || []).filter((w) => !/country:\s*(country|newCountry|p\.country|cc|"CA")\b/.test(w));
    t.eq(writes, [], "6g no other code sets a profile's country");
  }

  // The bundled app (esbuild, as the browser gets it): the demo household follows the region.
  {
    const { loadApp } = require("./_renderApp.cjs");
    try {
      const ca = loadApp(["buildDemoState"]).buildDemoState("US");
      t.eq([ca.profile.country, F.baseCurrencyOf(ca), [...new Set(ca.accounts.map((a) => a.currency || "CAD"))]], ["CA", "CAD", ["CAD"]],
        "6h asked for the US demo, flourish loads the Canadian household, in CAD");
      const us = loadApp(["buildDemoState"], { env: { APP_REGION: "US" } }).buildDemoState("US");
      t.eq([us.profile.country, F.baseCurrencyOf(us)], ["US", "USD"], "6i a build with APP_REGION=US still loads the US household");
    } catch (e) {
      t.ok(false, `6h App.jsx bundles: ${e && e.message}`);
    }
  }

  // ── 7. Accounts with no stated currency keep the household's OLD currency (review round 1, MUST 1) ─────
  // accountCurrencyOf gives an account with no currency the household's base. A household that was US had base
  // USD, so its unstamped accounts were USD; when the lock makes the base CAD they must not quietly become CAD.
  // Every account list the currency code reads is data.accounts (bank, manual balances, statement imports).
  {
    const { SafeSpendEngine } = await import("../src/lib/safeSpendEngine.js");
    const hh = (profile, accounts) => ({ profile, accounts, bills: [], debts: [], incomes: [], transactions: [], goals: [] });
    const usAccounts = () => [
      { id: "c1", name: "Checking ••1111", type: "checking", balance: 1200, institution: "Chase" },              // bank, no currency stated
      { id: "m1", name: "Checking", type: "checking", balance: 300, institution: "Manual", currency: null },   // manual balance, null
      { id: "st", name: "Statement", type: "checking", balance: 50, institution: "Statement", currency: "" },  // statement import, blank
      { id: "s1", name: "Savings ••2222", type: "savings", balance: 4000, institution: "Chase", currency: "USD" }, // already stamped
      { id: "e1", name: "Euro account", type: "checking", balance: 10, institution: "N26", currency: "EUR" },
    ];
    for (const [what, profile] of [["a US household (base USD by country)", { country: "US", province: "OH" }],
      ["a Canadian profile saved with baseCurrency USD", { country: "CA", province: "ON", baseCurrency: "USD" }],
      ["a US household saved with baseCurrency \" usd \"", { country: "US", baseCurrency: " usd " }]]) {
      const before = hh(profile, usAccounts());
      t.eq(F.baseCurrencyOf(before).trim(), "USD", `7a ${what}: before the lock its base is USD`);
      const l = R.lockCountry(before);
      t.eq(l.accounts.map((a) => a.currency), ["USD", "USD", "USD", "USD", "EUR"], `7b ${what}: every account with no currency is stamped with the old base, USD; stated ones are kept`);
      t.ok(l.accounts[3] === before.accounts[3] && l.accounts[4] === before.accounts[4], `7c ${what}: an account that already states its currency is the same object`);
      t.eq(before.accounts.map((a) => a.currency), [undefined, null, "", "USD", "EUR"].map((c) => c === undefined ? undefined : c), `7d ${what}: the saved accounts are not changed in place`);
      t.eq([F.baseCurrencyOf(l), l.accounts.filter((a) => F.isBaseCurrencyAccount(a, l)).length], ["CAD", 0], `7e ${what}: base CAD, and none of its accounts counts as CAD`);
      const ss = SafeSpendEngine.calculate(l);
      t.eq([ss.balance, ss.mixedCurrencyDetected, ss.excludedForeignCash], [0, true, 5560], `7f ${what}: safe to spend leaves the US$ cash out and says it is held in another currency`);
      const nw = F.FinancialCalcEngine.netWorth(l);
      t.eq([nw.mixedCurrencyDetected, F.netWorthRows(l).total], [true, 0], `7g ${what}: net worth leaves them out too, with the other-currency notice`);
    }
    // The notice a person sees: Goals > Net worth, rendered from App.jsx.
    try {
      const { loadApp, textOf } = require("./_renderApp.cjs");
      const A = loadApp(["Goals"]);
      const l = R.lockCountry(hh({ country: "US", province: "OH" }, usAccounts().slice(0, 3)));   // only accounts that state no currency
      const words = textOf(A.render(A.h(A.Goals, { data: l, initialTab: "worth", setAppData: () => {}, setScreen: () => {} })));
      t.ok(words.includes("Your USD account(s) are excluded from these totals (CAD only)."), "7h Net worth shows the existing notice: \"Your USD account(s) are excluded from these totals (CAD only).\"");
    } catch (e) { t.ok(false, `7h Goals renders: ${e && e.message}`); }
    const usd = hh({ country: "US" }, usAccounts());
    t.eq(R.lockCountry({ ...usd, profile: { country: "US", baseCurrency: "CAD" } }).accounts.map((a) => a.currency), [undefined, null, "", "USD", "EUR"],
      "7i a US profile whose base was already CAD: nothing to stamp (its unstamped accounts were CAD before and after)");
    const ca = hh({ country: "CA", province: "ON" }, [{ id: "c1", type: "checking", balance: 900 }]);
    t.ok(R.lockCountry(ca) === ca, "7j a Canadian household with unstamped accounts is returned as the same object");
    t.ok(R.lockCountry(usd, "US") === usd, "7k APP_REGION=US: nothing is stamped");
    t.eq(R.lockCountry({ profile: { country: "US" } }).profile.country, "CA", "7l a household with no account list still locks");

    // Review round 2 (MUST 1): the old base is exactly what the app read (baseCurrencyOf), not the lock's own
    // reading of the country. baseCurrencyOf checks country === "US" exactly, so a saved "us", " us " or "Us" was
    // CAD to the app: its unstamped accounts were counted as CAD and must not be stamped USD (and drop out).
    for (const country of ["us", " us ", "Us"]) {
      const before = hh({ country, province: "OH" }, usAccounts());
      t.eq(F.baseCurrencyOf(before), "CAD", `7m country ${JSON.stringify(country)}: the app read this household's base as CAD`);
      const l = R.lockCountry(before);
      t.eq(l.accounts.map((a) => a.currency), [undefined, null, "", "USD", "EUR"], `7n country ${JSON.stringify(country)}: so nothing is stamped (the lock stamps exactly what the app read)`);
      t.eq(SafeSpendEngine.calculate(l).balance, SafeSpendEngine.calculate(before).balance, `7o country ${JSON.stringify(country)}: safe to spend counts the same cash before and after the lock`);
    }
    // The rule in one line: the lock never changes the currency any account is read in.
    const cases = [{ country: "US" }, { country: "us" }, { country: " us " }, { country: "Us" }, { country: "CA", baseCurrency: " usd " }, { country: "us", baseCurrency: "USD" },
      { country: "US", baseCurrency: "CAD" }, { country: "US", baseCurrency: " cad " }, { country: "CA", baseCurrency: "EUR" }, { country: undefined }, { country: "GB" }, { country: "CA" }];
    for (const profile of cases) {
      const before = hh(profile, usAccounts());
      const l = R.lockCountry(before);
      t.eq(l.accounts.map((a) => F.accountCurrencyOf(a, l).trim()), before.accounts.map((a) => F.accountCurrencyOf(a, before).trim()),
        `7p ${JSON.stringify(profile)}: every account is read in the same currency before and after the lock`);
    }
  }

  // ── 8. baseCurrency is written back as exactly "CAD" (review round 1, MUST 3) ───────────────────────────
  {
    for (const saved of [" cad ", " CAD ", "cad", "Cad", "CAD\n"]) {
      const l = R.lockCountry({ profile: { country: "CA", province: "ON", baseCurrency: saved }, accounts: [{ id: "c1", type: "checking", balance: 5 }, { id: "c2", type: "checking", balance: 7, currency: "CAD" }] });
      t.eq([l.profile.baseCurrency, l.profile.province, F.baseCurrencyOf(l), l.accounts.filter((a) => F.isBaseCurrencyAccount(a, l)).length], ["CAD", "ON", "CAD", 2],
        `8a a saved ${JSON.stringify(saved)} is written back as exactly "CAD", the province kept, both CAD accounts counted`);
      t.eq(l.accounts[0].currency, undefined, `8b ${JSON.stringify(saved)} was CAD already, so an unstamped account is not stamped`);
    }
    const exact = { profile: { country: "CA", baseCurrency: "CAD" } };
    t.ok(R.lockCountry(exact) === exact, "8c exactly \"CAD\" is left as it is");
  }

  // ── 9. The Settings country picker (review round 1, MUST 2) ──────────────────────────────────────────
  {
    const { loadApp } = require("./_renderApp.cjs");
    const props = (profile) => ({ sectionKey: "profile", data: { profile, incomes: [], accounts: [] }, setAppData: () => {}, color: "#00CC85" });
    const countrySelect = (html) => (html.match(/<select[^>]*aria-label="Country"[^>]*>([\s\S]*?)<\/select>/) || [])[1] || "";
    try {
      const A = loadApp(["SettingsSectionContent"]);
      const opts = countrySelect(A.render(A.h(A.SettingsSectionContent, props({ name: "Sam", country: "CA", province: "ON" }))));
      t.ok(/value="CA"/.test(opts) && /Canada/.test(opts) && !/value="US"/.test(opts) && !/United States/.test(opts), "9a flourish's Settings lists Canada only");
    } catch (e) { t.ok(false, `9a Settings renders: ${e && e.message}`); }
    try {
      const U = loadApp(["SettingsSectionContent"], { env: { APP_REGION: "US" } });
      const opts = countrySelect(U.render(U.h(U.SettingsSectionContent, props({ name: "Sam", country: "US", province: "OH" }))));
      t.ok(/value="CA"/.test(opts) && /value="US"/.test(opts) && /United States/.test(opts), "9b a build with APP_REGION=US still offers the United States");
    } catch (e) { t.ok(false, `9b Settings renders (APP_REGION=US): ${e && e.message}`); }
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const from = app.indexOf("const newCountry = appCountry(e.target.value);");
    const upd = app.indexOf("profile:{...prev.profile, country:newCountry", from);
    const between = from >= 0 && upd > from ? app.slice(from, upd) : "";
    t.ok(/if \(newCountry !== e\.target\.value\) \{ e\.target\.value = newCountry; return; \}/.test(between) && !/setAppData/.test(between.split("return;")[0]),
      "9c a refused country returns before any update: the picker is put back and nothing is saved (province kept)");
    t.ok(/\{APP_REGION === "US" && <option value="US">🇺🇸 United States<\/option>\}/.test(app), "9d the United States option is there only in an APP_REGION=US build");
  }

  // ── 10. flourish's own configuration never sets another region (review round 1, SHOULD 5) ─────────────
  // The app's region is baked in at build and the server's read at run time, both from APP_REGION. A committed
  // netlify.toml or env file that set it to anything but CA would move flourish (or only half of it) off Canada.
  {
    const settings = (text) => [...String(text).matchAll(/^\s*(?:export\s+)?APP_REGION\s*[=:]\s*["']?([^"'\s#]*)["']?/gm)].map((m) => m[1]);
    t.eq([settings('[build.environment]\n  APP_REGION = "US"\n'), settings("APP_REGION=us\n"), settings('[context.production.environment]\n  APP_REGION = "CA"  # flourish\n'),
      settings("export APP_REGION='CA'\n"), settings("# APP_REGION=US\nOTHER=1\n")], [["US"], ["us"], ["CA"], ["CA"], []],
    "10a the check reads APP_REGION from netlify.toml and env-file lines (and not from comments)");
    let tracked = [];
    try { tracked = require("child_process").execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = []; }
    if (!tracked.length) tracked = ["netlify.toml", ...fs.readdirSync(REPO).filter((f) => /^\.env/.test(f))];
    const configFiles = tracked.filter((f) => /(^|\/)netlify\.toml$/.test(f) || /(^|\/)\.env(\.[\w.-]+)?$/.test(f) || /\.env$/.test(f));
    t.ok(configFiles.includes("netlify.toml"), `10b the committed configuration files are found (${configFiles.join(", ")})`);
    const wrong = configFiles.flatMap((f) => settings(fs.readFileSync(path.join(REPO, f), "utf8")).filter((v) => v.trim().toUpperCase() !== "CA").map((v) => `${f}: APP_REGION=${v}`));
    t.eq(wrong, [], "10c no committed netlify.toml or env file sets APP_REGION to anything but CA");
  }

  t.summary("canadaLock.test");
})();
