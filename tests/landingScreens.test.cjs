// tests/landingScreens.test.cjs
// -----------------------------------------------------------------------------
// THE LANDING PAGE'S "REAL APP" STRIP AND public/app-screens AGREE (landing-screens, item 4).
//
// The strip showed June screenshots for months after the app changed, and three of its files only
// existed because nothing checked. Now:
//   1. every image the strip references exists in public/app-screens, at 680 x 1474;
//   2. no image is left in public/app-screens that the strip does not reference;
//   3. the capture script regenerates exactly the strip's files (npm run screens:landing);
//   4. the strip keeps its alt text, size attributes, lazy loading and the sample-data line.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "src", "App.jsx"), "utf8");
const DIR = path.join(ROOT, "public", "app-screens");

// Width and height from a JPEG's SOF marker (or a PNG's IHDR), without a dependency.
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

(async () => {
  const t = create();
  const start = APP.indexOf('<div className="fll-proof">'), end = APP.indexOf("</div>\n          </div>", start);
  const strip = APP.slice(start, end + 30);
  const entries = [...strip.matchAll(/\["\/app-screens\/([^"]+)",\s*"([^"]+)"\]/g)].map(m => ({ file: m[1], cap: m[2] }));
  t.ok(start > 0 && entries.length === 4, `0 the strip is found and lists four screens (${entries.length})`);

  // ── 1, 2. The strip and the folder agree ───────────────────────────────────────────────────────
  const onDisk = fs.readdirSync(DIR).filter(f => !f.startsWith(".")).sort();
  const referenced = entries.map(e => e.file).sort();
  t.eq(referenced.filter(f => !onDisk.includes(f)), [], "1 every image the strip references exists in public/app-screens");
  t.eq(onDisk.filter(f => !referenced.includes(f)), ["hero-card.jpg"], "2 no image is left in public/app-screens that the strip does not reference, except the hero's card, cut from home.jpg");
  for (const f of referenced.filter(x => onDisk.includes(x))) {
    t.eq(imageSize(path.join(DIR, f)), { width: 680, height: 1474 }, `1b ${f} is 680 x 1474, the strip's size`);
  }
  t.eq([...(APP.slice(0, start) + APP.slice(end)).matchAll(/app-screens\/[\w.-]+/g)].map(m => m[0]).sort(), ["app-screens/hero-card.jpg", "app-screens/hero-card.jpg"],
    "1c outside the strip, App.jsx points into app-screens only at the hero's card (the demo button and the plain image)");

  // ── 3. The capture script makes exactly these ─────────────────────────────────────────────────
  const script = fs.readFileSync(path.join(ROOT, "scripts", "capture-landing-screens.mjs"), "utf8");
  const made = [...script.slice(script.indexOf("LANDING_SCREENS"), script.indexOf("];", script.indexOf("LANDING_SCREENS"))).matchAll(/file: "([^"]+)"/g)].map(m => m[1]).sort();
  t.eq(made, referenced, "3 npm run screens:landing regenerates exactly the strip's images");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  t.eq(pkg.scripts["screens:landing"], "node scripts/capture-landing-screens.mjs && node scripts/crop-hero-card.mjs", "3b the npm script runs it, then cuts the hero's card from the new home.jpg");
  // The hero's card: a crop of home.jpg, never redrawn.
  const crop = fs.readFileSync(path.join(ROOT, "scripts", "crop-hero-card.mjs"), "utf8");
  t.ok(/export const SOURCE = path\.join\(ROOT, "public", "app-screens", "home\.jpg"\);/.test(crop) && /export const CROP = \{ x: 28, y: 252, width: 624, height: 524 \};/.test(crop)
    && /page\.screenshot\(\{ path: OUT, type: "jpeg", quality: 90, clip: CROP \}\)/.test(crop) && /SOURCE_SIZE\.width/.test(crop),
    "3e the hero card is cut from home.jpg at a fixed rectangle, at the capture's own pixel size, and the script stops on a capture of another size");
  t.eq(imageSize(path.join(DIR, "hero-card.jpg")), { width: 624, height: 524 }, "3f hero-card.jpg is the 624 x 524 crop");
  t.ok(/deviceScaleFactor: SCALE/.test(script) && /const SCALE = 3;/.test(script) && /const SIZE = \{ width: 680, height: 1474 \};/.test(script)
    && /sampleLabelInFrame/.test(script), "3c it captures at device scale factor 3, saves 680 x 1474, and refuses a screen without the sample-data label");
  t.ok(/npm run screens:landing/.test(fs.readFileSync(path.join(ROOT, "docs", "ops", "OPERATING-PLAN.md"), "utf8")), "3d the release checklist says to run it after a merged UI change");

  // ── 4. The strip's markup ──────────────────────────────────────────────────────────────────────
  t.eq(entries.map(e => e.cap), ["Safe to spend until payday", "Every bill and payday, up to 90 days ahead", "A 15-minute weekly money meeting", "Tap safe to spend to see the math"],
    "4a the captions, in order");
  t.ok(/<img src=\{src\} alt=\{cap\} loading="lazy" width=\{680\} height=\{1474\} \/>/.test(strip), "4b alt text is the caption; width, height and lazy loading are kept");
  t.ok(/<p className="fll-sample">Example, sample data\.<\/p>/.test(APP.slice(start, start + 2000)), "4c one line under the strip: \"Example, sample data.\"");
  t.ok(!entries.some(e => /any number/i.test(e.cap)), "4d no caption claims that any number can be tapped (not every figure on Today opens its working)");

  // ── 5. The landing page's claims (A2) ────────────────────────────────────────────────────────
  // There is no Windows build, and What-If tests a handful of decision types, not "any".
  const fn = (name) => { const i = APP.indexOf(`function ${name}(`); return i < 0 ? "" : APP.slice(i, APP.indexOf("\n}\n", i)); };
  const landing = [fn("AuthScreen"), fn("WaitlistForm"), fs.readFileSync(path.join(ROOT, "src", "lib", "waitlistConsent.js"), "utf8"), fs.readFileSync(path.join(ROOT, "index.html"), "utf8")].join("\n");
  t.ok(landing.length > 20000 && /This is flourish\. No mockups\./.test(landing), "5 (the scan reads the landing page, its waitlist form and consent, and index.html)");
  t.ok(!/windows/i.test(landing), "5a the landing page never says Windows");
  t.ok(!/any money decision/i.test(landing), "5b …or \"any money decision\"");
  t.ok(/Coming soon to iPhone and Android/.test(landing)
    && /Stop doing the money math <em>in your head\.<\/em>/.test(landing)
    && /flourish accounts for bills due before payday, minimum debt payments, a spending buffer and a savings amount, then shows what's safe to spend until payday\./.test(landing)
    && /Test a decision, like a big purchase or an extra debt payment, and see the result before you commit\./.test(landing)
    && /Join the waitlist and we'll email you the moment flourish launches in Canada\./.test(landing), "5c the badge, the hero, the What-If card and the waitlist line, word for word");

  t.summary("landingScreens.test");
})();
