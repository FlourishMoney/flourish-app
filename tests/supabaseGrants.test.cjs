// tests/supabaseGrants.test.cjs
// -----------------------------------------------------------------------------
// A NEW PUBLIC TABLE WITHOUT GRANTS IS INVISIBLE TO THE APP.
//
// From 2026-10-30 Supabase stops auto-granting Data API access to newly created
// tables in the public schema. A migration written after that date that creates a
// table and does not grant it reaches PostgREST as an empty result, not as a
// permission error — in production, in a preview branch, and in anyone's local
// `supabase db reset`. The rules are in docs/ops/SUPABASE-GRANTS.md.
//
// GRANDFATHERED MIGRATIONS
// The ten migrations already in main carry no table grants, and must not gain any.
// They are applied in production, their tables keep the access Supabase auto-granted
// at the time, and rewriting an applied migration breaks the migration history. They
// are listed by name below. The list is frozen: it may shrink (if a migration is ever
// deleted) but a new file cannot be added to it to silence this test — that is the
// one thing this file exists to prevent.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "migrations");

// Applied to production before the 2026-10-30 change. Do not add to this list.
const GRANDFATHERED = [
  "00000_waitlist.sql",
  "00001_plaid_items.sql",
  "0001_profiles.sql",
  "0005_z3_ai_consent_beta_seats.sql",
  "0008_coach_usage_weekly.sql",
];

// `create table [if not exists] public.<name>` / `"public"."<name>"`, comments stripped.
const CREATE = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?public"?\s*\.\s*"?([a-z0-9_]+)"?/gi;
const grantRe = (table, role) => new RegExp(
  "grant\\s+[^;]*?\\son\\s+(?:table\\s+)?\"?public\"?\\s*\\.\\s*\"?" + table + "\"?\\s[^;]*?\\b" + role + "\\b", "is");

const stripSql = src => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")          // block comments
  .replace(/^\s*--.*$/gm, " ")                // whole-line comments
  .replace(/--.*$/gm, " ");                   // trailing comments

(async () => {
  const t = create();
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();
  t.ok(files.length >= 10, `1a found the migrations (${files.length} .sql files)`);

  // ── 1. The grandfather list is real and frozen ───────────────────────────────────────────────
  for (const g of GRANDFATHERED) {
    t.ok(files.includes(g), `1b grandfathered migration ${g} still exists`);
  }
  t.eq(GRANDFATHERED.length, 5, "1c the grandfather list still holds exactly the 5 pre-cutoff migrations");

  // ── 2. Every migration that creates a public table grants it ─────────────────────────────────
  const offenders = [], checked = [];
  for (const f of files) {
    const sql = stripSql(fs.readFileSync(path.join(DIR, f), "utf8"));
    const tables = [...sql.matchAll(CREATE)].map(m => m[1]);
    if (!tables.length) continue;
    if (GRANDFATHERED.includes(f)) { checked.push(`${f} (grandfathered: ${tables.join(", ")})`); continue; }
    for (const tbl of new Set(tables)) {
      const missing = ["authenticated", "service_role"].filter(role => !grantRe(tbl, role).test(sql));
      if (missing.length) offenders.push(`${f}: public.${tbl} has no grant to ${missing.join(" or ")}`);
      else checked.push(`${f} (public.${tbl} granted)`);
    }
  }
  t.eq(offenders.join(" | ") || "(none)", "(none)",
    "2a every non-grandfathered migration that creates a public table grants authenticated and service_role");
  t.ok(checked.length >= 5, `2b …across ${checked.length} table-creating migration(s)`);

  // ── 3. The anon rule, mechanically ───────────────────────────────────────────────────────────
  // anon may be granted SELECT and nothing else. insert/update/delete/all to anon is a grant to
  // anyone holding the publishable key, which ships in the web bundle and both native builds.
  const anonViolations = [];
  for (const f of files) {
    const sql = stripSql(fs.readFileSync(path.join(DIR, f), "utf8"));
    for (const stmt of sql.split(";")) {
      if (!/\bgrant\b/i.test(stmt) || !/\banon\b/i.test(stmt)) continue;
      if (!/\son\s+(?:table\s+)?"?public"?\s*\./i.test(stmt)) continue;   // function grants are separate
      const verbs = (stmt.match(/\b(select|insert|update|delete|truncate|references|trigger|all)\b/gi) || [])
        .map(v => v.toLowerCase());
      const bad = verbs.filter(v => v !== "select");
      if (bad.length) anonViolations.push(`${f}: anon granted ${[...new Set(bad)].join(", ")}`);
    }
  }
  t.eq(anonViolations.join(" | ") || "(none)", "(none)", "3a anon is never granted anything but select on a public table");

  // ── 4. The rule is written down where the next person will look ──────────────────────────────
  const doc = path.join(__dirname, "..", "docs", "ops", "SUPABASE-GRANTS.md");
  t.ok(fs.existsSync(doc), "4a docs/ops/SUPABASE-GRANTS.md exists");
  const text = fs.readFileSync(doc, "utf8");
  t.ok(/2026-10-30/.test(text), "4b …and names the date the auto-grant stops");
  t.ok(/to authenticated;/.test(text) && /to service_role;/.test(text), "4c …and carries the block to paste");

  t.summary("supabaseGrants.test");
})();
