// tests/reviewPrompt.test.cjs
// -----------------------------------------------------------------------------
// THE STORE REVIEW ASK: WHEN IT MAY HAPPEN, AND THAT NOTHING ELSE HAPPENS AROUND IT.
//
// 1. The rules (reviewRules.js), driven with a fake clock: the third separate day on Today, or a
//    finished check-in, whichever is first; never within 24 hours of trouble; once per 120 days;
//    never on the web or in demo mode.
// 2. The wrapper (reviewPrompt.js) on the web does nothing at all, not even write its record.
// 3. The wiring in the app: trouble is noted where things go wrong, the two triggers sit where the
//    brief puts them, the plugin is called from one place only, and no screen of Flourish's own
//    stands in front of the store's sheet.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const R = await import("../src/lib/reviewRules.js");
  const { decideReviewAsk, withTodayOpen, withTrouble, withAsked, normalizeReviewState, emptyReviewState, localDayKey, REVIEW_TRIGGERS: T } = R;

  const at = (s) => new Date(s);                           // local wall-clock time
  const days = (n) => n * 24 * 60 * 60 * 1000;
  const ask = (state, trigger, now, extra = {}) => decideReviewAsk({ state, trigger, now, native: true, demo: false, ...extra });
  const openOn = (state, ...stamps) => stamps.reduce((s, x) => withTodayOpen(s, at(x)), state);

  // ── 1a. The constants the brief sets ──────────────────────────────────────────────────────────
  t.eq(R.REVIEW_COOLDOWN_DAYS, 120, "the cooldown is 120 days");
  t.eq(R.TODAY_DAYS_TO_ASK, 3, "Today must be opened on 3 separate days");

  // ── 1b. The third separate day on Today ───────────────────────────────────────────────────────
  {
    let s = emptyReviewState();
    s = openOn(s, "2026-10-01T09:00:00");
    t.eq(ask(s, T.TODAY_OPEN, at("2026-10-01T09:00:00")), { ask: false, reason: "not_yet" }, "day 1: no ask");
    s = openOn(s, "2026-10-01T13:00:00", "2026-10-01T22:30:00");
    t.eq(s.todayDays.length, 1, "opening Today three times on one day is still one day");
    t.eq(ask(s, T.TODAY_OPEN, at("2026-10-01T22:30:00")).ask, false, "…and does not ask");
    s = openOn(s, "2026-10-03T08:00:00");
    t.eq(ask(s, T.TODAY_OPEN, at("2026-10-03T08:00:00")), { ask: false, reason: "not_yet" }, "day 2 (not consecutive): no ask");
    s = openOn(s, "2026-10-09T19:00:00");
    t.eq(ask(s, T.TODAY_OPEN, at("2026-10-09T19:00:00")), { ask: true, reason: "third_day" }, "the third separate day asks");
  }
  {
    // Separate days are the person's calendar days: 11pm and 1am are two, not one.
    const s = openOn(emptyReviewState(), "2026-10-01T23:00:00", "2026-10-02T01:00:00", "2026-10-02T23:59:00");
    t.eq(s.todayDays, ["2026-10-01", "2026-10-02"], "11pm and 1am are two days; 1am and 11:59pm the next night are one");
    t.eq(localDayKey(at("2026-10-02T00:00:01")), "2026-10-02", "the day key is local, not UTC");
  }

  // ── 1c. A finished check-in asks at once, whichever comes first ───────────────────────────────
  {
    const s = openOn(emptyReviewState(), "2026-10-01T09:00:00");
    t.eq(ask(s, T.CHECKIN_DONE, at("2026-10-01T09:10:00")), { ask: true, reason: "checkin_done" }, "a check-in finished on day 1 asks without waiting for day 3");
    const after = withAsked(s, at("2026-10-01T09:10:00"));
    const later = openOn(after, "2026-10-02T09:00:00", "2026-10-03T09:00:00", "2026-10-04T09:00:00");
    t.eq(ask(later, T.TODAY_OPEN, at("2026-10-04T09:00:00")), { ask: false, reason: "cooldown" }, "…and then the third day does not ask again: whichever came first used the ask");
  }

  // ── 1d. At most once per 120 days ─────────────────────────────────────────────────────────────
  {
    const asked = withAsked(emptyReviewState(), at("2026-10-01T09:00:00"));
    t.eq(asked.todayDays, [], "asking resets the day count");
    t.eq(ask(asked, T.CHECKIN_DONE, new Date(at("2026-10-01T09:00:00").getTime() + days(119))).reason, "cooldown", "119 days later: still no");
    t.eq(ask(asked, T.CHECKIN_DONE, new Date(at("2026-10-01T09:00:00").getTime() + days(120))).ask, true, "120 days later: a check-in may ask again");
    // After the cooldown the day trigger needs three NEW days, not the old ones.
    const d120 = at("2026-10-01T09:00:00").getTime() + days(120);
    const one = withTodayOpen(asked, new Date(d120));
    t.eq(ask(one, T.TODAY_OPEN, new Date(d120)).reason, "not_yet", "after the cooldown, one new day on Today is not enough");
    // A clock set backwards is not 120 days.
    t.eq(ask(asked, T.CHECKIN_DONE, at("2026-09-01T09:00:00")).reason, "cooldown", "a clock set before the last ask waits");
    // A corrupt ask time must not unlock an early ask.
    const junk = normalizeReviewState({ lastAskedAt: "not a date", todayDays: ["2026-10-01", "2026-10-02", "2026-10-03"] });
    t.ok(!!junk.lastAskedAt, "an unreadable ask time reads as asked, not as never asked");
    t.eq(ask(junk, T.TODAY_OPEN, new Date()).reason, "cooldown", "…so it does not ask");
  }

  // ── 1e. Never after trouble ───────────────────────────────────────────────────────────────────
  {
    const ready = openOn(emptyReviewState(), "2026-10-01T09:00:00", "2026-10-02T09:00:00", "2026-10-03T09:00:00");
    const hurt = withTrouble(ready, at("2026-10-03T08:55:00"));
    t.eq(ask(hurt, T.TODAY_OPEN, at("2026-10-03T09:00:00")), { ask: false, reason: "recent_trouble" }, "an error five minutes ago: the third day does not ask");
    t.eq(ask(hurt, T.CHECKIN_DONE, at("2026-10-03T09:00:00")).reason, "recent_trouble", "…nor does a finished check-in");
    t.eq(ask(hurt, T.CHECKIN_DONE, at("2026-10-04T08:54:00")).reason, "recent_trouble", "23h59m later: still no");
    t.eq(ask(hurt, T.CHECKIN_DONE, at("2026-10-04T08:56:00")).ask, true, "24 hours on, a good moment may ask");
  }

  // ── 1f. Web, demo, and anything that is not one of the two moments ────────────────────────────
  {
    const ready = openOn(emptyReviewState(), "2026-10-01T09:00:00", "2026-10-02T09:00:00", "2026-10-03T09:00:00");
    t.eq(decideReviewAsk({ state: ready, trigger: T.TODAY_OPEN, now: at("2026-10-03T09:00:00"), native: false, demo: false }), { ask: false, reason: "web" }, "the web never asks");
    t.eq(ask(ready, T.CHECKIN_DONE, at("2026-10-03T09:00:00"), { demo: true }), { ask: false, reason: "demo" }, "demo mode never asks");
    for (const bad of ["app_open", "bank_linked", "coach_reply", "", undefined]) {
      t.eq(ask(ready, bad, at("2026-10-03T09:00:00")).ask, false, `no ask on any other moment (${JSON.stringify(bad)})`);
    }
    t.eq(normalizeReviewState("garbage"), emptyReviewState(), "a junk record reads as empty");
  }

  // ── 2. The wrapper on the web does nothing ────────────────────────────────────────────────────
  {
    const store = {};
    global.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    const P = await import("../src/lib/reviewPrompt.js");
    const r1 = await P.reviewOnTodayOpen();
    const r2 = await P.reviewOnCheckInDone();
    P.noteReviewTrouble();
    t.eq([r1.reason, r2.reason], ["web", "web"], "web: neither trigger asks");
    t.eq(Object.keys(store), [], "web: nothing is written, not even the day count");

    // On a native shell the ask is recorded before the plugin is called, so a crash mid-sheet
    // cannot lead to a second ask. (The plugin itself cannot run in node; the wrapper swallows that.)
    global.window.Capacitor = { isNativePlatform: () => true };
    const r3 = await P.reviewOnCheckInDone({ now: at("2026-10-05T10:00:00") });
    t.eq(r3, { ask: true, reason: "checkin_done" }, "native: a finished check-in asks");
    const rec = JSON.parse(store[P.REVIEW_STORAGE_KEY]);
    t.eq(rec.lastAskedAt, at("2026-10-05T10:00:00").toISOString(), "…and the ask is on record");
    const r4 = await P.reviewOnCheckInDone({ now: at("2026-10-06T10:00:00") });
    t.eq(r4.reason, "cooldown", "…so the next check-in does not ask again");
    P.noteReviewTrouble(at("2026-10-06T11:00:00"));
    t.eq(JSON.parse(store[P.REVIEW_STORAGE_KEY]).lastTroubleAt, at("2026-10-06T11:00:00").toISOString(), "native: trouble is recorded");
    delete global.window;
  }

  // ── 3. The wiring ─────────────────────────────────────────────────────────────────────────────
  {
    const REPO = path.join(__dirname, "..");
    const app = fs.readFileSync(path.join(REPO, "src", "App.jsx"), "utf8");
    const er = fs.readFileSync(path.join(REPO, "src", "lib", "errorReporting.js"), "utf8");

    t.ok(/export function captureError\(err, context = \{\}\) \{\s*noteReviewTrouble\(\);\s*if \(!_sentry\) return;/.test(er),
         "every captured error notes trouble, before the Sentry check, so it holds with no DSN");
    t.ok(/onExit: \(err, meta\) => \{ if \(err\) \{[^}]*noteReviewTrouble\(\);/.test(app), "a bank link that exits with an error notes trouble");
    t.ok(/if\(res\.status === 429\)\{\s*noteReviewTrouble\(\);/.test(app), "a refused coach chat message notes trouble");
    t.ok(/useEffect\(\(\) => \{ if \(meetError\) noteReviewTrouble\(\); \}, \[meetError\]\);/.test(app), "a refused or failed meeting message notes trouble");

    const todayCalls = app.match(/reviewOnTodayOpen\(/g) || [];
    t.eq(todayCalls.length, 1, "Today-open asks from exactly one place");
    t.ok(/if \(screen !== "home" \|\| !onboarded \|\| showSettings\) return;\s*const t = setTimeout\(\(\) => \{ reviewOnTodayOpen\(\{ demo: !!appData\?\.demo \}\); \}, 2500\);\s*return \(\) => clearTimeout\(t\);/.test(app),
         "…only while Today is the screen, after a pause, cancelled if they leave");
    const checkCalls = app.match(/reviewOnCheckInDone\(/g) || [];
    t.eq(checkCalls.length, 1, "check-in asks from exactly one place");
    t.ok(/<WeeklyCheckInModal data=\{appData\|\|\{\}\} onClose=\{\(\)=>setShowCheckIn\(false\)\} onComplete=\{\(pts\)=>\{setCheckInBonus\(prev=>Math\.min\(20,prev\+pts\)\);setShowCheckIn\(false\);reviewOnCheckInDone\(\{demo:!!appData\?\.demo\}\);\}\}\/>/.test(app),
         "…the moment the weekly check-in is finished (its Done button), with the score bonus unchanged");

    // The plugin is called from one file, and nowhere else can show a store sheet.
    const srcFiles = [];
    (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) && srcFiles.push(p); } })(path.join(REPO, "src"));
    const callers = srcFiles.filter((f) => /requestReview\(|in-app-review/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f));
    t.eq(callers, ["src/lib/reviewPrompt.js"], "only reviewPrompt.js touches the review plugin");

    // No "do you like us?" gate, no reward, no custom rating screen. Only what a person can read is
    // checked (string literals, template text, JSX text), so comments may describe the rule.
    const all = srcFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const parser = require(path.join(REPO, "node_modules", "@babel", "parser"));
    const copy = [];
    for (const f of srcFiles) {
      const ast = parser.parse(fs.readFileSync(f, "utf8"), { sourceType: "module", plugins: ["jsx"] });
      (function walk(n) {
        if (!n || typeof n.type !== "string") return;
        if (n.type === "StringLiteral" || n.type === "JSXText") copy.push(n.value);
        else if (n.type === "TemplateElement") copy.push(n.value.cooked ?? n.value.raw);
        for (const k of Object.keys(n)) {
          if (["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra"].includes(k)) continue;
          const v = n[k];
          if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && walk(x));
          else if (v && typeof v.type === "string") walk(v);
        }
      })(ast.program);
    }
    t.ok(copy.length > 1000, `sanity: the copy scan reads real strings (${copy.length})`);
    const PRE_PROMPT = /\benjoying flourish\b|\brate (?:us|flourish|the app)\b|\bleave (?:us )?a review\b|\bdo you (?:like|love) (?:us|flourish)\b|\breview (?:us|flourish) (?:for|and get)\b|\bhow (?:are we|is flourish) doing\b/i;
    t.eq(copy.filter((c) => PRE_PROMPT.test(c)).map((c) => c.trim().slice(0, 80)), [], "no pre-prompt, rating screen or reward copy anywhere in src/");
    t.ok(PRE_PROMPT.test("Enjoying Flourish?") && !PRE_PROMPT.test("solely to operate the App"), "sanity: the check catches a pre-prompt and not ordinary words");
    t.ok(!/import\s*\{[^}]*\}\s*from\s*["']@capacitor-community\/in-app-review["']/.test(all), "the plugin is never a static import, so the web never loads it");

    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    t.ok(/^\^8\./.test(pkg.dependencies["@capacitor-community/in-app-review"] || ""), "the plugin is the Capacitor 8 line");
    const spm = fs.readFileSync(path.join(REPO, "ios", "App", "CapApp-SPM", "Package.swift"), "utf8");
    const gradle = fs.readFileSync(path.join(REPO, "android", "capacitor.settings.gradle"), "utf8");
    t.ok(/CapacitorCommunityInAppReview/.test(spm) && /capacitor-community-in-app-review/.test(gradle), "both native projects include it");
  }

  t.summary("reviewPrompt.test");
})();
