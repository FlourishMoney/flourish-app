// tests/tapFigures.browser.test.cjs
// -----------------------------------------------------------------------------
// THE SAME RULE AS tapFigures.test.cjs, IN A REAL BROWSER (watch-meet-fixes items 1 and 2).
//
// The demo build in Chromium at 430px. On Watch at 7, 30 and 90 days (with "What the forecast is
// built from" unfolded) and on Meet:
//   - every visible dollar figure or percentage is inside a button, a role="button" or a link, or
//     inside the meeting's chat (data-chat), which stays plain;
//   - every figure button in the range summary and on Meet really opens How we got this, and it closes;
//   - the range summary's figures change with the range.
// And Today, whose cards carry figures that open nothing, does not show "Tap any number".
// The browser demo is the Canadian one; the US demo is checked without a browser in tapFigures.test.cjs.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TIP = "Tap any number to see how Flourish got it.";

function buildApp() {
  if (process.env.LAYOUT_DIST) return process.env.LAYOUT_DIST;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-tapfig-"));
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://placeholder.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder" } });
  return out;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
function serve(dir) {
  const server = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}
const TAB = (p, name) => p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();

// Visible figures outside any tap target, in the page's main content (not the tab bar or the demo banner).
const UNTAPPED = () => {
  const FIG = /-?\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%/g;
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const figs = (n.nodeValue || "").match(FIG);
    if (!figs) continue;
    const el = n.parentElement;
    if (!el || !el.getClientRects().length) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") continue;
    if (el.closest("button, a, [role=button], [data-chat], [data-explanation], style, script, svg")) continue;
    out.push(`${figs.join(" ")} in "${(n.nodeValue || "").trim().slice(0, 70)}"`);
  }
  return out;
};

(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("TAP FIGURES (browser)"); return; }
  const dist = buildApp();
  const { server, port } = await serve(dist);
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("flourish_first_visit_done", "1"); localStorage.setItem("flourish_tour_done", "1"); } catch (e) {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  try {
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await p.getByText("preview the app with", { exact: false }).first().click({ timeout: 30000 });
    await p.getByText("I Understand & Accept").first().click({ timeout: 30000 });
    await p.getByText("Demo mode", { exact: false }).first().waitFor({ timeout: 40000 });
    await p.waitForTimeout(600);

    // Today: no tip.
    await TAB(p, "Today"); await p.waitForTimeout(500);
    t.eq(await p.getByText(TIP).count(), 0, "1 Today does not show the tip");

    // The working sheet opens and closes.
    const opensWorking = async (btn, label) => {
      await btn.scrollIntoViewIfNeeded(); await btn.click();
      const sheet = p.getByText("How Flourish got this", { exact: true });
      let open = false;
      try { await sheet.first().waitFor({ timeout: 4000 }); open = true; } catch {}
      t.ok(open, `${label}: opens How we got this`);
      if (open) { await p.getByRole("button", { name: "Close", exact: true }).last().click(); await p.waitForTimeout(250); }
      t.eq(await sheet.count(), 0, `${label}: …and closes`);
    };

    // Watch at 7, 30 and 90 days.
    await TAB(p, "Watch"); await p.waitForTimeout(500);
    t.ok(await p.getByText(TIP).count() === 1, "2 Watch shows the tip");
    await p.getByText("What the forecast is built from").first().click(); await p.waitForTimeout(300);
    const seen = {};
    for (const r of [7, 30, 90]) {
      await p.getByRole("button", { name: `${r}d`, exact: true }).click(); await p.waitForTimeout(500);
      t.ok(await p.getByText(`Today and the next ${r} days`, { exact: true }).count() === 1, `3a ${r}d: the summary names the range`);
      t.eq(await p.evaluate(UNTAPPED), [], `3b ${r}d: every figure on Watch is a tap target`);
      const rows = p.locator('button[aria-label$=": how Flourish got it"]').filter({ hasText: /Starting balance, to the cent|Lowest balance|Balance on|Money in|Bills and minimum payments|Everyday spending/ });
      const n = await rows.count();
      t.eq(n, 6, `3c ${r}d: six summary figures (the five the check line adds up, and the lowest balance)`);
      seen[r] = await rows.allInnerTexts();
      for (let i = 0; i < n; i++) {
        // demo-fixes C3: each row opens its own sheet, titled with that row's label.
        const label = seen[r][i].split("\n")[0].trim();
        await rows.nth(i).scrollIntoViewIfNeeded(); await rows.nth(i).click();
        let title = "";
        try { await p.getByText("How Flourish got this", { exact: true }).first().waitFor({ timeout: 4000 });
          title = await p.getByText("How Flourish got this", { exact: true }).first().evaluate(el => (el.nextElementSibling && el.nextElementSibling.textContent || "").trim()); } catch {}
        t.ok(title.length > 0, `3d ${r}d "${label}": opens How we got this`);
        t.eq(title, label, `3d2 ${r}d "${label}" opens its own sheet`);
        await p.getByRole("button", { name: "Close", exact: true }).last().click().catch(() => {}); await p.waitForTimeout(250);
        t.eq(await p.getByText("How Flourish got this", { exact: true }).count(), 0, `3d3 ${r}d "${label}": …and closes`);
      }
      await opensWorking(p.locator('button[aria-label^="The check: "]').first(), `3e ${r}d the check line`);
    }
    // Compared by label, not position: the starting balance is the same at every range, and the
    // lowest balance is the same at 30 and 90 days when its day falls inside both.
    for (const label of ["Money in", "Bills and minimum payments", "Everyday spending", "Balance on"]) {
      const v = [7, 30, 90].map(r => ((seen[r] || []).find(x => x.startsWith(label)) || "").replace(/\s+/g, " ").replace(/^.*?(-?\$[\d,]+(?:\.\d{2})?).*$/, "$1"));
      t.eq(new Set(v).size, 3, `3f "${label}" changes with the range (${v.join(", ")})`);
    }

    // Meet.
    await TAB(p, "Meet"); await p.waitForTimeout(600);
    t.ok(await p.getByText(TIP).count() === 1, "4a Meet shows the tip");
    t.eq(await p.evaluate(UNTAPPED), [], "4b every figure on Meet is a tap target (the chat stays plain)");
    const figs = p.locator('button[aria-label$="How Flourish got it"], button[aria-label$=": how Flourish got it"]');
    const m = await figs.count();
    t.ok(m >= 5, `4c Meet has a button for every figure (${m})`);
    for (let i = 0; i < m; i++) await opensWorking(figs.nth(i), `4d Meet figure ${i + 1}`);
  } catch (e) {
    t.ok(false, `the walk completed: ${String(e.message).split("\n")[0].slice(0, 160)}`);
  }
  t.eq(errors, [], "5 no page errors");
  await browser.close(); server.close();
  t.summary("TAP FIGURES (browser)");
})();
