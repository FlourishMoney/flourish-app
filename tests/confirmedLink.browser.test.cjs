// tests/confirmedLink.browser.test.cjs
// -----------------------------------------------------------------------------
// /confirmed TELLS THE TRUTH ABOUT THE LINK, AND IS NEVER A DEAD END (audit 2026-10-26, B5), IN A REAL BROWSER.
//
// The page said "You're confirmed. Open Flourish and sign in." to an expired link
// (#error=access_denied&error_code=otp_expired) and to a visit with no token, and had no button. Now:
//   1  an expired link: no "You're confirmed"; Supabase's own words; "Send it again" sends the confirmation email
//      again (the existing resend_confirmation) to the address typed; and a Log In button
//   2  no token at all: no "You're confirmed", and the same way forward
//   3  Log In opens the sign-in card
//   4  a link Supabase refused (expired, already used, or failed) is headed "This link no longer works." (approved
//      2026-10-26), in the hash or the query, with the error text, the send-again form and Log In kept
// (A store-app signup whose link worked keeps "You're confirmed": tests/onboardingFirstNumber.browser 5b.)
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
(async () => {
  const t = create();
  let playwright;
  try { playwright = require("playwright"); } catch { t.ok(false, "playwright is installed"); t.summary("CONFIRMED LINK (browser)"); return; }
  let dist = null;
  const resends = [];
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/api/beta" && req.method === "POST") {
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
        let j = {}; try { j = JSON.parse(b || "{}"); } catch {}
        if (j.action === "resend_confirmation") resends.push(j.email);
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(j.action === "resend_confirmation" ? { ok: true } : { open: true }));
      });
      return;
    }
    if (MOCK.handle(req, res)) return;
    let f = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  dist = tempDir("confirmed");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: base, VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" } });
  const browser = await playwright.chromium.launch();
  const visit = async (suffix) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(base + "/confirmed" + suffix, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Log In" }).first().waitFor({ timeout: 40000 });
    return { ctx, page };
  };
  try {
    // ── 1. An expired link ────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page } = await visit("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
      const body = await page.locator("body").innerText();
      t.ok(!/You're confirmed/.test(body), "1a an expired link no longer says \"You're confirmed\"");
      t.ok(/Email link is invalid or has expired/.test(body), "1b …it says what Supabase said");
      t.eq(await page.getByRole("heading", { level: 1 }).allInnerTexts(), ["This link no longer works."], "4a an expired link is headed \"This link no longer works.\"");
      await page.getByPlaceholder("Email address").fill("someone@example.invalid");
      await page.getByRole("button", { name: "Send it again" }).click();
      await page.getByText("Check your email to confirm your address.").waitFor({ timeout: 10000 }).catch(() => {});
      t.eq(resends, ["someone@example.invalid"], "1c \"Send it again\" sends the confirmation email again, to the address typed (resend_confirmation)");
      t.ok(/Check your email to confirm your address\./.test(await page.locator("body").innerText()), "1d …and says to check the inbox");
      // ── 3. Log In opens the sign-in card ──
      await page.getByRole("button", { name: "Log In" }).first().click();
      await page.getByPlaceholder("Password (min 8 characters)").waitFor({ timeout: 10000 }).catch(() => {});
      const card = await page.locator("body").innerText();
      t.ok(new URL(page.url()).pathname === "/" && (await page.getByPlaceholder("Password (min 8 characters)").count()) > 0 && /Log In/.test(card), "3a Log In opens the sign-in card, at \"/\"");
      await ctx.close();
    }
    // ── 2. No token at all ────────────────────────────────────────────────────────────────────────
    {
      const { ctx, page } = await visit("");
      const body = await page.locator("body").innerText();
      t.ok(!/You're confirmed/.test(body) && /Send it again/.test(body) && /Log In/.test(body), "2a no token: not \"You're confirmed\", and the same way forward (send again, Log In)");
      t.ok(!/This link no longer works/.test(body), "2b …and no expired-link headline: no link was refused");
      await ctx.close();
    }
    // ── 4. A failed link, in the query (PKCE) ─────────────────────────────────────────────────────
    {
      const { ctx, page } = await visit("?error=server_error&error_code=unexpected_failure&error_description=Error+confirming+user");
      const body = await page.locator("body").innerText();
      t.eq(await page.getByRole("heading", { level: 1 }).allInnerTexts(), ["This link no longer works."], "4b a failed link (in the query) has the same headline");
      t.ok(/Error confirming user/.test(body) && (await page.getByPlaceholder("Email address").count()) === 1 && /Send it again/.test(body) && /Log In/.test(body) && !/You're confirmed/.test(body),
        "4c …and keeps Supabase's error text, the send-again form and the Log In button");
      await ctx.close();
    }
  } catch (e) {
    t.ok(false, "the suite ran to the end: " + String((e && e.message) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  t.summary("CONFIRMED LINK (browser)");
})();
