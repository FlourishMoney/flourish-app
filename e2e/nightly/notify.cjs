// e2e/nightly/notify.cjs
// -----------------------------------------------------------------------------
// ONE EMAIL WHEN THE NIGHTLY TEST FAILS (e2e/nightly/README.md): to hello@flourishmoney.app, naming the device and
// the step that broke, with a link to the run and its pictures. Sent through Resend with a key kept only as the
// repository secret NIGHTLY_RESEND_API_KEY (a sending-only key). No key, no email: it says so and ends 1, so the
// run's log shows the alert did not go out.
// usage: node e2e/nightly/notify.cjs <out dir>     env: NIGHTLY_RESEND_API_KEY, E2E_RUN_URL
// -----------------------------------------------------------------------------
"use strict";
const fs = require("fs");
const path = require("path");

const TO = "hello@flourishmoney.app";
const FROM = "flourish nightly test <hello@flourishmoney.app>";

/** The email for a failure.json, or for a run that died before it could write one. */
function compose(failure, runUrl) {
  const f = failure || { device: "the run", step: "the test did not get as far as its first step", message: "No step was recorded. The log has the reason.", others: [], passed: [] };
  const subject = `flourish nightly test FAILED: ${f.step} (${f.device})`;
  const lines = [
    `The nightly end-to-end test failed.`,
    ``,
    `Step that broke: ${f.step}`,
    `On: ${f.device}`,
    `What happened: ${f.message}`,
    ...(f.others && f.others.length ? [``, `Also failed: ${f.others.join("; ")}`] : []),
    ...(f.passed && f.passed.length ? [``, `Passed: ${f.passed.join(", ")}`] : []),
    ``,
    `The run, with a picture of every step: ${runUrl || "(no link was given)"}`,
    ``,
    `This test uses a throwaway database and Plaid's sandbox. No real account or bank is involved.`,
  ];
  return { subject, text: lines.join("\n") };
}

async function main() {
  const out = path.resolve(process.argv[2] || path.join(__dirname, "output"));
  let failure = null;
  try { failure = JSON.parse(fs.readFileSync(path.join(out, "failure.json"), "utf8")); } catch { /* the run died early */ }
  const { subject, text } = compose(failure, process.env.E2E_RUN_URL);
  const key = process.env.NIGHTLY_RESEND_API_KEY;
  if (!key) { console.error(`✗ NOT SENT: the repository secret NIGHTLY_RESEND_API_KEY is not set. The email would have been:\n  ${subject}`); process.exit(1); }
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [TO], subject, text }) });
  if (!res.ok) { console.error(`✗ NOT SENT: Resend answered ${res.status}`); process.exit(1); }
  console.log(`✓ one email sent to ${TO}: ${subject}`);
}

module.exports = { compose, TO };
if (require.main === module) main().catch((e) => { console.error(`✗ NOT SENT: ${e && e.message}`); process.exit(1); });
