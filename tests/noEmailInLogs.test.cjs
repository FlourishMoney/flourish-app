// tests/noEmailInLogs.test.cjs
// -----------------------------------------------------------------------------
// NO RAW EMAIL ADDRESS IN ANY LOG LINE (2026-10-26, from Grok's review of e94b112).
//
// beta.js (an orphaned beta seat) and plaid.js (delete_account) wrote the household's address into the log, twice
// each, inside a manual-cleanup SQL line. They now name it by the database's own key for an address
// (_lib/logSafe.js, the same md5 as 0014's public.waitlist_email_key), so the SQL still finds the row.
//   1  no console call in netlify/functions or src interpolates or passes an address
//   2  the cleanup lines use the key, and the key is the database's
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? (d.name === "node_modules" ? [] : walk(p)) : /\.(c?js|jsx|mjs)$/.test(d.name) ? [p] : [];
});
// An address-shaped identifier: email, emailAddr, addr, fEmail, toAddr, recipient, user.email, u.user.email…
const ADDR = /(?:^|[^A-Za-z_.])((?:[A-Za-z_$][\w$]*\.)*(?:e?mail|email[A-Z]\w*|[a-z]+Email|addr|emailAddr|toAddr|recipient))\b/;

(async () => {
  const t = create();
  const files = [...walk(path.join(REPO, "netlify", "functions")), ...walk(path.join(REPO, "src"))];
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = /console\.(log|error|warn|info)\((.*)$/.exec(line);
      if (!m) return;
      const args = m[2];
      // Inside ${…} in a template, or a bare argument after a comma.
      const interp = [...args.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]).filter((x) => ADDR.test(" " + x) && !/emailRef\(|emailKey\(/.test(x));
      const bare = args.split(",").slice(1).map((s) => s.trim().replace(/\).*$/, "")).filter((s) => /^[\w$.]+$/.test(s) && ADDR.test(" " + s));
      if (interp.length || bare.length) hits.push(`${path.relative(REPO, f)}:${i + 1}: ${[...interp, ...bare].join(", ")}`);
    });
  }
  t.ok(files.length > 50, `1a (${files.length} files scanned)`);
  t.eq(hits, [], "1b no console call writes an address (interpolated or passed)");

  const { emailKey, emailRef } = require("../netlify/functions/_lib/logSafe.js");
  const sqlKey = (e) => crypto.createHash("md5").update(String(e).replace(/\s+/g, "").toLowerCase()).digest("hex");
  t.eq(emailKey(" Someone@Example.COM "), sqlKey("someone@example.com"), "2a the key is the database's (md5 of the address without case or whitespace)");
  t.ok(/^email_key [0-9a-f]{32}$/.test(emailRef("a@b.c")) && emailRef("") === "no_email", "2b a log line names the key, never the address");
  for (const f of ["beta.js", "plaid.js"]) {
    const src = fs.readFileSync(path.join(REPO, "netlify", "functions", f), "utf8");
    const cleanup = src.split("\n").filter((l) => /manual cleanup: delete from public\.beta_signups/.test(l));
    t.ok(cleanup.length > 0 && cleanup.every((l) => /where public\.waitlist_email_key\(email\) = '\$\{emailKey\(email\)\}'/.test(l) && /\$\{emailRef\(email\)\}/.test(l)),
      `2c ${f}: its manual-cleanup lines find the row by the key (${cleanup.length})`);
  }
  t.summary("noEmailInLogs");
})();
