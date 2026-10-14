// tests/_duo.cjs
// -----------------------------------------------------------------------------
// THE iPHONE DUO, AS THE BROWSER GATES EMULATE IT (xcode27-duo).
//
// The Duo folds. Closed, the app runs on the outer display; Partially Open and Open, on the inner one.
// Each display turns both ways, so the app sees four viewports, in CSS px:
//
//   outer upright    466 x 678        inner portrait   669 x 951
//   outer landscape  678 x 466        inner landscape  951 x 669
//
// The Duo also keeps an 84 px strip for its camera and status pill, and reports it through
// env(safe-area-inset-*). Which edge it is on depends on the display AND the rotation, so a layout
// that pads only the top and bottom puts content under the pill, and one that assumes left equals
// right pads the wrong side. Measured in the iOS 27.1 simulator (Xcode 27.1 RC, a Capacitor WebView
// with viewport-fit=cover, the same as this app's):
//
//   outer upright    right 84, bottom 34
//   outer landscape  left 84            (bottom 21 assumed: the usual landscape home indicator;
//                                        not measured)
//   inner portrait   top 82, bottom 34  (both rotations)
//   inner landscape  right 84, bottom 34 (both rotations)
//
// The gates also run each side strip MIRRORED (right becomes left and left becomes right), so a fix
// that hard-codes one side fails. Chromium has no Duo; the insets are injected through the DevTools
// protocol (Emulation.setSafeAreaInsetsOverride), which makes env() report them exactly as WebKit does.
// -----------------------------------------------------------------------------
"use strict";

const DUO_VIEWPORTS = [
  { name: "Duo outer upright",   width: 466, height: 678, insets: { top: 0,  right: 84, bottom: 34, left: 0 } },
  { name: "Duo outer landscape", width: 678, height: 466, insets: { top: 0,  right: 0,  bottom: 21, left: 84 } },
  { name: "Duo inner portrait",  width: 669, height: 951, insets: { top: 82, right: 0,  bottom: 34, left: 0 } },
  { name: "Duo inner landscape", width: 951, height: 669, insets: { top: 0,  right: 84, bottom: 34, left: 0 } },
];

const mirrored = (i) => ({ ...i, left: i.right, right: i.left });

// Every viewport in the light and the dark theme with its measured insets, plus the mirrored strip
// wherever there is a side strip to mirror.
function duoPasses() {
  const out = [];
  for (const v of DUO_VIEWPORTS) {
    for (const scheme of ["light", "dark"]) out.push({ ...v, scheme, side: "measured" });
    if (v.insets.left !== v.insets.right) out.push({ ...v, insets: mirrored(v.insets), scheme: "light", side: "mirrored" });
  }
  return out;
}

const insetLabel = (i) => `T${i.top} R${i.right} B${i.bottom} L${i.left}`;

// Inject the insets into one page. The override lives on the page's DevTools target, so it survives
// reloads and navigation; it is set before the first navigation so the app's first layout sees it.
async function applyInsets(ctx, page, insets) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
  return cdp;
}

// What env(safe-area-inset-*) resolves to on the page right now. Runs in the page.
function READ_INSETS() {
  const p = document.createElement("div");
  p.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(p);
  const s = getComputedStyle(p);
  const v = { top: parseFloat(s.paddingTop), right: parseFloat(s.paddingRight), bottom: parseFloat(s.paddingBottom), left: parseFloat(s.paddingLeft) };
  p.remove();
  return v;
}

module.exports = { DUO_VIEWPORTS, duoPasses, mirrored, insetLabel, applyInsets, READ_INSETS };
