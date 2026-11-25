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
      t.ok(l.accounts === saved.accounts && l.accounts[0].currency === "USD", `3j ${what}: its USD bank account is left as USD`);
      t.eq([F.accountCurrencyOf(l.accounts[0], l), F.isBaseCurrencyAccount(l.accounts[0], l), F.accountCurrencyOf(l.accounts[1], l)], ["USD", false, "CAD"],
        `3k ${what}: the USD account is read as USD (held apart from CAD), an unstamped one as CAD`);
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

  t.summary("canadaLock.test");
})();
