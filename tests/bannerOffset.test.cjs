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
  t.ok(/<div ref=\{bannerRef\} style=\{\{position:"fixed",top:0,left:0,right:0,zIndex:10000\}\}>\{syncBanner\}\{migratedBanner\}\{demoBanner\}<\/div>/.test(APP),
    "1a the three top banners share one fixed container, which is what gets measured");
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
  const stickies = (APP.match(/position:"sticky",top:"var\(--banner-h, 0px\)"/g) || []).length;
  t.eq(stickies, 3, "3d every sticky header pins below the banner, not to the viewport top");
  t.ok(!/position:"sticky",top:0(?![0-9])/.test(APP), "3e …and none is left pinned at 0");
  t.ok(APP.includes(`width:240,minHeight:"100dvh"`) && APP.includes(`position:"sticky",top:"${V}",paddingTop:"${V}"`),
    "3f the desktop sidebar is offset too — the previous attempt fixed only mobile");

  // ── 4. the fallback is zero, so nothing moves when no banner shows ───────────────────────────
  t.ok(!/var\(--banner-h\)(?!,)/.test(APP),
    "4a every use carries the 0px fallback, so a screen with no banner is unchanged");

  t.summary("bannerOffset.test");
})();
