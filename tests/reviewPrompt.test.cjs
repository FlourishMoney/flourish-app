// tests/reviewPrompt.test.cjs
// -----------------------------------------------------------------------------
// THE STORE REVIEW ASK: WHEN IT MAY HAPPEN, AND THAT NOTHING ELSE HAPPENS AROUND IT.
//
// 1. The rules (reviewRules.js), driven with a fake clock. Since tester suggestions item 3 (decided
//    2026-10-01) the one good moment is the FIRST money meeting marked done, asked once per install;
//    never within 24 hours of trouble; never within 120 days of an ask; never on the web or in demo
//    mode. The retired triggers (third day on Today, weekly check-in) ask nothing.
// 2. The wrapper (reviewPrompt.js) on the web does nothing at all, not even write its record.
// 3. The wiring in the app: trouble is noted where things go wrong, the one trigger sits on "Mark this
//    meeting done", the plugin is called from one place only, and no screen of Flourish's own stands
//    in front of the store's sheet. "Rate flourish" in Settings opens the store page the person chose.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const R = await import("../src/lib/reviewRules.js");
  const { decideReviewAsk, withTrouble, withAsked, normalizeReviewState, emptyReviewState, localDayKey, REVIEW_TRIGGERS: T } = R;

  const at = (s) => new Date(s);                           // local wall-clock time
  const days = (n) => n * 24 * 60 * 60 * 1000;
  const ask = (state, now, extra = {}) => decideReviewAsk({ state, trigger: T.MEETING_DONE, now, native: true, demo: false, firstMeeting: true, ...extra });

  // ── 1a. The constants ─────────────────────────────────────────────────────────────────────────
  t.eq(R.REVIEW_COOLDOWN_DAYS, 120, "the cooldown is 120 days");
  t.eq(Object.values(T), ["meeting_done"], "one trigger: a money meeting marked done");
  t.eq(localDayKey(at("2026-10-02T00:00:01")), "2026-10-02", "(the day key is local, not UTC)");

  // ── 1b. The first meeting asks, once ──────────────────────────────────────────────────────────
  {
    const s = emptyReviewState();
    t.eq(ask(s, at("2026-10-05T19:00:00")), { ask: true, reason: "first_meeting" }, "the first meeting marked done asks");
    t.eq(ask(s, at("2026-10-05T19:00:00"), { firstMeeting: false }), { ask: false, reason: "not_first_meeting" }, "a later meeting never asks");
    const asked = withAsked(s, at("2026-10-05T19:00:00"));
    t.eq(asked.meetingAsked, true, "asking is on record");
    t.eq(ask(asked, new Date(at("2026-10-05T19:00:00").getTime() + days(400))).reason, "already_asked", "never twice: not even 400 days later");
    t.eq(ask({ meetingAsked: "yes" }, at("2026-10-05T19:00:00")).reason, "already_asked", "a junk record reads as already asked, not as never asked");
    // An ask made before (by an older build's trigger) still holds the 120-day rule.
    const older = { lastAskedAt: at("2026-10-01T09:00:00").toISOString() };
    t.eq(ask(older, new Date(at("2026-10-01T09:00:00").getTime() + days(119))).reason, "cooldown", "within 120 days of any ask: no");
    t.eq(ask(older, new Date(at("2026-10-01T09:00:00").getTime() + days(120))).ask, true, "120 days on: the first meeting may ask");
    t.eq(ask(older, at("2026-09-01T09:00:00")).reason, "cooldown", "a clock set before the last ask waits");
    const junk = normalizeReviewState({ lastAskedAt: "not a date" });
    t.ok(!!junk.lastAskedAt, "an unreadable ask time reads as asked, not as never asked");
  }

  // ── 1c. Never after trouble, on the web, in demo mode, or on any other moment ────────────────
  {
    const hurt = withTrouble(emptyReviewState(), at("2026-10-03T08:55:00"));
    t.eq(ask(hurt, at("2026-10-03T09:00:00")), { ask: false, reason: "recent_trouble" }, "an error five minutes ago: no ask");
    t.eq(ask(hurt, at("2026-10-04T08:54:00")).reason, "recent_trouble", "23h59m later: still no");
    t.eq(ask(hurt, at("2026-10-04T08:56:00")).ask, true, "24 hours on, the first meeting may ask");
    t.eq(ask(emptyReviewState(), at("2026-10-03T09:00:00"), { native: false }), { ask: false, reason: "web" }, "the web never asks");
    t.eq(ask(emptyReviewState(), at("2026-10-03T09:00:00"), { demo: true }), { ask: false, reason: "demo" }, "demo mode never asks");
    for (const bad of ["today_open", "checkin_done", "", null, undefined]) {
      t.eq(ask(emptyReviewState(), at("2026-10-03T09:00:00"), { trigger: bad }).ask, false, `no ask on any other moment, including the retired ones (${JSON.stringify(bad)})`);
    }
    t.eq(normalizeReviewState("garbage"), emptyReviewState(), "a junk record reads as empty");
  }

  // ── 2. The wrapper on the web does nothing ────────────────────────────────────────────────────
  {
    const store = {};
    global.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    const P = await import("../src/lib/reviewPrompt.js");
    const r1 = await P.reviewOnMeetingDone({ firstMeeting: true });
    P.noteReviewTrouble();
    t.eq(r1.reason, "web", "web: the meeting trigger does not ask");
    t.eq(Object.keys(store), [], "web: nothing is written");
    t.ok(!P.REVIEW_STORAGE_KEY.startsWith("flourish_"), "the record's key is outside the flourish_ prefix that sign-out and the shared-device wipe remove");
    t.eq(typeof P.reviewOnTodayOpen + typeof P.reviewOnCheckInDone, "undefinedundefined", "the retired triggers are gone from the wrapper");

    // On a native shell the ask is recorded before the plugin is called, so a crash mid-sheet
    // cannot lead to a second ask. (The plugin itself cannot run in node; the wrapper swallows that.)
    global.window.Capacitor = { isNativePlatform: () => true };
    const rd = await P.reviewOnMeetingDone({ demo: true, firstMeeting: true, now: at("2026-10-04T10:00:00") });
    t.eq([rd.reason, store[P.REVIEW_STORAGE_KEY]], ["demo", undefined], "native demo: never asks, and writes nothing");
    const r3 = await P.reviewOnMeetingDone({ firstMeeting: true, now: at("2026-10-05T10:00:00") });
    t.eq(r3, { ask: true, reason: "first_meeting" }, "native: the first meeting marked done asks");
    const rec = JSON.parse(store[P.REVIEW_STORAGE_KEY]);
    t.eq([rec.lastAskedAt, rec.meetingAsked], [at("2026-10-05T10:00:00").toISOString(), true], "…and the ask is on record");
    const r4 = await P.reviewOnMeetingDone({ firstMeeting: true, now: at("2027-03-05T10:00:00") });
    t.eq(r4.reason, "already_asked", "…so it never fires twice, even if the meeting record were reset");
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
    t.ok(/useEffect\(\(\)=>\{ if\(limitNote\|\|error\) noteReviewTrouble\(\); \},\[limitNote,error\]\);/.test(app), "the coach's limit note and every coach error (consent refusal, failure) note trouble");
    t.ok(/useEffect\(\(\)=>\{ if\(bankError\) noteReviewTrouble\(\); \},\[bankError\]\);/.test(app), "every onboarding bank error (link token, exchange, reconnect) notes trouble");
    t.ok(/useEffect\(\(\) => \{ if \(sdkError\) noteReviewTrouble\(\); \}, \[sdkError\]\);/.test(app), "Plaid's script failing to load notes trouble");
    t.ok(/catch \{\s*noteReviewTrouble\(\);\s*alertModal\(\{message:"Could not reconnect/.test(app), "a failed reconnect notes trouble");
    t.ok(/noteReviewTrouble\(\); alertModal\(\{message:"Could not start bank connection/.test(app), "a failed Add Bank start notes trouble");
    // The sign-out and shared-device wipes only remove flourish_* keys, so the record survives them.
    t.ok(/k\.startsWith\("flourish_"\) && k !== STORAGE_KEY && k !== STAMP_KEY/.test(app), "(sign-out removes only flourish_* keys)");

    t.ok(!/reviewOnTodayOpen|reviewOnCheckInDone/.test(app), "the retired triggers are gone from the app");
    const meetCalls = app.match(/reviewOnMeetingDone\(/g) || [];
    t.eq(meetCalls.length, 1, "the meeting asks from exactly one place");
    t.ok(/const last = data\.profile\?\.meetingSchedule\?\.lastMeetingAt;/.test(app) && /reviewOnMeetingDone\(\{ demo: !!data\.demo, firstMeeting: !last \}\);/.test(app),
         "…\"Mark this meeting done\", passing demo and whether it is the first meeting (no meeting held before)");

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
    // One exact exception: "Rate flourish", the Settings row a person taps to open the store's review
    // page themselves (tester suggestions item 3). It is a link, not a pre-prompt: nothing asks first.
    t.eq(copy.filter((c) => PRE_PROMPT.test(c) && c.trim() !== "Rate flourish").map((c) => c.trim().slice(0, 80)), [], "no pre-prompt, rating screen or reward copy anywhere in src/");
    t.eq(copy.filter((c) => c.trim() === "Rate flourish").length, 1, "…\"Rate flourish\" appears once, as the Settings row");
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
