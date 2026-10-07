// tests/sentryNoise.test.cjs
// -----------------------------------------------------------------------------
// SENTRY CAPACITOR-8: Facebook's in-app browser injects code that calls window.webkit.messageHandlers and
// throws "undefined is not an object (evaluating 'window.webkit.messageHandlers')". That event is dropped
// only when no frame of its stack is from our own bundle. The same text from our own code is reported.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const MSG = "undefined is not an object (evaluating 'window.webkit.messageHandlers')";
const ev = (value, files) => ({ exception: { values: [{ type: "TypeError", value,
  ...(files === null ? {} : { stacktrace: { frames: files.map(f => (f === undefined ? {} : { filename: f })) } }) }] } });

(async () => {
  const t = create();
  const R = await import("../src/lib/errorReporting.js");

  // ── 1. injected code: dropped ──────────────────────────────────────────────────────────────
  for (const [files, why] of [
    [["<anonymous>"], "an anonymous injected frame"],
    [["https://flourishmoney.app/", undefined, "[native code]"], "the page itself, a frame with no file, native code"],
    [["https://connect.facebook.net/en_US/iab.autofill.js"], "Facebook's own script"],
    [[], "an empty stack"],
    [null, "no stack at all"],
  ]) {
    t.eq(R.beforeSendEvent(ev(MSG, files)), null, `1a dropped: the injected error with ${why}`);
  }
  t.eq(R.beforeSendEvent(ev("undefined is not an object (evaluating 'window.webkit.messageHandlers.fbq.postMessage')", ["<anonymous>"])), null,
    "1b dropped: the longer form of the same message");

  // ── 2. our own code: reported ──────────────────────────────────────────────────────────────
  for (const file of ["https://flourishmoney.app/assets/App-KForm0Vl.js", "capacitor://localhost/assets/index-lQGQmbL8.js",
    "https://localhost/assets/App-abc123.js", "https://deploy-preview-64--flourish-money.netlify.app/assets/App-x1.js",
    "http://localhost:5173/src/App.jsx?t=1"]) {
    const out = R.beforeSendEvent(ev(MSG, ["<anonymous>", file]));
    t.ok(out && out.exception.values[0].value === MSG, `2a reported: the same text with a frame from our bundle (${file.replace(/^.*\/\//, "")})`);
  }
  const other = R.beforeSendEvent(ev("TypeError: x is undefined", null));
  t.ok(other && other.exception.values[0].value === "TypeError: x is undefined", "2b reported: any other error, stack or not");
  const msgOnly = R.beforeSendEvent({ message: "Coach request failed" });
  t.ok(msgOnly && msgOnly.message === "Coach request failed", "2c reported: a message event");

  // ── 3. reported events are still scrubbed, and Sentry is wired to this ────────────────────
  const scrubbed = R.beforeSendEvent({ ...ev("charge of $1,944.00 failed for a@b.co", ["https://flourishmoney.app/assets/App-1.js"]), user: { id: "u1", email: "a@b.co" } });
  t.eq([scrubbed.exception.values[0].value, scrubbed.user], ["charge of $[amt] failed for [email]", { id: "u1" }], "3a a reported event still has its amounts, emails and user details scrubbed");
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "errorReporting.js"), "utf8");
  t.ok(/beforeSend: beforeSendEvent,/.test(src) && !/beforeSend: scrubPII,/.test(src), "3b Sentry.init uses beforeSendEvent");

  t.summary("sentryNoise.test");
})();
