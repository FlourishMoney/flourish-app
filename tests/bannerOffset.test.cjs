// tests/bannerOffset.test.cjs
// -----------------------------------------------------------------------------
// A FIXED BANNER RESERVES ITS OWN HEIGHT.
//
// The demo, sync and migrated banners are position:fixed, so they take no space and everything
// renders underneath them — the wordmark, the notification bell, the date. Their height is not a
// constant anyone can hard-code: the demo banner wraps to two lines at 375px, all of them grow
// with the phone's text size (measured: 88px, 116px at 135%, 123px at 160%), and more than one can
// show at once.
//
// So one container holds all of them, its height is measured, and the number is published as
// --banner-h for layout to consume: padding on each top-level column, and the offset for each
// sticky header.
//
// Two earlier attempts are pinned against here because both failed silently:
//   a spacer DIV beside the column — the root is a flex ROW, so it computed to width 0 and
//   reserved nothing, while the header offset it came with pushed the header ONTO the content and
//   swallowed taps on the Do sub-tabs;
//   a mount effect with a dependency list — the app's first render is the landing screen, which
//   does not mount the shell, so the effect ran once against a null ref and never ran again.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

(async () => {
  const t = create();

  // ── 1. one measured container holds every fixed top banner ───────────────────────────────────
  t.ok(/<div ref=\{bannerRef\} style=\{\{position:"fixed",top:0,left:0,right:0,zIndex:10000,pointerEvents:"none"\}\}>\{syncBanner\}\{migratedBanner\}\{demoBanner\}\{offlineBanner\}<\/div>/.test(APP),
    "1a all four top banners share one fixed container, which is what gets measured");
  t.eq((APP.match(/<div ref=\{bannerRef\}/g) || []).length, 2,
    "1b …in both shells, mobile and desktop");
  // None of them may re-fix itself, or it would escape the container and stop being measured.
  t.ok(!/position:"fixed",top:0,left:0,right:0,zIndex:10000,background/.test(APP),
    "1c and none of the banners is individually fixed any more");

  // ── 2. measured with an observer, attached by a callback ref ─────────────────────────────────
  t.ok(/const bannerRef = useCallback\(\(el\) => \{/.test(APP),
    "2a a callback ref, so it fires when the shell mounts rather than once at app start");
  t.ok(/if \(!el\) \{ set\(0\); return; \}/.test(APP), "2b no banner means no reserved space");
  t.ok(/new ResizeObserver\(measure\)/.test(APP),
    "2c the height is observed, so a wrap or a text-size change updates it");
  t.ok(/bannerRO\.current && bannerRO\.current\.disconnect\(\)/.test(APP),
    "2d and the previous observer is disconnected, so remounts do not stack them");
  t.ok(/setProperty\("--banner-h", `\$\{Math\.round\(px\)\}px`\)/.test(APP),
    "2e published as a CSS variable — one measurement, many consumers");
  // The mechanism must not be gated on a dependency list again.
  t.ok(!/\}, \[syncError, showMigratedBanner/.test(APP),
    "2f it is not gated on the banner flags, which is how the 0 to 88 change was missed");

  // ── 3. layout consumes the variable ──────────────────────────────────────────────────────────
  const V = 'var(--banner-h, 0px)';
  const uses = (APP.match(/var\(--banner-h, 0px\)/g) || []).length;
  t.ok(uses >= 4, `3a the variable is consumed in several places (${uses})`);
  t.ok(APP.includes(`maxWidth:430,minHeight:"100dvh",display:"flex",flexDirection:"column",position:"relative",zIndex:1,paddingTop:"${V}"`),
    "3b the mobile column reserves the banner's height as PADDING, not as a sibling spacer");
  t.ok(!/aria-hidden="true" style=\{\{height:bannerH/.test(APP),
    "3c the zero-width spacer is gone");
  // Every sticky that sits at the TOP of a shell must clear the banner. Stated as a rule rather
  // than a count: a sticky table head inside its own scroll container is none of this test's
  // business, and hard-coding "3" would fail a legitimate fourth consumer.
  const stickies = (APP.match(/position:"sticky",top:"var\(--banner-h, 0px\)"/g) || []).length;
  t.ok(stickies >= 3, `3d the shell's sticky headers pin below the banner (${stickies})`);
  t.ok(!/position:"sticky",top:0,zIndex:(?:20|30)\b/.test(APP),
    "3e …and no shell header is left pinned to the viewport top");
  // The sidebar is checked by PARSING its style object, not by matching a literal. The previous
  // pair of assertions passed against two different reverts of the bug — reordering the properties
  // defeated one, and leaving the stale minHeight defeated the other.
  {
    const at = APP.indexOf('<div style={{width:240,');
    t.ok(at > 0, "3f the desktop sidebar is where this test thinks it is");
    const decl = APP.slice(at, APP.indexOf("}}>", at));
    const has = (k) => new RegExp(`(^|[,{])\\s*${k}\\s*:`).test(decl);
    t.ok(/position:"sticky"/.test(decl) && /top:"var\(--banner-h, 0px\)"/.test(decl),
      "3g it is offset below the banner");
    t.ok(!has("paddingTop"),
      "3h …ONCE. Sticky top already displaces it; padding as well pushed a full-height box that " +
      "far below the fold and took the Settings button off screen with it.");
    t.ok(/height:`calc\(100dvh - var\(--banner-h, 0px\)\)`/.test(decl),
      "3i and the box is shortened by the same amount, so it ends at the bottom of the viewport");
    t.ok(!has("minHeight"),
      "3j with no minHeight fighting that height — it was set to the same calc and was dead");
    // Shortening alone is not enough: on a short viewport the content is taller than the box, and
    // without this the footer (Settings, the only route to Settings on desktop) simply falls off.
    t.ok(/overflowY:"auto"/.test(decl),
      "3k …and it scrolls its own contents, so nothing is unreachable on a short viewport");
  }
  t.ok(APP.includes(`maxWidth:"calc(100vw - 240px)",paddingTop:"${V}"`),
    "3l the desktop MAIN column reserves the height too, or its top bar lands on its content");

  // Every banner that pins to the top must be inside the measured container. Checked as a rule —
  // no fixed top-0 element outside it — rather than as a count, which a future unrelated overlay
  // would break for the wrong reason.
  {
    const container = '<div ref={bannerRef} style={{position:"fixed",top:0,left:0,right:0,zIndex:10000,pointerEvents:"none"}}>';
    t.eq((APP.match(/<div ref=\{bannerRef\}/g) || []).length, 2, "3m one container per shell");
    t.ok(APP.includes(container), "3n the container is fixed to the top and does not take clicks itself");
    // Counted, not just found: there are two shells, so matching one of them let a mutation that
    // removed the offline banner from the other pass unnoticed.
    t.eq((APP.match(/\{syncBanner\}\{migratedBanner\}\{demoBanner\}\{offlineBanner\}/g) || []).length, 2,
      "3o all four banners are inside the container, in BOTH shells");
    // Each banner takes its own clicks back, or the container's empty width swallows them.
    const autos = (APP.match(/pointerEvents:"auto"/g) || []).length;
    t.ok(autos >= 4, `3p …and each banner takes its own clicks back (${autos})`);
    t.ok(!/zIndex:9999,background:"#180800"/.test(APP),
      "3q no banner pins itself below the container, where it would be invisible behind the others");
    t.ok(!/const offlineBanner[\s\S]{0,200}maxWidth:430/.test(APP),
      "3r and the offline banner is full width, not a 430px chip floating in a desktop-width bar");
  }

  // ── 4. the fallback is zero, so nothing moves when no banner shows ───────────────────────────
  t.ok(!/var\(--banner-h\)(?!,)/.test(APP),
    "4a every use carries the 0px fallback, so a screen with no banner is unchanged");

  t.summary("bannerOffset.test");
})();
