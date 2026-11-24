// tests/consentIcons.test.cjs
// -----------------------------------------------------------------------------
// POLISHED ICONS ON TWO FIRST-RUN SCREENS (2026-11-24). The owner: the robot on "About AI in Flourish" looks juvenile; it
// must look polished and sleek. The same for the emoji used as icons on the onboarding bank step.
//   1  "About AI in Flourish": the app's own flourish diamond mark (FlourishMark) at the top, at the 48 px the robot
//      was drawn at, in place of the robot. Web and the phone apps share this screen, so both change.
//   2  the onboarding bank step: the lock, the green check boxes, the page and the bank button's emoji become simple line
//      icons (lucide, the app's icon set) in the app's colours, hidden from screen readers (the words say it all)
//   3  no word changes on either screen
// The screens were looked at in a browser, light and dark, at phone width (the shots in the PR); the layout suite
// measures onboarding's controls and gaps.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "src", "App.jsx"), "utf8");
const between = (a, b) => { const i = APP.indexOf(a); const j = APP.indexOf(b, i + a.length); return i < 0 || j < 0 ? "" : APP.slice(i, j); };
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const t = create();

  // ── 1. About AI in Flourish ───────────────────────────────────────────────────────────────────
  const ai = between("function AIDisclosureScreen(", "function AIDisabledNotice(");
  t.ok(ai.length > 2000, "sanity: the AI disclosure screen is found");
  t.ok(!/🤖/.test(ai), "1a no robot on the screen");
  const top = ai.slice(ai.indexOf('<div style={{textAlign:"center",marginBottom:24}}>'), ai.indexOf("About AI in Flourish</div>"));
  t.ok(/<div style=\{\{display:"flex",justifyContent:"center",marginBottom:8\}\}><FlourishMark size=\{48\}\/><\/div>/.test(top), "1b the flourish mark at the top, 48 px (the robot's size), centred, 8 px above the title as before");
  t.ok(!EMOJI.test(ai.replace(/\/\/[^\n]*|\{\/\*[\s\S]*?\*\/\}/g, "")), "1c no emoji left anywhere on the screen");
  for (const said of ["About AI in Flourish", "Quick heads-up before you use AI features.", "Educational guidance, not advice", "What we send to Anthropic (our AI provider)", "Where AI is used", "Your control", "I Understand & Accept", "Learn More", "Don't use AI"]) {
    t.ok(ai.includes(said), `1d the words are unchanged: ${said}`);
  }
  t.ok(/function FlourishMark\(\{ size = 24, style = \{\} \}\) \{\s*return \(\s*<img src="\/flourish-symbol\.png" width=\{size\} height=\{size\} alt="" aria-hidden="true"/.test(APP), "1e FlourishMark is the app's existing mark (the bundled symbol), decorative");

  // ── 2. The onboarding bank step ─────────────────────────────────────────────────────────────────
  const bank = between("// 1: Bank Connection", '{bankStage==="loading"&&');
  t.ok(bank.length > 3000, "sanity: the bank step is found");
  t.ok(!/🔒|✅|📄|🏦/.test(bank), "2a no lock, check box, page or bank emoji on the step");
  const trust = bank.slice(bank.indexOf("{/* Trust bar */}"), bank.indexOf("{/* W4 "));
  t.ok(/<Lock size=\{16\} strokeWidth=\{2\} color=\{C\.isDark\?C\.tealBright:"#00606F"\} aria-hidden="true"\/>/.test(trust) && trust.includes("<span>Read-only connection</span>"), "2b the lock: a line icon in the heading's own teal");
  t.ok(/<CheckSquare size=\{16\} strokeWidth=\{2\} color=\{C\.isDark\?C\.greenBright:C\.green\} aria-hidden="true" style=\{\{marginTop:3\}\}\/>/.test(trust), "2c the check boxes: a line check box in the app's green, level with the first line");
  for (const said of ["Read-only. We can never move your money", "Encrypted in transit and at rest", "Live balances + 90 days of transactions", "Disconnect any time from settings"]) t.ok(trust.includes(`"${said}"`), `2d the words are unchanged: ${said}`);
  t.ok(/<FileText size=\{15\} strokeWidth=\{2\} color=\{C\.mutedHi\} aria-hidden="true"\/><span>\{FIRST_RUN_WORDS\.statementTitle\}<\/span>/.test(bank), "2e the page: a line document icon in the title's colour, before the words");
  t.ok(/<Landmark size=\{20\} strokeWidth=\{2\} aria-hidden="true"\/><span>\{initError\?"SDK unavailable":"Connect My Bank Securely →"\}<\/span>/.test(bank), "2f the bank button: a line bank icon in the button's text colour (the 20 px the emoji had)");
  const W = (await import("../src/lib/firstRunWords.js")).FIRST_RUN_WORDS;
  t.eq(W.statementTitle, "Import a bank statement", "2g the statement title keeps its words; the page emoji left the string for the icon");
  t.ok(/import \{[^}]*\bLock\b[^}]*\bCheckSquare\b[^}]*\bFileText\b[^}]*\bLandmark\b[^}]*\} from "lucide-react";/.test(APP), "2h the four icons come from lucide-react, the app's icon set");

  t.summary("consentIcons.test");
})();
