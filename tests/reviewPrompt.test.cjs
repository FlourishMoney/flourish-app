// tests/reviewPrompt.test.cjs
// -----------------------------------------------------------------------------
// THE STORE REVIEW ASK: WHEN IT MAY HAPPEN, AND THAT NOTHING ELSE HAPPENS AROUND IT.
//
// 1. The rules (reviewRules.js), driven with a fake clock. Version 1.1, item 4 (replacing the rule of
//    2026-10-01): the one moment is a money meeting marked done; each completed meeting may ask once;
//    at most three asks in any 365 days; never within 24 hours of trouble (an error, a failed bank link,
//    a declined payment, a refused coach message); never on the web or in demo mode. The retired
//    triggers (third day on Today, weekly check-in) ask nothing.
// 2. The wrapper (reviewPrompt.js) on the web does nothing at all, not even write its record.
// 3. The wiring in the app: trouble is noted where things go wrong, the one trigger sits on "Mark this
//    meeting done", the plugin is called from one place only, and no screen of Flourish's own stands
//    in front of the store's sheet. "Rate Flourish" in Settings opens the store page the person chose.
// 4. The plugin is the app's own: Apple's current AppStore.requestReview(in:) on iOS, never the old
//    SKStoreReviewController, and Google's in-app review API on Android.
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");

(async () => {
  const t = create();
  const R = await import("../src/lib/reviewRules.js");
  const { decideReviewAsk, withTrouble, withAsked, normalizeReviewState, emptyReviewState, localDayKey, asksInWindow, REVIEW_TRIGGERS: T } = R;

  const at = (s) => new Date(s);                           // local wall-clock time
  const days = (n) => n * 24 * 60 * 60 * 1000;
  const later = (d, n) => new Date(d.getTime() + days(n));
  const ask = (state, now, extra = {}) => decideReviewAsk({ state, trigger: T.MEETING_DONE, now, native: true, demo: false, meetingKey: localDayKey(now), ...extra });

  // ── 1a. The constants ────────────────────────────────────────────────────────────────────────
  t.eq([R.REVIEW_MAX_ASKS, R.REVIEW_WINDOW_DAYS, R.TROUBLE_QUIET_HOURS], [3, 365, 24], "at most 3 asks in 365 days; 24 quiet hours after trouble");
  t.eq(Object.values(T), ["meeting_done"], "one trigger: a money meeting marked done");
  t.eq(localDayKey(at("2026-10-02T00:00:01")), "2026-10-02", "(the day key is local, not UTC)");
  t.eq(typeof R.REVIEW_COOLDOWN_DAYS, "undefined", "the 120-day rule of 2026-10-01 is gone");

  // ── 1b. Once per completed meeting, at most three times in 365 days ─────────────────────────
  {
    const d0 = at("2026-10-05T19:00:00");
    t.eq(ask(emptyReviewState(), d0), { ask: true, reason: "meeting_done" }, "a meeting marked done asks");
    const a1 = withAsked(emptyReviewState(), d0, localDayKey(d0));
    t.eq(ask(a1, later(d0, 0)), { ask: false, reason: "meeting_already_asked" }, "the same meeting never asks twice");
    t.eq(ask(a1, d0, { meetingKey: null }), { ask: false, reason: "no_meeting" }, "no completed meeting, no ask");
    t.eq(ask(a1, later(d0, 7)).ask, true, "the next week's meeting may ask");
    const a2 = withAsked(a1, later(d0, 7), localDayKey(later(d0, 7)));
    const a3 = withAsked(a2, later(d0, 14), localDayKey(later(d0, 14)));
    t.eq([asksInWindow(a3, later(d0, 21)), ask(a3, later(d0, 21)).reason], [3, "yearly_limit"], "three asks in the year: a fourth meeting does not ask");
    t.eq(ask(a3, later(d0, 364)).reason, "yearly_limit", "…not on day 364 either");
    t.eq([asksInWindow(a3, later(d0, 366)), ask(a3, later(d0, 366)).ask], [2, true], "once the first ask is more than 365 days old, one more is allowed");
    t.eq(ask(a3, at("2026-09-01T09:00:00")).reason, "yearly_limit", "a clock set back before the asks still counts them: no room is made");
    t.eq([ask({ meetingAsked: true, lastAskedAt: d0.toISOString() }, later(d0, 1)).ask, asksInWindow({ meetingAsked: true, lastAskedAt: d0.toISOString() }, later(d0, 1))], [true, 1],
      "a record from the 2026-10-01 rule carries over: its ask is one of the three");
    t.eq(asksInWindow({ askedAt: ["not a date", "nor this", "nor that"] }, d0), 3, "unreadable ask times read as asks, not as none");
    t.eq(normalizeReviewState("garbage"), emptyReviewState(), "a junk record reads as empty");
  }

  // ── 1c. Never after trouble, on the web, in demo mode, or on any other moment ────────────────
  {
    const hurt = withTrouble(emptyReviewState(), at("2026-10-03T08:55:00"));
    t.eq(ask(hurt, at("2026-10-03T09:00:00")), { ask: false, reason: "recent_trouble" }, "an error, a failed bank link or a declined payment five minutes ago: no ask");
    t.eq(ask(hurt, at("2026-10-04T08:54:00")).reason, "recent_trouble", "23h59m later: still no");
    t.eq(ask(hurt, at("2026-10-04T08:56:00")).ask, true, "24 hours on, a completed meeting may ask");
    t.eq(ask(withTrouble(emptyReviewState(), at("2026-10-09T09:00:00")), at("2026-10-05T09:00:00")).reason, "recent_trouble", "trouble dated after now (a moved clock) is recent: it waits");
    t.eq(ask(emptyReviewState(), at("2026-10-03T09:00:00"), { native: false }), { ask: false, reason: "web" }, "the web never asks");
    t.eq(ask(emptyReviewState(), at("2026-10-03T09:00:00"), { demo: true }), { ask: false, reason: "demo" }, "demo mode never asks");
    for (const bad of ["today_open", "checkin_done", "purchase_done", "", null, undefined]) {
      t.eq(ask(emptyReviewState(), at("2026-10-03T09:00:00"), { trigger: bad }).ask, false, `no ask on any other moment, including the retired ones (${JSON.stringify(bad)})`);
    }
    t.eq(decideReviewAsk.length, 1, "the rule takes no input about the household beyond these (no filtering of who gets asked)");
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "reviewRules.js"), "utf8").replace(/\/\/[^\n]*/g, "");
    t.ok(!/health|score|paid|premium|plan|rating|happy|sentiment|balance|income/i.test(src), "…and nothing in it reads how the household is doing, what it pays, or how it might rate");
  }

  // ── 2. The wrapper ───────────────────────────────────────────────────────────────────────────
  {
    const store = {};
    global.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    const P = await import("../src/lib/reviewPrompt.js");
    const r1 = await P.reviewOnMeetingDone({});
    P.noteReviewTrouble();
    t.eq(r1.reason, "web", "web: the meeting trigger does not ask");
    t.eq(Object.keys(store), [], "web: nothing is written");
    t.ok(!P.REVIEW_STORAGE_KEY.startsWith("flourish_"), "the record's key is outside the flourish_ prefix that sign-out and the shared-device wipe remove");
    t.eq(typeof P.reviewOnTodayOpen + typeof P.reviewOnCheckInDone, "undefinedundefined", "the retired triggers are gone from the wrapper");

    // On a native shell the ask is recorded before the plugin is called, so a crash mid-sheet
    // cannot lead to a second ask. (The plugin itself cannot run in node; the wrapper swallows that.)
    global.window.Capacitor = { isNativePlatform: () => true };
    const rd = await P.reviewOnMeetingDone({ demo: true, now: at("2026-10-04T10:00:00") });
    t.eq([rd.reason, store[P.REVIEW_STORAGE_KEY]], ["demo", undefined], "native demo: never asks, and writes nothing");
    const r3 = await P.reviewOnMeetingDone({ now: at("2026-10-05T10:00:00") });
    t.eq(r3, { ask: true, reason: "meeting_done" }, "native: a meeting marked done asks");
    const rec = JSON.parse(store[P.REVIEW_STORAGE_KEY]);
    t.eq([rec.askedAt, rec.askedMeetings], [[at("2026-10-05T10:00:00").toISOString()], ["2026-10-05"]], "…and the ask is on record, with the meeting it was for");
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-05T18:00:00") })).reason, "meeting_already_asked", "…so the same meeting never asks again, even if marked done twice that day");
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-12T10:00:00") })).ask, true, "the next week's meeting asks (2 of 3)");
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-19T10:00:00") })).ask, true, "…and the one after (3 of 3)");
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-26T10:00:00") })).reason, "yearly_limit", "…and then no more within the year");
    P.noteReviewTrouble(at("2027-11-01T11:00:00"));
    t.eq(JSON.parse(store[P.REVIEW_STORAGE_KEY]).lastTroubleAt, at("2027-11-01T11:00:00").toISOString(), "native: trouble is recorded");
    t.eq((await P.reviewOnMeetingDone({ now: at("2027-11-01T12:00:00") })).reason, "recent_trouble", "…and a meeting an hour later does not ask");
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
    t.ok(/const markDone = \(\) => \{[\s\S]{0,600}reviewOnMeetingDone\(\{ demo: !!data\.demo \}\);/.test(app),
         "…\"Mark this meeting done\", after the meeting is recorded, passing demo (the wrapper keys the meeting by its day)");
    const sp = app.slice(app.indexOf("function StorePaywall("), app.indexOf("function Paywall("));
    t.ok(/if\(r\.outcome==="failed" \|\| r\.outcome==="pending" \|\| r\.outcome==="cancelled" \|\| r\.outcome==="unconfirmed"\) noteReviewTrouble\(\);/.test(sp),
         "a declined payment, or a purchase that did not finish, notes trouble (version 1.1)");

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
    // One exact exception: "Rate Flourish", the Settings row a person taps to open the store's review
    // page themselves (tester suggestions item 3). It is a link, not a pre-prompt: nothing asks first.
    t.eq(copy.filter((c) => PRE_PROMPT.test(c) && c.trim() !== "Rate Flourish").map((c) => c.trim().slice(0, 80)), [], "no pre-prompt, rating screen or reward copy anywhere in src/");
    t.eq(copy.filter((c) => c.trim() === "Rate Flourish").length, 1, "…\"Rate Flourish\" appears once, as the Settings row");
    t.ok(PRE_PROMPT.test("Enjoying Flourish?") && !PRE_PROMPT.test("solely to operate the App"), "sanity: the check catches a pre-prompt and not ordinary words");
    t.ok(!/import\s*\{[^}]*\}\s*from\s*["']@capacitor-community\/in-app-review["']/.test(all), "the plugin is never a static import, so the web never loads it");

  }

  // ── 4. The plugin is the app's own, on each store's current API ────────────────────────────────
  {
    const REPO = path.join(__dirname, "..");
    const rd = (...p) => fs.readFileSync(path.join(REPO, ...p), "utf8");
    const swift = rd("ios", "App", "App", "FlourishReviewPlugin.swift");
    t.ok(/AppStore\.requestReview\(in: scene\)/.test(swift) && /#available\(iOS 16\.0, \*\)/.test(swift), "iOS: Apple's current AppStore.requestReview(in:), iOS 16 and later");
    t.ok(!/SKStoreReviewController/.test(swift.replace(/\/\/[^\n]*/g, "")), "…never the old SKStoreReviewController (iOS 15 is not asked)");
    t.ok(/jsName = "FlourishReview"/.test(swift) && /bridge\?\.registerPluginInstance\(FlourishReviewPlugin\(\)\)/.test(rd("ios", "App", "App", "MainViewController.swift")) && /rootViewController = MainViewController\(\)/.test(rd("ios", "App", "App", "SceneDelegate.swift")),
      "…registered on the app's bridge, which SceneDelegate makes the root");
    const pbx = rd("ios", "App", "App.xcodeproj", "project.pbxproj");
    t.eq([(pbx.match(/FlourishReviewPlugin\.swift in Sources/g) || []).length, (pbx.match(/MainViewController\.swift in Sources/g) || []).length], [2, 2], "…and both files are compiled into the app");
    const java = rd("android", "app", "src", "main", "java", "com", "flourishmoney", "app", "FlourishReviewPlugin.java");
    t.ok(/ReviewManagerFactory\.create/.test(java) && /launchReviewFlow/.test(java) && /@CapacitorPlugin\(name = "FlourishReview"\)/.test(java), "Android: Google's in-app review API");
    t.ok(/registerPlugin\(FlourishReviewPlugin\.class\);\s*super\.onCreate\(savedInstanceState\);/.test(rd("android", "app", "src", "main", "java", "com", "flourishmoney", "app", "MainActivity.java")) && /com\.google\.android\.play:review:/.test(rd("android", "app", "build.gradle")),
      "…registered before the bridge starts, with Google's review library");
    const pkg = JSON.parse(rd("package.json"));
    t.ok(!pkg.dependencies["@capacitor-community/in-app-review"] && !/InAppReview/.test(rd("ios", "App", "CapApp-SPM", "Package.swift")) && !/in-app-review/.test(rd("android", "capacitor.settings.gradle")),
      "the old plugin (which fell back to SKStoreReviewController below iOS 17) is gone from both projects");
    t.ok(/registerPlugin\("FlourishReview"\)\.requestReview\(\)/.test(rd("src", "lib", "reviewPrompt.js")), "reviewPrompt.js asks through it, at the moment of asking only");
  }

  t.summary("reviewPrompt.test");
})();
