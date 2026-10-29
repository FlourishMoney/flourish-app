// tests/householdFlow.browser.test.cjs
// -----------------------------------------------------------------------------
// COUPLE MODE IN A REAL BROWSER (docs/product/COUPLE-MODE-SPEC.md). The built app, signed in, against a local
// stand-in for Supabase and /api/household that keeps a household's rows the way migrations 0030/0031 do:
//   1  feature off (/api/household 404): no Household row, no placeholder and no old join code anywhere
//   2  the owner: Settings > Household; the consent screen comes BEFORE the address field; the invite is sent
//      with consent; the 6-character code is shown once; from then on the app saves to the household's blob,
//      over the version it read, and never to its own user_data row
//   3  the partner, by the email's link: the token leaves the address bar; Settings opens on the consent screen;
//      joining loads the HOUSEHOLD's data and drops the partner's own, and user_data is not read again
//   4  the partner removed by the owner: the next time the app comes to the front, the household's data is
//      cleared off this phone and the app starts fresh
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
const TOKEN = "HhInviteToken_0123456789abcdefghijklmnopqrs"; // 43 characters, as the server makes them

function blob(bills, name) {
  const b = MOCK.emptyBlob();
  b.core.appData = { ...b.core.appData, profile: { name, country: "CA", province: "ON" }, bills,
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 2500, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: "2026-11-06", type: "employment" }] };
  return b;
}

(async () => {
  const t = create();
  // The approved words (2026-10-29), found on the page exactly as the app writes them.
  const { HOUSEHOLD_WORDS: HW } = await import("../src/lib/householdWords.js");
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("HOUSEHOLD FLOW (browser)"); return; }
  // The stand-in's state, per scenario.
  let S;
  const reset = (over = {}) => { S = { featureOn: true, membership: null, household: null, userData: null, userDataGets: 0, userDataWrites: 0, patches: [], actions: [], ...over }; };
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
      if (req.method === "GET") { S.userDataGets++; return rows(S.userData ? [{ data: S.userData, updated_at: "2026-10-29T09:00:00.000Z" }] : []); }
      S.userDataWrites++; await body(req); return json(201, []);
    }
    if (p === "/rest/v1/household_members") return rows(S.membership ? [S.membership] : []);
    if (p === "/rest/v1/household_data") {
      const hidden = !S.membership || !S.household;
      if (req.method === "GET") return rows(hidden ? [] : [{ data: S.household.data, updated_at: S.household.updated_at, version: S.household.version }]);
      if (req.method === "PATCH") {
        const b = await body(req);
        const v = Number((url.searchParams.get("version") || "").replace(/^eq\./, ""));
        S.patches.push(v);
        if (hidden || v !== S.household.version) return json(200, []);
        S.household = { data: b.data, version: S.household.version + 1, updated_at: new Date().toISOString() };
        return json(200, [{ version: S.household.version, updated_at: S.household.updated_at }]);
      }
    }
    if (p === "/api/household") {
      const b = await body(req);
      S.actions.push(b);
      if (!S.featureOn) return json(404, { error: "not_found" });
      if (b.action === "status") {
        if (!S.membership) return json(200, { enabled: true, household: null });
        return json(200, { enabled: true, household: { role: S.membership.role, members: [{ role: S.membership.role, you: true, joined_at: "2026-10-29T10:00:00Z" }], invite: null, billing: { covered: false, paid_by: null, your_extra: null } } });
      }
      if (b.action === "create_invite") {
        if (b.consent !== true) return json(400, { error: "consent_required" });
        S.membership = { household_id: "h1", role: "owner" };
        S.household = { data: S.userData, version: 1, updated_at: "2026-10-29T12:00:00.000Z" };   // 0031 copies user_data
        return json(200, { ok: true, household_created: true, household_id: "h1", invite: { email: b.email, expires_at: "2026-11-05T12:00:00Z", code: "ABC234", email_sent: false } });
      }
      if (b.action === "accept_invite") {
        if (b.consent !== true || b.token !== TOKEN) return json(400, { error: "invalid" });
        S.membership = { household_id: "h1", role: "partner" };
        return json(200, { ok: true, result: "joined" });
      }
      return json(400, { error: "unknown_action" });
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
  dist = tempDir("household");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  const open = async (pathname = "/") => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Toronto" });
    await ctx.addInitScript(([key, session]) => { try {
      if (!sessionStorage.getItem("__seeded")) {           // once per tab: a reload must keep what the app did
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem(key, session);
        localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1");
        localStorage.setItem("flourish_ai_disclosure_seen", "1");
      }
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession())]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(base + pathname, { waitUntil: "domcontentloaded" });
    return { ctx, page };
  };
  const ready = (page) => page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
  const text = (page) => page.locator("body").innerText();
  const local = (page) => page.evaluate(() => { try { return { v1: localStorage.getItem("flourish_v1") || "", stamp: localStorage.getItem("flourish_household") }; } catch { return {}; } });
  const settings = (page) => page.getByRole("button", { name: /settings/i }).first().click();
  try {
    // ── 1. FEATURE OFF ──────────────────────────────────────────────────────────────────────────────
    {
      reset({ featureOn: false, userData: blob([{ id: "b1", name: "Rent", amount: 1500, freq: "monthly", date: 1 }], "Sam") });
      const { ctx, page } = await open();
      await ready(page);
      await settings(page);
      await page.getByText("Connected Banks", { exact: false }).first().waitFor();
      const all = await text(page);
      t.ok(![HW.rowSubNone, HW.rowSubPending, HW.rowSubShared, HW.intro].some((w) => all.includes(w)) && (await page.getByText(HW.rowLabel, { exact: true }).count()) === 0 && !all.includes("[WORDS:"),
        "1a feature off: no Household row and no household line anywhere in Settings");
      t.ok(!/FLRSH/.test(all), "1b …and no old made-up join code");
      t.ok(S.actions.some((a) => a.action === "status"), "1c (the app asked /api/household, which answered 404)");
      await ctx.close();
    }

    // ── 2. THE OWNER INVITES ────────────────────────────────────────────────────────────────────────
    {
      reset({ userData: blob([{ id: "b1", name: "Rent", amount: 1500, freq: "monthly", date: 1 }], "Sam") });
      const { ctx, page } = await open();
      await ready(page);
      await settings(page);
      await page.getByText(HW.rowLabel, { exact: true }).first().click();
      await page.getByText(HW.intro, { exact: true }).first().waitFor();
      t.eq(await page.locator("input[type=email]").count(), 0, "2a Household opens on what it is, with no address field yet");
      await page.getByRole("button", { name: HW.inviteButton, exact: true }).click();
      await page.getByText(HW.ownerConsentBody, { exact: true }).first().waitFor();
      t.eq(await page.locator("input[type=email]").count(), 0, "2b the consent screen comes before the address field");
      await page.getByRole("button", { name: HW.ownerConsentAgree, exact: true }).click();
      await page.locator("input[type=email]").fill("partner@example.test");
      const writesBefore = S.userDataWrites;
      await page.getByRole("button", { name: HW.sendInvite, exact: true }).click();
      await page.getByText("ABC234").first().waitFor();
      const sent = S.actions.find((a) => a.action === "create_invite");
      t.eq([sent && sent.email, sent && sent.consent], ["partner@example.test", true], "2c the invite goes with the owner's consent and the address typed");
      const all = await text(page);
      t.ok(all.includes(HW.codeOnce) && all.includes(HW.emailNotSent), "2d the code is shown once, and the owner is told the email did not go");
      await page.waitForTimeout(3500);                     // the debounced save
      t.ok(S.patches.length >= 1 && S.patches[0] === 1, `2e from now on the app saves to the household's blob, over the version it read (${S.patches.join(",")})`);
      t.eq(S.userDataWrites, writesBefore, "2f …and never to its own user_data row");
      t.eq(JSON.parse((await local(page)).stamp || "null"), { id: "h1", role: "owner" }, "2g this phone now holds the household, as its owner");
      await ctx.close();
    }

    // ── 3. THE PARTNER JOINS BY THE LINK ────────────────────────────────────────────────────────────
    {
      reset({ userData: blob([{ id: "pb", name: "Partner own bill", amount: 40, freq: "monthly", date: 3 }], "Jo"),
        household: { data: blob([{ id: "hb", name: "Mortgage", amount: 2100, freq: "monthly", date: 1 }], "Sam"), version: 5, updated_at: "2026-10-29T12:00:00.000Z" } });
      const { ctx, page } = await open(`/?household_invite=${TOKEN}`);
      await page.getByText(HW.partnerConsentBody, { exact: true }).first().waitFor({ timeout: 40000 });
      t.ok(!page.url().includes("household_invite"), "3a the link's token leaves the address bar");
      t.ok(!(await text(page)).includes("Mortgage"), "3b nothing of the household is shown before the partner agrees");
      await page.getByRole("button", { name: HW.partnerConsentAgree, exact: true }).click();
      await page.waitForURL((u) => true, { timeout: 5000 }).catch(() => {});
      await ready(page);
      await page.waitForTimeout(1500);
      const accepted = S.actions.find((a) => a.action === "accept_invite");
      t.eq([accepted && accepted.token, accepted && accepted.consent], [TOKEN, true], "3c the join goes with the link's token and the partner's consent");
      const after = await local(page);
      t.ok(after.v1.includes("Mortgage") && !after.v1.includes("Partner own bill"), "3d the phone now holds the household's data, and none of the partner's own");
      t.eq(JSON.parse(after.stamp || "null"), { id: "h1", role: "partner" }, "3e …as the partner");
      const gets = S.userDataGets;
      await page.reload({ waitUntil: "domcontentloaded" }); await ready(page); await page.waitForTimeout(800);
      t.eq(S.userDataGets, gets, "3f a member's own user_data row is not read again");

      // ── 4. REMOVED BY THE OWNER ──────────────────────────────────────────────────────────────────
      S.membership = null; S.userData = null;                // removed: no member row, their own row deleted (0031)
      await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
      await page.waitForTimeout(4000);
      const gone = await local(page);
      t.ok(!gone.v1.includes("Mortgage"), "4a back in front, a removed partner's phone no longer holds the household's data");
      t.eq(gone.stamp, null, "4b …or the household");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("HOUSEHOLD FLOW (browser)");
})();
