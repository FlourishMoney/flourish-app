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
// THE ONE EXEMPTION: "-- grants: service_role only"
// A table nobody signed in should ever read (a payment event ledger, say) is worse off with a
// uniform authenticated grant than without one: "harmless because RLS has no policy" stops being
// true the day someone adds a permissive policy. Such a migration may skip the authenticated
// grant by carrying that marker — but only if it earns it. All four must hold, or the migration
// is an offender exactly as if it were unmarked:
//   1. the marker is present in the file
//   2. every table it creates grants service_role
//   3. every table it creates has row level security enabled
//   4. it grants NOTHING on those tables to anon or authenticated
// Keyed on FILE CONTENT, never on a filename: a filename list is the thing this file exists to
// prevent, and the marker has to be a claim the migration makes about itself, checked against
// what it actually does.
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

// The marker lives in a COMMENT, so it is read from the raw source — before stripSql removes it.
const MARKER = /^[ \t]*--[ \t]*grants:[ \t]*service_role only[ \t]*$/im;
const rlsRe = table => new RegExp(
  "alter\\s+table\\s+(?:if\\s+exists\\s+)?\"?public\"?\\s*\\.\\s*\"?" + table +
  "\"?\\s+enable\\s+row\\s+level\\s+security", "is");

/**
 * Every reason this migration's tables are not properly granted. [] means it is fine.
 * Pure: takes the file's raw text, so the fixtures below exercise the same code the real
 * migrations do.
 */
function grantViolations(file, raw) {
  const sql = stripSql(raw);
  const tables = [...new Set([...sql.matchAll(CREATE)].map(m => m[1]))];
  if (!tables.length) return [];
  const out = [];
  const marked = MARKER.test(raw);
  for (const tbl of tables) {
    if (!marked) {
      const missing = ["authenticated", "service_role"].filter(role => !grantRe(tbl, role).test(sql));
      if (missing.length) out.push(`${file}: public.${tbl} has no grant to ${missing.join(" or ")}`);
      continue;
    }
    // Marked: the exemption is earned, not asserted.
    if (!grantRe(tbl, "service_role").test(sql))
      out.push(`${file}: public.${tbl} is marked service_role only but never grants service_role`);
    if (!rlsRe(tbl).test(sql))
      out.push(`${file}: public.${tbl} is marked service_role only but does not enable row level security`);
    for (const role of ["anon", "authenticated"])
      if (grantRe(tbl, role).test(sql))
        out.push(`${file}: public.${tbl} is marked service_role only but grants ${role}`);
  }
  return out;
}

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
    const raw = fs.readFileSync(path.join(DIR, f), "utf8");
    const tables = [...new Set([...stripSql(raw).matchAll(CREATE)].map(m => m[1]))];
    if (!tables.length) continue;
    if (GRANDFATHERED.includes(f)) { checked.push(`${f} (grandfathered: ${tables.join(", ")})`); continue; }
    const bad = grantViolations(f, raw);
    if (bad.length) offenders.push(...bad);
    else checked.push(`${f} (${tables.map(x => "public." + x).join(", ")}${MARKER.test(raw) ? ", service_role only" : ""} granted)`);
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

  // ── 5. The marker is a claim, and the claim is checked ───────────────────────────────────────
  // Synthetic migrations, never written to supabase/migrations. Each isolates ONE missing
  // condition; if the audit stopped checking that condition, exactly one of these goes quiet.
  {
    const MARK = "-- grants: service_role only\n";
    const TABLE = 'create table if not exists public.ledger (id text primary key);\n';
    const RLS = "alter table public.ledger enable row level security;\n";
    const SR = "grant all privileges on table public.ledger to service_role;\n";

    const good = MARK + TABLE + RLS + SR;
    t.eq(grantViolations("good.sql", good).join(" | ") || "(none)", "(none)",
      "5a a marked migration that grants service_role, enables RLS and grants nobody else is accepted");

    const noService = MARK + TABLE + RLS;
    t.ok(/never grants service_role/.test(grantViolations("a.sql", noService).join(" | ")),
      "5b …marked but no service_role grant is caught — the marker cannot exempt a table from every grant");

    const noRls = MARK + TABLE + SR;
    t.ok(/does not enable row level security/.test(grantViolations("b.sql", noRls).join(" | ")),
      "5c …marked without row level security is caught — no RLS and no grant is an open table the day a policy appears");

    const grantsAuthed = MARK + TABLE + RLS + SR + "grant select on table public.ledger to authenticated;\n";
    t.ok(/grants authenticated/.test(grantViolations("c.sql", grantsAuthed).join(" | ")),
      "5d …marked yet granting authenticated anyway is caught — the file must mean what it claims");

    const grantsAnon = MARK + TABLE + RLS + SR + "grant select on table public.ledger to anon;\n";
    t.ok(/grants anon/.test(grantViolations("d.sql", grantsAnon).join(" | ")),
      "5e …and the same for anon");

    const unmarked = TABLE + RLS + SR;
    t.ok(/has no grant to authenticated/.test(grantViolations("e.sql", unmarked).join(" | ")),
      "5f an UNMARKED migration still has to grant authenticated — the exemption is opt-in, not the default");

    // The marker is content, not a filename: the same text in a differently-named file behaves
    // identically, and a lookalike comment does not open the exemption.
    t.eq(grantViolations("0010_billing_events.sql", noService).length, 1,
      "5g the audit reads the file's content, not its name");
    const lookalike = "-- grants: service_role only-ish\n" + TABLE + RLS + SR;
    t.ok(/has no grant to authenticated/.test(grantViolations("f.sql", lookalike).join(" | ")),
      "5h a comment that merely resembles the marker does not open the exemption");
    const realFile = fs.readFileSync(path.join(DIR, "0010_billing_events.sql"), "utf8");
    t.eq(grantViolations("0010_billing_events.sql", realFile).join(" | ") || "(none)", "(none)",
      "5i the real 0010 earns its exemption: service_role granted, RLS on, nothing to anon or authenticated");
    t.eq(GRANDFATHERED.includes("0010_billing_events.sql"), false,
      "5j …and it is NOT grandfathered — the frozen list is still 5");
  }

  t.summary("supabaseGrants.test");
})();
