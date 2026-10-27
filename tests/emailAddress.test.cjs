// tests/emailAddress.test.cjs
// -----------------------------------------------------------------------------
// AN EMAIL ADDRESS AS TYPED ON A PHONE (2026-10-20: amanda+iostest@getgrowsmart.com "rejected" in the
// iOS app). The plus sign was always accepted; a space the keyboard added was not, and the server answered
// invalid_email for an address typed correctly.
//   1  the app's and the server's cleaners agree; a plus sign, dots, hyphens and digits are kept exactly;
//      every space-like character is removed; the address is lower-cased for checking;
//   2  what is accepted and refused after cleaning;
//   3  the real signup function: a plus address, with or without a keyboard space or a zero-width
//      character, passes the address check (it reaches the limiter); a malformed one is still a 400;
//   4  the wiring: signup and resend clean first (an account must still confirm its address); the waitlist
//      keeps refusing a space inside (it records CASL consent, so its address is never changed); the app's
//      email field strips spaces as typed and turns off the iPhone's autocorrect, capitals and spell check.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");

(async () => {
  const t = create();
  const C = await import("../src/lib/emailAddress.js");
  const S = require("../netlify/functions/_lib/emailAddress.js");

  // ── 1. One rule, both sides ───────────────────────────────────────────────────────────────────
  const typed = [
    "amanda+iostest@getgrowsmart.com", "Amanda+iOSTest@GetGrowSmart.com", "amanda +iostest@getgrowsmart.com",
    "amanda+iostest@getgrowsmart.com ", " amanda+iostest@getgrowsmart.com", "amanda +iostest@getgrowsmart.com",
    "amanda​+iostest@getgrowsmart.com", "amanda+iostest@getgrowsmart.com⁠", "amanda+ios test@getgrowsmart .com",
    "first.last-2+a.b@sub.example.co.uk", "o'brien+x@example.ca",
  ];
  t.eq(typed.map(C.cleanEmail), typed.map(S.cleanEmail), "1a the app and the server clean every address the same way");
  t.eq(typed.slice(0, 9).map(S.cleanEmail), Array(9).fill("amanda+iostest@getgrowsmart.com"), "1b every way a phone mangles amanda+iostest@getgrowsmart.com comes back to it");
  t.eq([S.cleanEmail("first.last-2+a.b@sub.example.co.uk"), S.cleanEmail("o'brien+x@example.ca"), C.stripEmailSpaces("Ab +C@D.com")], ["first.last-2+a.b@sub.example.co.uk", "o'brien+x@example.ca", "Ab+C@D.com"],
    "1c a plus sign, dots, hyphens, digits and an apostrophe are kept exactly; as typed, the case is kept");
  t.eq(String(C.EMAIL_RX), String(S.EMAIL_RX), "1d the same shape check on both sides");

  // ── 2. Accepted and refused ───────────────────────────────────────────────────────────────────
  t.eq(typed.map((x) => S.isEmail(S.cleanEmail(x))), Array(typed.length).fill(true), "2a all of them are accepted once cleaned");
  t.eq(["", "amanda", "amanda@", "@getgrowsmart.com", "amanda@getgrowsmart", "a@@b.com", null, undefined].map((x) => S.isEmail(S.cleanEmail(x))), Array(8).fill(false), "2b a malformed address is still refused");

  // ── 3. The real signup function ───────────────────────────────────────────────────────────────
  delete process.env.NETLIFY_BLOBS_CONTEXT; delete globalThis.netlifyBlobsContext;
  // Dummy local settings so the function gets past its configuration check to the address check. No
  // request leaves the machine: with no Blobs context the limiter refuses (429) before any account call.
  const savedEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "http://127.0.0.1:9"; process.env.SUPABASE_SECRET_KEY = "test-only";
  const beta = require("../netlify/functions/beta.js");
  const post = (email) => beta.handler({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "203.0.113.9" }, body: JSON.stringify({ action: "signup", email, password: "long-enough-password" }) });
  const quiet = console.log; const quietErr = console.error; console.log = () => {}; console.error = () => {};
  let codes = [];
  try {
    for (const e of ["amanda+iostest@getgrowsmart.com", "amanda +iostest@getgrowsmart.com", "amanda​+iostest@getgrowsmart.com", "not-an-email"]) {
      const r = await post(e); codes.push([r.statusCode, JSON.parse(r.body).error]);
    }
  } finally {
    console.log = quiet; console.error = quietErr;
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  t.eq(codes.slice(0, 3), [[429, "rate_limited"], [429, "rate_limited"], [429, "rate_limited"]],
    "3a signup: a plus address, with a keyboard space or a zero-width character, passes the address check (it reaches the limiter)");
  t.eq(codes[3], [400, "invalid_email"], "3b …and a malformed one is still invalid_email");

  // ── 4. The wiring ─────────────────────────────────────────────────────────────────────────────
  const B = read("netlify", "functions", "beta.js");
  t.ok(/const addr = cleanEmail\(body\.email\);\n    if \(!addr \|\| !isEmail\(addr\)\) \{/.test(B) && /const email = cleanEmail\(body\.email\);/.test(B) && !/\/\^\[\^\\s@\]\+@/.test(B),
    "4a signup and resend remove inner spaces before the address check (they must still be confirmed); no inline check is left");
  t.ok(/const emailAddr = typeof email === "string" \? email\.trim\(\)\.toLowerCase\(\) : "";\n\n    \/\/ Basic email validation\n    if \(!emailAddr \|\| !isEmail\(emailAddr\)\) \{/.test(B),
    "4a2 the waitlist still refuses a space inside (its row carries CASL consent; waitlistWelcomeEmail 10d)");
  const APP = read("src", "App.jsx");
  // The field's style is inpStyle(invalid) since the inline errors (audit H11, 2026-10-26); onChange is on the next line.
  t.ok(/<input style=\{inpStyle\(fieldErr\.email\)\} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck=\{false\} placeholder="Email address" value=\{email\}\s*onChange=\{e => setEmail\(stripEmailSpaces\(e\.target\.value\)\)\}/.test(APP),
    "4b the app's sign-in and signup email field strips spaces as typed, with no autocorrect, auto-capitalisation or spell check");
  t.ok(/const emailVal = email\.trim\(\);\n    if \(!WAITLIST_EMAIL_RX\.test\(emailVal\)\)/.test(APP), "4c the landing's waitlist form is unchanged: trimmed, and a space inside is refused");
  t.summary("emailAddress.test");
})();
