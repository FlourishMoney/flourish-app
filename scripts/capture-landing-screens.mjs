#!/usr/bin/env node
// scripts/capture-landing-screens.mjs — the landing page's "real app" screenshots, from the demo.
//
//   npm run screens:landing
//
// Builds this checkout, opens the web demo with the Canadian sample household in Chromium at an
// iPhone-width viewport (430 x 932, device scale factor 3), and saves the four screens the landing
// page's proof strip shows to public/app-screens/, at the strip's 680 x 1474 (the same aspect):
//
//   home.jpg             Today: the safe-to-spend card and its breakdown
//   watch.jpg            Watch at 30 days: the range summary and its check line
//   meet.jpg             Meet: the weekly agenda
//   how-we-got-this.jpg  the How we got this sheet, opened by tapping the safe-to-spend figure
//
// Every screen must show the demo's own "sample data" label in frame; the script stops if one does
// not, rather than saving a screenshot that could pass for a real household. Nothing is drawn onto
// the images. Run it after any merged UI change (docs/ops/OPERATING-PLAN.md, release checklist).
//
// Options: --out <dir> (default public/app-screens), --keep-png <dir> (also keep the full-size PNGs).
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const OUT = path.resolve(arg("--out") || path.join(ROOT, "public", "app-screens"));
const KEEP_PNG = arg("--keep-png") ? path.resolve(arg("--keep-png")) : null;
const VIEWPORT = { width: 430, height: 932 };
const SCALE = 3;
const SIZE = { width: 680, height: 1474 };

export const LANDING_SCREENS = [
  { file: "home.jpg", name: "Today" },
  { file: "watch.jpg", name: "Watch at 30 days" },
  { file: "meet.jpg", name: "Meet" },
  { file: "how-we-got-this.jpg", name: "How we got this" },
];

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };

function build() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "flourish-landing-"));
  // Placeholder Supabase values: the demo never signs in, and nothing here talks to a server.
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: "https://placeholder.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "placeholder" } });
  return out;
}

function serve(dir) {
  const server = createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const tab = (p, name) => p.getByRole("button").filter({ hasText: new RegExp("^" + name + "(\\s*\\d+)?$") }).last().click();

// Scroll so `locator` sits just under the app header (the demo banner and the header stay fixed).
async function scrollUnderHeader(page, locator) {
  await locator.first().evaluate((el) => {
    const header = Math.max(...[...document.querySelectorAll("body *")].filter((n) => {
      const s = getComputedStyle(n), r = n.getBoundingClientRect();
      return (s.position === "fixed" || s.position === "sticky") && r.top < 300 && r.height > 0 && r.height < 400 && r.bottom < window.innerHeight / 2;
    }).map((n) => n.getBoundingClientRect().bottom), 0);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - header - 12);
  });
  await page.waitForTimeout(400);
}

// The demo's own label, in frame. Not added to the image: read from the page.
async function sampleLabelInFrame(page) {
  return page.evaluate(() => [...document.querySelectorAll("body *")].some((el) => {
    if (!/sample data/i.test(el.textContent || "") || el.children.length > 3) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && s.visibility !== "hidden" && Number(s.opacity) > 0.5;
  }));
}

async function toJpeg(browser, png) {
  const page = await browser.newPage();
  const b64 = await page.evaluate(async ({ src, w, h }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.88).split(",")[1];
  }, { src: "data:image/png;base64," + png.toString("base64"), w: SIZE.width, h: SIZE.height });
  await page.close();
  return Buffer.from(b64, "base64");
}

async function main() {
  const dist = build();
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, colorScheme: "light" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("flourish_first_visit_done", "1");
      localStorage.setItem("flourish_tour_done", "1");
      const now = Date.now();
      localStorage.setItem("flourish_tips_dismissed", JSON.stringify({ today: now, watch: now, meet: now }));
    } catch (e) {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  // The welcome page's demo button is the Canadian sample household (waitlistCountry, App.jsx).
  await page.getByText("Try the demo with", { exact: false }).first().click();
  await page.getByText("Demo mode", { exact: false }).first().waitFor();
  await page.waitForTimeout(900);

  const shots = {
    "home.jpg": async () => {
      await tab(page, "Today"); await page.waitForTimeout(600);
      // The card's heading, then its own "Example · sample data" tag, the figure and the breakdown.
      await scrollUnderHeader(page, page.getByText("Safe to spend until next payday", { exact: true }));
    },
    "watch.jpg": async () => {
      await tab(page, "Watch"); await page.waitForTimeout(600);
      await page.getByRole("button", { name: "30d", exact: true }).click(); await page.waitForTimeout(400);
      await scrollUnderHeader(page, page.getByText("Starting balance", { exact: true }));
    },
    "meet.jpg": async () => {
      await tab(page, "Meet"); await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    },
    "how-we-got-this.jpg": async () => {
      await tab(page, "Today"); await page.waitForTimeout(600);
      await page.getByRole("button", { name: "How Flourish got this number", exact: true }).first().click();
      await page.getByText("How Flourish got this", { exact: true }).first().waitFor();
      await page.waitForTimeout(500);
    },
  };

  fs.mkdirSync(OUT, { recursive: true });
  if (KEEP_PNG) fs.mkdirSync(KEEP_PNG, { recursive: true });
  const missing = [];
  for (const { file, name } of LANDING_SCREENS) {
    await shots[file]();
    if (!(await sampleLabelInFrame(page))) { missing.push(name); continue; }
    const png = await page.screenshot();
    if (KEEP_PNG) fs.writeFileSync(path.join(KEEP_PNG, file.replace(/\.jpg$/, ".png")), png);
    fs.writeFileSync(path.join(OUT, file), await toJpeg(browser, png));
    console.log(`saved ${path.relative(ROOT, path.join(OUT, file))} (${name})`);
    // Close any sheet before the next screen.
    if (file === "how-we-got-this.jpg") await page.keyboard.press("Escape").catch(() => {});
  }
  await browser.close(); server.close();
  if (missing.length) {
    console.error(`No "sample data" label in frame on: ${missing.join(", ")}. Nothing was saved for ${missing.length === 1 ? "it" : "them"}.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
