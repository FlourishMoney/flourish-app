// tests/meetingMemory.browser.test.cjs
// -----------------------------------------------------------------------------
// THE MONEY MEETING REMEMBERS, IN A REAL BROWSER. The built app, signed in against a local stand-in for
// Supabase (tests/_mockSupabase.cjs), with /api/meeting answered by the REAL netlify/functions/meeting.js
// over an in-memory meeting_records table that keeps the 0011/0030 row rules (tests/_meetingStore.cjs).
// Nothing reaches a real database. Synthetic household only.
//   1  the meetings cannot be read: no opening, no questions
//   2  the first meeting: the first-meeting line, and the bank's three questions with Yes and No
//   3  the save fails: the existing line, and nothing changes (no bill, no "done", the choices stay)
//   4  the save works (a double tap saves once): marked done, the yes applied once, the no recorded,
//      and nothing the app saves carries the records
//   5  the next meeting: "Last meeting:" and its decisions, and the question they said no to is gone
// MEETING_SHOTS=<folder> also saves a screenshot of each step there (for review, never in the gate).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const { tempDir } = require("./_tmp.cjs");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const MOCK = require("./_mockSupabase.cjs");
const { createStore } = require("./_meetingStore.cjs");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const TZ = "America/Toronto";
const SHOTS = process.env.MEETING_SHOTS || "";

// The opening says a day as the app does ("Nov 1"): meetingRecord.js meetingDayLabel.
const label = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const dayIn = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const iso = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };
const charge = (name, amount, n) => ({ id: `${name}-${n}`, name, amount, date: iso(monthsAgo(n)), cat: "Subscriptions" });

function blob({ bills, lastMeetingAt = null }) {
  const b = MOCK.emptyBlob();
  b.core.appData = { ...b.core.appData,
    profile: { name: "Sam", country: "CA", province: "ON", ...(lastMeetingAt ? { meetingSchedule: { lastMeetingAt } } : {}) },
    accounts: [{ id: "m1", name: "Chequing", type: "checking", balance: 2500, institution: "Manual" }],
    incomes: [{ id: "i1", label: "Job", amount: 2000, freq: "biweekly", nextPayDate: iso(new Date(Date.now() + 5 * 86400e3)), type: "employment" }],
    bills,
    transactions: [charge("Netflix", 24.99, 0), charge("Netflix", 24.99, 1), charge("Netflix", 24.99, 2),
      charge("Goodlife Gym", 45, 0), charge("Goodlife Gym", 45, 1), charge("Goodlife Gym", 45, 2)] };
  return b;
}
const BILLS = [{ id: "b1", name: "Netflix", amount: "18.99", date: "16", origin: "observed" }, { id: "b2", name: "Spotify", amount: "11.99", date: "4", origin: "observed" }];

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("MEETING MEMORY (browser)"); return; }
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  let store, S;
  const reset = (over = {}) => { store = createStore(); S = { userData: null, writes: [], meetingCalls: [], listDelayMs: 0, ...over }; };
  reset();
  let dist = null;
  const body = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => ok(d)); });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const json = (status, b) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(b === undefined ? "" : JSON.stringify(b)); };
    const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
    const rows = (list) => (wantsObject ? (list.length ? json(200, list[0]) : json(406, { code: "PGRST116", message: "no rows" })) : json(200, list));
    if (p === "/rest/v1/user_data") {
      if (req.method === "GET") return rows(S.userData ? [{ data: S.userData, updated_at: new Date(Date.now() - 3600e3).toISOString() }] : []);
      S.writes.push(await body(req)); return json(201, []);
    }
    if (p === "/api/meeting") {
      const raw = await body(req);
      let action = "?";
      try { action = JSON.parse(raw).action; } catch {}
      S.meetingCalls.push(action);
      if (action === "list" && S.listDelayMs) await new Promise((ok) => setTimeout(ok, S.listDelayMs));   // a slow read
      const r = await store.fn.handler({ httpMethod: req.method, headers: { authorization: req.headers.authorization, origin: req.headers.origin }, body: raw });
      res.writeHead(r.statusCode, { "Content-Type": "application/json" }); res.end(r.body || ""); return;
    }
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("meetingmemory");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ });
    await ctx.addInitScript(([key, session]) => { try {
      if (!sessionStorage.getItem("__seeded")) {
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem(key, session);
        localStorage.setItem("flourish_first_visit_done", "1");
        localStorage.setItem("flourish_tour_done", "1");
        localStorage.setItem("flourish_ai_disclosure_seen", "1");
      }
    } catch (e) {} }, [MOCK.storageKey(base), JSON.stringify(MOCK.makeSession())]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("safe to spend", { exact: false }).first().waitFor({ timeout: 40000 });
    return { ctx, page };
  };
  const toMeet = async (page) => {
    await page.getByRole("button").filter({ hasText: /^Meet(\s*\d+)?$/ }).last().click();
    await page.locator('[data-tour="meet"]').first().waitFor();
    await page.waitForTimeout(800);   // the read made when Meet opens
  };
  const shot = async (page, name, locator) => {
    if (!SHOTS) return;
    if (locator) { await locator.first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {}); await page.waitForTimeout(300); }
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
  };
  const local = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("flourish_v1") || "null"); } catch { return null; } });
  const opening = (page) => page.locator('[data-meet="opening"]');
  const questions = (page) => page.locator('[data-meet="questions"]');
  // One question's own box: the smallest block holding both its words and its buttons.
  const answer = (page, re, label) => questions(page).locator("div").filter({ hasText: re, has: page.getByRole("button", { name: label, exact: true }) }).last().getByRole("button", { name: label, exact: true });
  const FIRST = "This is your first money meeting, so there is nothing to compare against yet.";
  const today = dayIn(Date.now());

  try {
    // ── 1. THE MEETINGS CANNOT BE READ ───────────────────────────────────────────────────────────
    {
      reset({ userData: blob({ bills: BILLS }) });
      store.S.fail.list = true;
      const { ctx, page } = await open();
      await toMeet(page);
      t.ok(S.meetingCalls.filter(a => a === "list").length >= 2, `1a the app asked for the meetings at sign-in and when Meet opened (${S.meetingCalls.join(",")})`);
      t.eq(await opening(page).count(), 0, "1b a failed read shows no opening at all");
      t.ok(!(await page.locator("body").innerText()).includes(FIRST), "1c …never the first-meeting line");
      t.eq(await questions(page).count(), 0, "1d …and asks no question, so one they said no to cannot come back");
      await shot(page, "00-read-failed.png");
      await ctx.close();
    }

    // ── 2. THE FIRST MEETING ─────────────────────────────────────────────────────────────────────
    reset({ userData: blob({ bills: BILLS }) });
    const { ctx, page } = await open();
    await toMeet(page);
    await opening(page).first().waitFor();
    t.eq((await opening(page).innerText()).trim(), FIRST, "2a the first meeting opens with the first-meeting line");
    const qText = await questions(page).innerText();
    t.ok(/Goodlife Gym looks like a new regular bill at \$45\. Add it\?/.test(qText), "2b the bank's new gym is asked about, in billsReconcile's words");
    t.ok(/Netflix went up from \$19 to \$25\. Is that right\?/.test(qText), "2c …and Netflix's new amount");
    t.ok(/Spotify at \$12 has stopped showing up\. Has it ended\?/.test(qText), "2d …and Spotify stopping");
    t.eq(await questions(page).getByRole("button", { name: "Yes", exact: true }).count(), 3, "2e each with Yes…");
    t.eq(await questions(page).getByRole("button", { name: "No", exact: true }).count(), 3, "2f …and No");
    await shot(page, "01-first-meeting.png");
    await answer(page, /Goodlife Gym/, "Yes").click();
    await answer(page, /Netflix/, "No").click();
    t.eq(await answer(page, /Goodlife Gym/, "Yes").getAttribute("aria-pressed"), "true", "2g a chosen answer says so (aria-pressed)");
    await shot(page, "02-answered.png", questions(page));

    // ── 3. THE SAVE FAILS ────────────────────────────────────────────────────────────────────────
    store.S.fail.record = true;
    const mark = page.getByRole("button", { name: "Mark this meeting done", exact: true });
    await mark.scrollIntoViewIfNeeded();
    await mark.click();
    await page.getByText("Your meeting wasn't saved. Please try again.", { exact: true }).waitFor();
    t.ok(true, "3a a failed save says the approved line: Your meeting wasn't saved. Please try again.");
    await page.waitForTimeout(600);
    let l = await local(page);
    t.eq((l.appData.bills || []).map(b => b.name).sort(), ["Netflix", "Spotify"], "3b …the bills are unchanged (the yes was not applied)");
    t.ok(!(l.appData.profile.meetingSchedule && l.appData.profile.meetingSchedule.lastMeetingAt), "3c …the meeting is not marked done");
    t.eq(await answer(page, /Goodlife Gym/, "Yes").getAttribute("aria-pressed"), "true", "3d …and the choices are still there to try again");
    t.eq(store.S.rows.length, 0, "3e nothing was stored");
    await shot(page, "03-save-failed.png", mark);

    // ── 4. THE SAVE WORKS ────────────────────────────────────────────────────────────────────────
    store.S.fail.record = false;
    await mark.dblclick();
    await page.getByText("✓ This week's meeting is marked done.", { exact: true }).waitFor();
    t.eq(store.S.log.upserts, 1, "4a a double tap saves the meeting once");
    t.eq(store.S.rows.map(r => [r.met_on, r.answers.map(a => `${a.subject}:${a.answer}`).sort()]),
      [[today, ["Goodlife Gym:accepted", "Netflix:dismissed"]]], "4b the meeting is stored for today with the gym's yes and Netflix's no (Spotify was left unanswered)");
    await page.waitForTimeout(3500);   // the debounced save
    l = await local(page);
    const bills = (l.appData.bills || []).map(b => `${b.name}:${b.amount}`).sort();
    t.eq(bills, ["Goodlife Gym:45", "Netflix:18.99", "Spotify:11.99"], "4c the yes added the gym once; the no left Netflix's amount alone");
    t.ok(!!(l.appData.profile.meetingSchedule && l.appData.profile.meetingSchedule.lastMeetingAt), "4d the meeting is marked done");
    t.ok(!("meetingRecords" in l.appData), "4e this device's saved state carries no meeting records");
    t.ok(S.writes.length >= 1 && S.writes.every(w => !w.includes("meetingRecords")), `4f nothing the app saved to user_data carries them (${S.writes.length} saves)`);
    t.eq(await questions(page).count(), 0, "4g once marked done, no question is left waiting for an answer that cannot be saved today");
    await opening(page).first().waitFor();
    t.ok((await opening(page).innerText()).startsWith(`Last meeting: ${label(today)}.`), "4h the opening now reads from the meeting just held, its day said as \"Nov 1\" is");
    await shot(page, "04-marked-done.png");
    const heldRowCopy = JSON.parse(JSON.stringify(store.S.rows[0]));

    // ── 4i. NOTHING STALE WHILE READING ──────────────────────────────────────────────────────────
    // What this phone holds is now somebody else's history (as after a leave or a join), and the next read is slow.
    // Opening Meet again must show no opening at all until that read answers, then the new one.
    store.S.rows = [];
    S.listDelayMs = 4000;
    await page.getByRole("button").filter({ hasText: /^Today(\s*\d+)?$/ }).last().click();
    await page.getByText("safe to spend", { exact: false }).first().waitFor();
    await page.getByRole("button").filter({ hasText: /^Meet(\s*\d+)?$/ }).last().click();
    await page.locator('[data-tour="meet"]').first().waitFor();
    let staleSeen = false;
    for (let i = 0; i < 10; i++) { if (await opening(page).count()) staleSeen = true; await page.waitForTimeout(200); }
    t.ok(!staleSeen, "4i while the meetings are being read, Meet shows no opening at all, never the one it held before");
    await opening(page).first().waitFor({ timeout: 10000 });
    t.eq((await opening(page).innerText()).trim(), FIRST, "4j …then the opening the read gave (here: nothing held, so the first-meeting line)");
    t.ok(!(await page.locator("body").innerText()).includes(`Last meeting: ${label(today)}.`), "4k …and the old history is gone from the screen");
    S.listDelayMs = 0;
    store.S.rows = [heldRowCopy];
    const heldRow = JSON.parse(JSON.stringify(store.S.rows[0]));
    const savedBlob = JSON.parse(S.writes[S.writes.length - 1]);
    await ctx.close();

    // ── 5. THE NEXT MEETING, A WEEK LATER ────────────────────────────────────────────────────────
    {
      const weekAgo = Date.now() - 7 * 86400e3;
      reset();
      const next = blob({ bills: savedBlob.data ? savedBlob.data.core.appData.bills : savedBlob.core.appData.bills, lastMeetingAt: new Date(weekAgo).toISOString() });
      S.userData = next;
      store.S.rows.push({ ...heldRow, met_on: dayIn(weekAgo) });
      const { ctx: c2, page: p2 } = await open();
      await toMeet(p2);
      await opening(p2).first().waitFor();
      const lines = (await opening(p2).innerText()).split("\n").map(s => s.trim()).filter(Boolean);
      t.eq(lines, [`Last meeting: ${label(dayIn(weekAgo))}.`, "Since then, you said yes to Goodlife Gym.", "You said no to Netflix, so we won't ask about it again for 12 months."],
        "5a the next meeting opens with \"Last meeting:\" and what was decided");
      const q2 = await questions(p2).innerText();
      t.ok(!/Netflix/.test(q2), "5b the question they said no to does not come back");
      t.ok(!/Goodlife Gym/.test(q2), "5c the gym they said yes to is not asked again either (it is a bill now)");
      t.ok(/Spotify at \$12 has stopped showing up/.test(q2), "5d the question they left unanswered is still asked");
      await shot(p2, "05-next-meeting.png");
      await shot(p2, "06-no-not-back.png", questions(p2));
      await c2.close();
    }
  } catch (e) {
    t.ok(false, "the flow ran to the end: " + (e && e.message ? e.message.split("\n")[0] : e));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("MEETING MEMORY (browser)");
})();
