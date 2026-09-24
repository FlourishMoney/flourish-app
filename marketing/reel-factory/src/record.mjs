// THE APP, RECORDED. Demo mode only.
//
// The recorder enters demo mode the way a visitor does: it clicks the "preview the app with
// sample data" button on the sign-in screen, which loads the app's own synthetic household. It
// never signs in, never types a credential, and never reaches a real account — there is nothing in
// here that could. It records ONLY the screens the script asks for, one clip each.
//
// Points at the LOCAL dev server (npm run dev). It refuses any other origin, so a production URL
// cannot be recorded by editing one argument.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, devices } from "playwright";
import { DEVICE, dir, ensure } from "./config.mjs";

const run = promisify(execFile);

const LOCAL_ONLY = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/;

// One recipe per screen a script may ask for. `nav` is the bottom-bar label; `settle` is how long
// to hold still once there, because the app animates in.
// `anchor` is text on the destination screen. It is scrolled into view (the app scrolls an inner
// container, not the window, so a wheel event at page level moves nothing) and it doubles as the
// proof that the right screen is up: if the text is not there, the recipe is wrong and this throws
// rather than filming whatever happened to be on screen.
// `focus` is where the push-in goes, in fractions of the phone screen (STYLE.md §4) — the number
// the line is narrating. `ring` is the highlight box drawn around it, same units.
export const SCREENS = {
  "hook":               { nav: "Today", anchor: null,                          focus: { x: 0.5, y: 0.40 } },
  "safe-to-spend":      { nav: "Today", anchor: "Safe to Spend",               focus: { x: 0.5, y: 0.34 }, ring: { w: 0.66, h: 0.12 } },
  "bills-list":         { nav: "Watch", anchor: "Your bills",                  focus: { x: 0.5, y: 0.52 }, ring: { w: 0.82, h: 0.11 } },
  "forecast-90-day":    { nav: "Watch", anchor: "The next 90 days",            focus: { x: 0.5, y: 0.36 }, ring: { w: 0.82, h: 0.16 } },
  "forecast-low-point": { nav: "Watch", anchor: "DAY-BY-DAY CASH FLOW",        focus: { x: 0.5, y: 0.62 }, ring: { w: 0.82, h: 0.13 } },
  "meeting-agenda":     { nav: "Meet",  anchor: "Your 15-minute money meeting", focus: { x: 0.5, y: 0.40 }, ring: { w: 0.82, h: 0.14 } },
  "end-card":           null,     // drawn by Remotion, nothing to record
};

// ONLY THE SETTLED SCREEN. Playwright records a context from the moment it is created, so the raw
// clip also holds the sign-in screen, the demo click, the AI notice and the tab change — and a reel
// that opens on a consent screen is the whole point of this pipeline missed. The browser therefore
// sits still on the destination for longer than the reel needs, and this keeps only that tail.
async function trimToTail(rawWebm, outMp4, tailSeconds) {
  await run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-sseof", `-${tailSeconds}`, "-i", rawWebm,
    "-an", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    outMp4,
  ]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size < 1000) {
    throw new Error(`Trimming ${path.basename(rawWebm)} produced nothing usable.`);
  }
  return outMp4;
}

// The steps a visitor actually takes: "preview with sample data", then the AI notice, then the
// first-visit card. Each is clicked by its own visible label, so a wording change fails here with
// a readable error instead of recording a consent screen.
const ENTRY_STEPS = [/^I Understand & Accept$/, /^Skip for now$/, /^Skip Tour$/];

/**
 * Scripted, eased scrolling (STYLE.md §4). scrollIntoView jumps, and a wheel event does nothing
 * here because the app scrolls an inner container rather than the window — so this finds the real
 * scrolling ancestor and eases it over 900ms with a cubic curve. A scroll is a camera move: it
 * should start slowly, travel, and settle.
 */
async function easedScrollTo(page, locator) {
  await locator.evaluate((el) => new Promise((resolve) => {
    const scroller = (() => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
        n = n.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    })();
    const from = scroller.scrollTop;
    const box = el.getBoundingClientRect();
    const sBox = scroller === document.scrollingElement ? { top: 0, height: innerHeight } : scroller.getBoundingClientRect();
    const target = from + (box.top - sBox.top) - (sBox.height / 2 - box.height / 2);
    const to = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
    const DURATION = 900, t0 = performance.now();
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);   // cubic in-out
    const step = (now) => {
      const p = Math.min(1, (now - t0) / DURATION);
      scroller.scrollTop = from + (to - from) * ease(p);
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }));
  await page.waitForTimeout(500);
}

async function enterDemo(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "load" });
  const demo = page.locator("button.fll-demo");
  await demo.waitFor({ state: "visible", timeout: 30000 });
  await demo.click();                                  // synthetic household, no account, no network
  await page.waitForTimeout(2000);

  for (const label of ENTRY_STEPS) {
    const step = page.locator("button", { hasText: label }).first();
    if (await step.count()) { await step.evaluate((el) => el.click()); await page.waitForTimeout(1800); }
  }

  // The dashboard is up when the bottom navigation is. It is the LAST "Today" on the page — the
  // screen header carries the same word.
  const nav = navButton(page, "Today");
  await nav.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);
}

// The bottom bar, not the header that repeats its name.
const navButton = (page, label) => page.getByRole("button", { name: new RegExp(`^${label}$`) }).last();

// Two things make an ordinary Playwright click wrong here. The app animates continuously (the
// dashboard glows on a loop), so the "is it stable yet" wait never settles; and the demo banner
// pinned over the top of the screen swallows a coordinate click even a forced one. So the button
// is found, asserted visible and given a real box — then clicked through the DOM, which is what
// React listens to anyway.
async function tapVisible(locator, what) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  if (!(await locator.boundingBox())) throw new Error(`"${what}" is visible but has no box to tap.`);
  await locator.evaluate((el) => el.click());
}

/**
 * Record one clip per screen name. Returns { [screen]: absolutePathToWebm }.
 * A screen that cannot be reached throws — a reel with the wrong screen in it is worse than no reel.
 */
export async function recordScreens(screenNames, { baseUrl, week, reelId, tailSeconds = 8 }) {
  if (!LOCAL_ONLY.test(baseUrl)) {
    throw new Error(`The recorder only records a local dev server, got ${baseUrl}. Run "npm run dev" in the app and pass a localhost URL.`);
  }
  const wanted = [...new Set(screenNames)].filter((s) => SCREENS[s] !== null);
  for (const s of wanted) {
    if (!(s in SCREENS)) throw new Error(`The script asks for screen "${s}", which the recorder does not know. Add a recipe to SCREENS in src/record.mjs.`);
  }
  const outRoot = ensure(path.join(dir.recordings, week, reelId));
  const results = {};

  const browser = await chromium.launch();
  try {
    for (const screen of wanted) {
      const recipe = SCREENS[screen];
      const clipDir = ensure(path.join(outRoot, screen));
      const context = await browser.newContext({
        ...devices["iPhone 13"],
        viewport: { width: DEVICE.width, height: DEVICE.height },
        deviceScaleFactor: DEVICE.scale,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
        recordVideo: { dir: clipDir, size: { width: DEVICE.width, height: DEVICE.height } },
      });
      const page = await context.newPage();
      await enterDemo(page, baseUrl);
      if (recipe.nav) {
        await tapVisible(navButton(page, recipe.nav), `${recipe.nav} tab`);
        await page.waitForTimeout(1200);
      }
      if (recipe.anchor) {
        const anchor = page.getByText(recipe.anchor, { exact: false }).first();
        try {
          await anchor.waitFor({ state: "visible", timeout: 12000 });
        } catch {
          throw new Error(`Screen "${screen}" should show "${recipe.anchor}" and does not. The app moved — fix the recipe in src/record.mjs rather than shipping the wrong screen.`);
        }
        await easedScrollTo(page, anchor);
      }
      // Hold still for longer than the reel will use, so the tail is all settled screen.
      await page.waitForTimeout((tailSeconds + 2) * 1000);
      await context.close();                       // flushes the video file
      const file = fs.readdirSync(clipDir).find((f) => f.endsWith(".webm"));
      if (!file) throw new Error(`Playwright wrote no video for screen "${screen}".`);
      results[screen] = await trimToTail(path.join(clipDir, file), path.join(clipDir, `${screen}.mp4`), tailSeconds);
    }
  } finally {
    await browser.close();
  }
  return results;
}
