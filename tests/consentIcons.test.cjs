// tests/consentIcons.test.cjs
// -----------------------------------------------------------------------------
// POLISHED ICONS ON TWO FIRST-RUN SCREENS (2026-11-24). The owner: the robot on "About AI in Flourish" looks juvenile; it
// must look polished and sleek. The same for the emoji used as icons on the onboarding bank step.
//   1  "About AI in Flourish": the app's own flourish diamond mark (FlourishMark) at the top, at the 48 px the robot
//      was drawn at, in place of the robot. Web and the phone apps share this screen, so both change.
//   2  the onboarding bank step: the lock, the green check boxes, the page and the bank button's emoji become simple line
//      icons (lucide, the app's icon set) in the app's colours, hidden from screen readers (the words say it all)
//   3  no word changes on either screen
//   4  review round 1 (2026-11-24): the same for the "Enable AI Coach" pop-up and the "AI features are off" screen (the
//      flourish mark), and the "Connect your bank" consent pop-up (the bank step's line lock). No robot emoji is left
//      anywhere in the app: the Goals coach hint takes the Coach's own icon, the Android home-screen tip a phone line
//      icon, and the Kids goal picker drops its robot.
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

  // ── 4. Review round 1: the other AI screens, the bank consent pop-up, and no robot anywhere ─────────────
  const modal = between("function AIConsentModal(", "// ─── APP ROOT");
  t.ok(modal.length > 1000 && !/🤖/.test(modal), "4a \"Enable AI Coach\": no robot");
  t.ok(/<div style=\{\{display:"flex",justifyContent:"center",marginBottom:8\}\}><FlourishMark size=\{40\}\/><\/div>\s*<div[^>]*>Enable AI Coach<\/div>/.test(modal), "4b …the flourish mark at the robot's 40 px, above the title");
  for (const said of ["Enable AI Coach</div>", "This enables AI coaching powered by", "Claude (Anthropic)", "Your conversations may be processed by Anthropic to generate responses.", "This is not financial advice.", ">Enable AI Coach</button>", ">Cancel</button>"]) t.ok(modal.includes(said), `4c the words are unchanged: ${said}`);
  const off = between("function AIDisabledNotice(", "function BankConsentModal(");
  t.ok(off.length > 500 && !/🤖/.test(off), "4d \"AI features are off\": no robot");
  t.ok(/<div style=\{\{display:"flex",justifyContent:"center",marginBottom:12\}\}><FlourishMark size=\{42\}\/><\/div>\s*<div[^>]*>AI features are off<\/div>/.test(off), "4e …the flourish mark at the robot's 42 px, above the title");
  for (const said of ["AI features are off</div>", "You've turned off AI in Settings. Enable it to chat with the Coach and use AI explanations.", ">Open Settings</button>", ">Back</button>"]) t.ok(off.includes(said), `4f the words are unchanged: ${said}`);
  const consent = between("function BankConsentModal(", "function AIConsentModal(");
  t.ok(consent.length > 1000 && !/🔒/.test(consent), "4g \"Connect your bank\" pop-up: no lock emoji");
  t.ok(/<div style=\{\{display:"flex",justifyContent:"center",marginBottom:8\}\}><Lock size=\{40\} strokeWidth=\{1\.75\} color=\{C\.isDark\?C\.tealBright:"#00606F"\} aria-hidden="true"\/><\/div>\s*<div[^>]*>Connect your bank<\/div>/.test(consent), "4h …the bank step's line lock, in the same teal, at the emoji's 40 px");
  for (const said of ["Connect your bank</div>", "Read-only: we cannot move money", "What we access", "How long we keep it", "Disconnecting and deleting", ">Connect My Bank</button>", ">Not Now</button>"]) t.ok(consent.includes(said), `4i the words are unchanged: ${said}`);
  // Nowhere in the app: every source file a build bundles, and the website's own pages.
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs|html|json|css)$/.test(f) && files.push(p); } })(path.join(ROOT, "src"));
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(html|js|json|webmanifest)$/.test(f) && files.push(p); } })(path.join(ROOT, "public"));
  files.push(path.join(ROOT, "index.html"));
  t.ok(files.length > 50, `sanity: the scan reads the app's files (${files.length})`);
  t.eq(files.filter((f) => /🤖/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f)), [], "4j no robot emoji anywhere in the app");
  t.ok(/<Icon id="sparkles" size=\{18\} color=\{C\.purpleBright\} strokeWidth=\{1\.5\}\/>\s*<div style=\{\{flex:1\}\}>\s*<div[^>]*>Ask Coach about your goals<\/div>/.test(APP), "4k the Goals hint to ask the Coach: the Coach's own sparkles icon");
  t.ok(/<Smartphone size=\{18\} strokeWidth=\{2\} color=\{C\.blueBright\} aria-hidden="true"\/> Add to Android Home Screen/.test(APP), "4l the Android home-screen tip: a phone line icon");
  t.ok(/const goalEmojis=\["🎯","🎮","🚲","📚","🎸","⚽","🏊","🎨","✈️","🦄","👟","🍕","🏆","🎪"\];/.test(APP), "4m the Kids goal picker: the other 14 choices, the robot gone");

  t.summary("consentIcons.test");
})();
