#!/usr/bin/env node
// scripts/crop-hero-card.mjs — the landing hero's safe-to-spend card, cut from the real Today capture.
//
//   node scripts/crop-hero-card.mjs        (npm run screens:landing runs it after the captures)
//
// Reads public/app-screens/home.jpg (captured from the demo by scripts/capture-landing-screens.mjs) and
// writes public/app-screens/hero-card.jpg: the safe-to-spend card from its header ("Safe to spend until
// next payday"), the "Example · sample data" chip and the $1,944 figure, down through the breakdown's
// "= Safe until next payday" row. A crop only: the pixels are the capture's, at their own size, with
// nothing drawn on, so every figure in the hero is one the demo really showed.
//
// The rectangle is in home.jpg's pixels (680 x 1474). It stops if the capture is not that size, rather
// than cutting the wrong part of a different layout; re-check CROP after a change to Today's layout.
// Uses Playwright (already a dev dependency) to decode and re-encode the JPEG: no image library added.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = path.join(ROOT, "public", "app-screens", "home.jpg");
export const OUT = path.join(ROOT, "public", "app-screens", "hero-card.jpg");
export const SOURCE_SIZE = { width: 680, height: 1474 };
// x 28 to 652 is the card's own left and right edge; y 252 is the first row of the card below the app's
// header bar, and y 776 sits just under "= Safe until next payday", above the line before "Can I afford this?".
export const CROP = { x: 28, y: 252, width: 624, height: 524 };

function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}
export { jpegSize };

async function main() {
  const src = fs.readFileSync(SOURCE);
  const size = jpegSize(src);
  if (!size || size.width !== SOURCE_SIZE.width || size.height !== SOURCE_SIZE.height) {
    console.error(`stop: ${path.relative(ROOT, SOURCE)} is ${size ? `${size.width} x ${size.height}` : "unreadable"}, not ${SOURCE_SIZE.width} x ${SOURCE_SIZE.height}; re-check CROP before cutting.`);
    process.exit(1);
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: SOURCE_SIZE, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0"><img id="s" style="display:block" src="data:image/jpeg;base64,${src.toString("base64")}"></body></html>`);
    await page.locator("#s").evaluate((img) => img.decode());
    await page.screenshot({ path: OUT, type: "jpeg", quality: 90, clip: CROP });
  } finally {
    await browser.close();
  }
  const out = jpegSize(fs.readFileSync(OUT));
  console.log(`saved ${path.relative(ROOT, OUT)} (${out.width} x ${out.height}) from ${path.relative(ROOT, SOURCE)} at ${CROP.x},${CROP.y}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
