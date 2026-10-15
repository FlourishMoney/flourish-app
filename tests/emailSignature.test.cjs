// tests/emailSignature.test.cjs
// -----------------------------------------------------------------------------
// EVERY EMAIL IS SIGNED "Amanda, founder of flourish" (lowercase f; billing day, round 5).
//
// The brand is written lowercase. Every email this repository sends ends with the same signature line:
// the welcome email, the founding link email, the Canada launch email and the confirmation email. Pinned
// on the built messages themselves, and on the source, so a new email cannot bring back "Flourish" in the
// signature.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SIGNATURE = "Amanda, founder of flourish";

(() => {
  const t = create();
  const saved = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "test-service-role";
  delete process.env.WAITLIST_UNSUBSCRIBE_SECRET;
  const ID = "3b1f7e20-5c44-4b1e-9a77-0c2d6e8f1a23";

  const built = [];
  const W = require("../netlify/functions/_lib/waitlistWelcome.js");
  built.push(["the welcome email", W.welcomeEmailPayload("a@example.test", ID, 7)]);
  built.push(["the welcome email, no founding line", W.welcomeEmailPayload("a@example.test", ID, null)]);
  const E = require("../netlify/functions/_lib/foundingLinkEmail.js");
  built.push(["the founding link email", E.foundingLinkEmailPayload("a@example.test", { id: ID, founding_position: 7, is_test: false, unsubscribed_at: null, consent_version: "2026-10-06" })]);
  built.push(["the Canada launch email", E.foundingLinkEmailPayload("a@example.test", { id: ID, founding_position: 2, is_test: false, unsubscribed_at: null, consent_version: "pre-2026-10-01" }, { launched: true })]);
  const F = require("../netlify/functions/_lib/foundingConfirm.js");
  built.push(["the confirmation email", F.foundingConfirmEmailPayload("a@example.test", "https://flourishmoney.app/api/founding-confirm?u=x&x=1&t=y")]);

  for (const [name, payload] of built) {
    t.ok(!!payload, `(${name} was built)`);
    if (!payload) continue;
    const paras = payload.text.split("\n\n");
    t.ok(paras.includes(SIGNATURE), `1a ${name} is signed "${SIGNATURE}"`);
    t.ok(!/founder of Flourish/.test(payload.text + payload.html), `1b ${name} never says "founder of Flourish"`);
    t.ok(payload.html.includes(SIGNATURE), `1c …in its html too`);
  }

  // The source: every signature line in the functions is the lowercase one.
  const fnDir = path.join(REPO, "netlify", "functions");
  const files = [...fs.readdirSync(fnDir).filter(f => f.endsWith(".js")).map(f => path.join(fnDir, f)),
    ...fs.readdirSync(path.join(fnDir, "_lib")).filter(f => f.endsWith(".js")).map(f => path.join(fnDir, "_lib", f))];
  const wrong = files.filter(f => /founder of Flourish/.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(REPO, f));
  t.eq(wrong, [], "2a no function in the repository signs \"founder of Flourish\"");

  process.env = saved;
  t.summary("emailSignature.test");
})();
