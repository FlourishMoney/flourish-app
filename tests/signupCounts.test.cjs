// tests/signupCounts.test.cjs
// -----------------------------------------------------------------------------
// WAITLIST SIGNUPS BY SOURCE AND BY DAY, COUNTS ONLY (migration 0018, 2026-10-15).
//   1. Every source in WAITLIST_SRCS is reported (meta_a and meta_b included), plus "direct", and a null,
//      blank or unknown source counts as "direct" instead of being dropped.
//   2. Rows marked is_test are left out of every figure; their count is a separate function.
//   3. The output is a day, a source from the fixed list and a count. No email, name, metadata or any
//      free-text field is read into it or returned.
//   4. Only the service role may run it.
// The SQL is checked by its text here (CI has no Postgres); it was run for real on the Supabase Postgres
// image, with the results in the PR.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const RAW = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "0018_waitlist_signup_counts.sql"), "utf8");
const SQL = RAW.replace(/--.*$/gm, " ");
const { WAITLIST_SRCS } = require("../netlify/functions/_lib/waitlistConsent");

(async () => {
  const t = create();
  const fn = SQL.slice(SQL.indexOf("function public.waitlist_signup_counts("), SQL.indexOf("$$;", SQL.indexOf("function public.waitlist_signup_counts(")));
  const listed = [...(/values\s*([\s\S]*?)\),\s*days/.exec(fn) || ["", ""])[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  t.eq([...listed].sort(), ["direct", ...WAITLIST_SRCS].sort(), "1a the report lists every WAITLIST_SRCS value and \"direct\", no more and no fewer");
  t.ok(listed.includes("meta_a") && listed.includes("meta_b"), "1b …meta_a and meta_b included");
  t.ok(/case when lower\(trim\(coalesce\(w\.source, ''\)\)\) in \(select source from sources\)\s+then lower\(trim\(w\.source\)\) else 'direct' end as source/.test(fn),
    "1c a null, blank or unrecognised source is counted as direct, not dropped");
  t.ok(/cross join sources s/.test(fn) && /left join rows_ r/.test(fn) && /count\(r\.day\)::integer as signups/.test(fn), "1d every day and every source gets a row, zeros included");
  t.ok(/where not w\.is_test/.test(fn), "2a test rows are left out of every figure");
  t.ok(/function public\.waitlist_test_row_count\(\)[\s\S]*select count\(\*\)::integer from public\.waitlist where is_test;/.test(SQL), "2b …and counted separately");
  t.ok(/returns table \(day date, source text, signups integer\)/.test(fn), "3a it returns a day, a source and a count, nothing else");
  const read = (fn.match(/w\.([a-z_]+)/g) || []).map(x => x.slice(2));
  t.eq([...new Set(read)].sort(), ["created_at", "is_test", "source"], "3b the only waitlist columns it reads are created_at, source and is_test");
  // Quoted literals are the fixed source names ('email' is a campaign source, not an address column).
  t.ok(!/email|metadata|name|consent|unsubscribe|founding_position/i.test(fn.replace(/search_path/g, "").replace(/'[^']*'/g, "")), "3c no email, name, metadata or other row field is referenced");
  t.ok(/stable/.test(fn) && !/\b(insert|update|delete|truncate|alter|drop)\b/i.test(SQL.replace(/revoke all|grant execute/g, "")), "3d read-only: nothing is inserted, changed or dropped");
  for (const f of ["waitlist_signup_counts(date, date)", "waitlist_test_row_count()"]) {
    const e = f.replace(/[()]/g, "\\$&");
    t.ok(new RegExp(`revoke all on function public\\.${e} from public, anon, authenticated;`).test(SQL) && new RegExp(`grant execute on function public\\.${e} to service_role;`).test(SQL),
      `4a explicit grants: ${f}, service role only`);
  }
  t.ok(/at time zone 'America\/Toronto'/.test(fn), "1e days are Toronto days, so a signup at 11 pm ET is not counted as tomorrow");
  t.summary("signupCounts.test");
})();
