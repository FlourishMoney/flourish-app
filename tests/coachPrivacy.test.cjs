// tests/coachPrivacy.test.cjs
// -----------------------------------------------------------------------------
// NO NAME AND NO FULL ACCOUNT NUMBER REACHES THE AI REQUEST (audit 2026-10-26, B2).
//
// The AI disclosure says the coach is not given your name, email or full account numbers. The coach context
// carried the profile, partner and children's names, and statement text went with the holder's name and account
// number. Now (src/lib/coachPrivacy.js):
//   1  the household's names become roles ("you", "partner", "child 1"…), wherever they appear in a request
//   2  statement text loses email addresses and account and card numbers (last 4 kept); amounts and dates stay
//   3  App.jsx: every /api/coach request is built by coachRequestBody, the statement text by redactStatementText,
//      and the coach context names no one
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "src", "App.jsx"), "utf8");

(async () => {
  const t = create();
  const P = await import("../src/lib/coachPrivacy.js");
  const profile = { name: "Priyanka Okafor-Lindqvist", partnerName: "Desmond", kids: [{ name: "Oluwaseun", birthYear: "2019" }, { name: "May", birthYear: "2022" }] };
  const names = P.householdNames(profile);
  const NAME_RX = /priyanka|okafor|lindqvist|desmond|oluwaseun/i;

  // ── 1. Names become roles, anywhere in the request ──────────────────────────────────────────────
  {
    t.eq(names.filter((n) => !n.part).map((n) => `${n.text}=${n.role}`).sort(),
      ["Desmond=partner", "May=child 2", "Oluwaseun=child 1", "Priyanka Okafor-Lindqvist=you"].sort(), "1a the profile, partner and each child map to you, partner, child 1, child 2");
    const body = {
      type: "chat",
      payload: {
        context: "Accounts: Priyanka's Chequing $1,200.00; DESMOND OKAFOR SAVINGS $300.00\nGoals: Oluwaseun's RESP: $400 saved\nChildren: May (born 2022)",
        messages: [{ role: "user", content: "Can priyanka and Desmond open an RESP for Oluwaseun? We may also save for May." },
                   { role: "assistant", content: "Yes, you may." }],
      },
    };
    const sent = P.coachRequestBody(body, names);
    t.ok(!NAME_RX.test(sent), `1b no name in the request: ${sent.slice(0, 160)}…`);
    const back = JSON.parse(sent);
    t.eq(back.payload.messages[0].content, "Can you and partner open an RESP for child 1? We may also save for child 2.", "1c the person's own message: names become roles, and an everyday \"may\" stays");
    t.eq(back.payload.messages[1].content, "Yes, you may.", "1d text with no name is unchanged");
    t.ok(/you's Chequing/.test(back.payload.context) && /partner partner SAVINGS|partner you SAVINGS/.test(back.payload.context) && /child 1's RESP/.test(back.payload.context), "1e account names and goals carry roles, not names");
    t.eq(JSON.parse(P.coachRequestBody({ c: "Recent: TFR TO 0051234567 $500.00, Rent $1,500.00 on 2026-10-01" }, names)).c,
      "Recent: TFR TO ••••4567 $500.00, Rent $1,500.00 on 2026-10-01", "1f2 an account number in a transaction's description keeps only its last 4; amounts and dates stay");
    t.eq(P.coachRequestBody({ type: "x", payload: { prompt: "hi" } }, P.householdNames({})), JSON.stringify({ type: "x", payload: { prompt: "hi" } }), "1f no names entered: the body is unchanged");
    // Review of 2026-10-26: dates and everyday words survive; emails never go.
    const n2 = P.householdNames({ name: "Sarah Day", partnerName: "May Chen", kids: [{ name: "Penny" }] });
    t.eq(P.redactNames("Rent due May 1, a 30 day window. Sarah and May went out; SARAH DAY paid.", n2),
      "Rent due May 1, a 30 day window. you and partner went out; you paid.", "1h a month's name before a day stays a date, a surname that is a word stays a word unless written as a name");
    t.eq(JSON.parse(P.coachRequestBody({ m: "Email me at someone.else@example.com about it" }, n2)).m, "Email me at [email] about it", "1i an email address in any request string is masked, not only in statements");
    P.setCoachNames(profile);
    t.ok(!NAME_RX.test(P.coachRequestBody(body)), "1g the register App keeps from the profile is what coachRequestBody uses by default");
    P.setCoachNames(null);
  }

  // ── 2. Statement text ───────────────────────────────────────────────────────────────────────────
  {
    const statement = [
      "PRIYANKA OKAFOR-LINDQVIST  priyanka.ol@example.com",
      "Account number 05123-004 1234567   Card 4520 1234 5678 9012",
      "Statement period 2026-09-01 to 2026-09-30",
      "Opening balance $1,234.56",
      "09-03 09-04 ROGERS WIRELESS 85.20",
      "OCT 01 E-TRANSFER DESMOND 1 250,00 $",
      "Account 0051234567 closing balance 12 345 678,90",
    ].join("\n");
    const out = P.redactStatementText(statement, names);
    t.ok(!NAME_RX.test(out) && !/@/.test(out), "2a no name and no email address left");
    t.ok(!/\d{7,}/.test(out.replace(/[ \-]/g, "").replace(/2026\d{4}/g, "")) || !/1234567|567890 12|5678 9012|0051234567/.test(out), "2b no full account or card number left");
    t.ok(/••••4567/.test(out) && /••••9012/.test(out), "2c the last 4 digits stay, so a statement can still be told apart");
    t.ok(["$1,234.56", "2026-09-01", "2026-09-30", "09-03 09-04", "85.20", "1 250,00 $", "12 345 678,90", "OCT 01"].every((s) => out.includes(s)), "2d amounts (both formats) and dates are untouched");
  }

  // ── 3. App.jsx ──────────────────────────────────────────────────────────────────────────────────
  {
    const sites = [...APP.matchAll(/fetch\(`\$\{API_BASE\}\/api\/coach`/g)].map((m) => m.index);
    const bodies = sites.map((i) => APP.slice(i, i + 600).match(/body:\s*([A-Za-z.]+)\(/));
    t.ok(sites.length >= 6 && bodies.every((b) => b && b[1] === "coachRequestBody"), `3a all ${sites.length} requests to /api/coach are built by coachRequestBody`);
    t.ok(/redactStatementText\(safeText/.test(APP), "3b the statement text is redacted before it is sent");
    t.ok(/setCoachNames\(appData\?\.profile\)/.test(APP), "3c App keeps the names register current from the profile");
    const ctx = APP.slice(APP.indexOf("<UNTRUSTED_USER_DATA>\nUser profile:"), APP.indexOf("</UNTRUSTED_USER_DATA>", APP.indexOf("<UNTRUSTED_USER_DATA>\nUser profile:")));
    const kids = APP.slice(APP.indexOf("const kidsInfo"), APP.indexOf("const PRIMARY_TYPES"));
    t.ok(ctx.length > 200 && !/(sanitizeField\(|\$\{)\s*profile\.(name|partnerName)\b(?!\s*\?)/.test(ctx) && !/k\.name/.test(kids), "3d the coach context names no one: no profile name, partner name or child's name in it");
  }

  t.summary("coachPrivacy");
})();
