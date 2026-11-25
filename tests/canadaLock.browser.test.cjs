// tests/canadaLock.browser.test.cjs
// -----------------------------------------------------------------------------
// THE CANADA LOCK IN A REAL BROWSER (PR #161, review round 1). flourish's own build (APP_REGION unset), signed in,
// against a local stand-in for Supabase that keeps a user_data row and a shared household the way migrations
// 0030/0031 do:
//   1  a US household saved on THIS DEVICE (flourish_v1) loads as Canada: country CA, its US state unset, base CAD,
//      and its accounts with no stated currency keep USD (held apart from CAD, with the existing notice)
//   2  a US household's row from the SERVER (user_data) loads the same way, and what the app saves back is Canadian
//   3  a SHARED household from the server (household_data) loads the same way
//   4  Settings: Country lists Canada only; a refused country forced into the picker changes nothing (no save,
//      the province kept)
// Synthetic data only; nothing reaches a real server.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

// A household's blob, as the app saves it. US: Ohio, a bank checking account and a manual balance with no stated
// currency (they were USD), and a savings account Plaid stamped USD.
function blob(profile, accounts) {
  const b = MOCK.emptyBlob();
  b.core.appData = { ...b.core.appData, profile, accounts, bankConnected: false,
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-12-04", type: "employment" }] };
  return b;
}
const US_ACCOUNTS = [
  { id: "c1", name: "Everyday checking", type: "checking", balance: 1200, institution: "Manual" },
  { id: "c2", name: "Joint checking", type: "checking", balance: 300, institution: "Manual", currency: null },
  { id: "s1", name: "Savings", type: "savings", balance: 4000, institution: "Manual", currency: "USD" },
];
const usBlob = () => blob({ name: "Sam", country: "US", province: "OH", baseCurrency: "USD" }, US_ACCOUNTS.map((a) => ({ ...a })));
const caBlob = () => blob({ name: "Sam", country: "CA", province: "ON" }, [{ id: "c1", name: "Chequing", type: "checking", balance: 2500, institution: "Manual" }]);

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("CANADA LOCK (browser)"); return; }
  let S;
  const reset = (over = {}) => { S = { userData: null, membership: null, household: null, writes: [], patches: [], ...over }; };
  reset();
  let dist = null;
  const body = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => { try { ok(JSON.parse(d || "{}")); } catch { ok({}); } }); });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const json = (status, b) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(b === undefined ? "" : JSON.stringify(b)); };
    const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
    const rows = (list) => (wantsObject ? (list.length ? json(200, list[0]) : json(406, { code: "PGRST116", message: "no rows" })) : json(200, list));
    if (p === "/rest/v1/user_data") {
      if (req.method === "GET") return rows(S.userData ? [{ data: S.userData, updated_at: "2026-11-25T09:00:00.000Z" }] : []);
      const b = await body(req); S.writes.push(Array.isArray(b) ? b[0] : b); return json(201, []);
    }
    if (p === "/rest/v1/household_members") return rows(S.membership ? [S.membership] : []);
    if (p === "/rest/v1/household_member_private") return req.method === "GET" ? rows([]) : json(201, []);
    if (p === "/rest/v1/household_data") {
      if (req.method === "GET") return rows(S.membership && S.household ? [{ data: S.household.data, updated_at: S.household.updated_at, version: S.household.version }] : []);
      if (req.method === "PATCH") {
        const b = await body(req); S.patches.push(b.data);
        S.household = { data: b.data, version: S.household.version + 1, updated_at: new Date().toISOString() };
        return json(200, [{ version: S.household.version, updated_at: S.household.updated_at }]);
      }
    }
    if (p === "/api/household") {
      await body(req);
      if (!S.membership) return json(200, { enabled: true, household: null });
      return json(200, { enabled: true, household: { role: S.membership.role, members: [{ role: S.membership.role, you: true, joined_at: "2026-11-01T10:00:00Z" }], invite: null, billing: { covered: false, paid_by: null, your_extra: null } } });
    }
    if (p === "/api/billing") return json(404, {});
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("canada-lock");
  const env = { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" };
  delete env.APP_REGION;   // flourish's own build
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], { cwd: ROOT, stdio: "inherit", env });
  const browser = await playwright.chromium.launch();
  // A US phone (en-US, New York), so nothing on the device itself argues for Canada.
  const open = async ({ deviceSave = null, householdStamp = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US", timezoneId: "America/New_York" });
    await ctx.addInitScript(([key, session, save, stamp]) => { try {
      if (!sessionStorage.getItem("__seeded")) {
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem(key, session);
        localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1");
        localStorage.setItem("flourish_ai_disclosure_seen", "1");
        if (save) localStorage.setItem("flourish_v1", save);
        if (stamp) localStorage.setItem("flourish_household", stamp);
      }
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession()), deviceSave, householdStamp]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    return { ctx, page };
  };
  const ready = (page) => page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
  const local = async (page) => { try { return JSON.parse(await page.evaluate(() => localStorage.getItem("flourish_v1") || "null")); } catch { return null; } };
  const settled = (page) => page.waitForTimeout(3500);   // past the debounced save
  const profileSettings = async (page) => {
    await page.getByRole("button", { name: /settings/i }).first().click();
    await page.getByText("Profile & Income", { exact: true }).first().click();
    await page.locator('select[aria-label="Country"]').waitFor();
  };
  // What a US household must look like once loaded: Canada, no state, base CAD, its dollars still US dollars.
  const lockedUS = (appData) => {
    const p = (appData && appData.profile) || {};
    const cur = ((appData && appData.accounts) || []).map((a) => a.currency);
    return [p.country, p.province, p.baseCurrency, cur];
  };
  const LOCKED_US = ["CA", "", "CAD", ["USD", "USD", "USD"]];
  // A real save (review round 2): change the household's name in Settings, so the app must save, and the payload
  // that carries the new name is the one checked (an empty list of saves can no longer pass).
  const saveAName = async (page, name) => {
    await profileSettings(page);
    await page.locator('input[aria-label="Name"]').fill(name);
    await page.locator('input[aria-label="Name"]').press("Tab");
    await settled(page);
  };
  const appDataOf = (d) => d && d.core && d.core.appData;
  const savedWith = (list, name) => list.map(appDataOf).filter((a) => a && a.profile && a.profile.name === name);

  try {
    // ── 1. SAVED ON THIS DEVICE ─────────────────────────────────────────────────────────────────────
    {
      reset();   // no server row: the device's own save is what loads
      const b = usBlob();
      const save = JSON.stringify({ onboarded: true, appData: b.core.appData, isPremium: false, checkInBonus: 0, savedAt: new Date().toISOString(), userId: MOCK.USER_ID });
      const { ctx, page } = await open({ deviceSave: save });
      await ready(page);
      await settled(page);
      t.eq(lockedUS((await local(page) || {}).appData), LOCKED_US, "1a a US household saved on this device loads as Canada, base CAD, its unstamped accounts kept as USD (as saved back to the device)");
      await saveAName(page, "Sam Device");
      const up1 = savedWith(S.writes.map((w) => w && w.data), "Sam Device");
      t.ok(up1.length > 0 && up1.every((a) => JSON.stringify(lockedUS(a)) === JSON.stringify(LOCKED_US)),
        `1b a real save to the server (a name changed in Settings) carries the locked household: CA, base CAD, USD kept (${up1.length} save(s): ${JSON.stringify(up1.map(lockedUS))})`);
      await page.goto(base + "/", { waitUntil: "domcontentloaded" }); await ready(page);
      await page.getByRole("button", { name: /goals/i }).first().click().catch(() => {});
      const nw = page.getByText("Net worth", { exact: false }).first();
      if (await nw.count()) await nw.click().catch(() => {});
      const notice = await page.getByText("Your USD account(s) are excluded from these totals (CAD only).", { exact: false }).count();
      t.ok(notice > 0, "1c Net worth shows the existing notice: the USD accounts are left out of the CAD totals");
      await profileSettings(page);
      t.eq(await page.locator('select[aria-label="Country"]').inputValue(), "CA", "1d Settings shows Canada");
      t.eq(await page.locator('select[aria-label="Province"]').count(), 1, "1e …and asks for a province, not a state");
      await ctx.close();
    }

    // ── 2. A ROW FROM THE SERVER ────────────────────────────────────────────────────────────────────
    {
      reset({ userData: usBlob() });
      const { ctx, page } = await open();
      await ready(page);
      await settled(page);
      t.eq(lockedUS((await local(page) || {}).appData), LOCKED_US, "2a a US household's row from the server loads as Canada, base CAD, its unstamped accounts kept as USD");
      await saveAName(page, "Sam Server");
      const up2 = savedWith(S.writes.map((w) => w && w.data), "Sam Server");
      t.ok(up2.length > 0 && up2.every((a) => JSON.stringify(lockedUS(a)) === JSON.stringify(LOCKED_US)),
        `2b a real save back to the server (a name changed in Settings) is not empty and carries CA, base CAD, USD kept (${up2.length} save(s): ${JSON.stringify(up2.map(lockedUS))})`);
      t.eq(await page.locator('select[aria-label="Country"]').inputValue(), "CA", "2c Settings shows Canada");
      await ctx.close();
    }

    // ── 3. A SHARED HOUSEHOLD FROM THE SERVER ───────────────────────────────────────────────────────
    {
      reset({ membership: { household_id: "h1", role: "owner" }, household: { data: usBlob(), version: 3, updated_at: "2026-11-25T09:00:00.000Z" } });
      const { ctx, page } = await open({ householdStamp: JSON.stringify({ id: "h1", role: "owner" }) });
      await ready(page);
      await settled(page);
      t.eq(lockedUS((await local(page) || {}).appData), LOCKED_US, "3a a shared US household from the server loads as Canada, base CAD, its unstamped accounts kept as USD");
      await saveAName(page, "Sam Shared");
      const up3 = savedWith(S.patches, "Sam Shared");
      t.ok(up3.length > 0 && up3.every((a) => JSON.stringify(lockedUS(a)) === JSON.stringify(LOCKED_US)),
        `3b a real save to the shared household (a name changed in Settings) is not empty and carries CA, base CAD, USD kept (${up3.length} save(s): ${JSON.stringify(up3.map(lockedUS))})`);
      await ctx.close();
    }

    // ── 4. THE SETTINGS COUNTRY PICKER ──────────────────────────────────────────────────────────────
    {
      reset({ userData: caBlob() });
      const { ctx, page } = await open();
      await ready(page);
      await profileSettings(page);
      const select = page.locator('select[aria-label="Country"]');
      t.eq(await select.locator("option").evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()])), [["CA", "🇨🇦 Canada"]], "4a Country lists Canada only");
      t.eq(await page.locator('select[aria-label="Province"]').inputValue(), "ON", "4b (a Canadian in Ontario)");
      await settled(page);
      const before = { writes: S.writes.length, save: JSON.stringify((await local(page) || {}).appData) };
      // A country this build refuses, forced into the picker (as an old page or an extension could) and picked.
      await select.evaluate((el) => { const o = document.createElement("option"); o.value = "US"; o.textContent = "United States"; el.appendChild(o); });
      await select.selectOption("US");
      await settled(page);
      t.eq(await select.inputValue(), "CA", "4c picking it puts the picker back on Canada");
      t.eq(await page.locator('select[aria-label="Province"]').inputValue(), "ON", "4d …the province is kept");
      t.eq([S.writes.length, JSON.stringify((await local(page) || {}).appData)], [before.writes, before.save], "4e …and no update fires: nothing saved to the server or the device");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("CANADA LOCK (browser)");
})();
