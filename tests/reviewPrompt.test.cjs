// tests/reviewPrompt.test.cjs
// -----------------------------------------------------------------------------
// THE STORE REVIEW ASK: WHEN IT MAY HAPPEN, AND THAT NOTHING ELSE HAPPENS AROUND IT.
//
// 1. The rules (reviewRules.js), driven with a fake clock. Version 1.1, item 4 (replacing the rule of
//    2026-10-01): the one moment is a money meeting marked done; each completed meeting may ask once;
//    at most three asks in any 365 days; never within 24 hours of trouble (an error, a failed bank link,
//    a declined payment, a refused coach message); never on the web or in demo mode. The retired
//    triggers (third day on Today, weekly check-in) ask nothing.
//    2026-11-24 (the meeting is reached by almost nobody): two more moments, native only, under the same
//    limits. About 3 seconds after the first safe-to-spend number shows (first_safe), and the 3rd different day the
//    app is opened (third_open_day). Each comes once per install: once it has come, asked or not, it never asks again.
//    Review round 1 (2026-11-24): the first number's wait is cancelled when the number leaves the screen, the app goes to
//    the background or the demo starts, and is checked again right before asking (none of those spends the moment). An
//    open is a real open: once when the app loads, then each time the app comes back to the foreground (a data update
//    after midnight is not one). At most one ask per app session (a new session after 30 minutes in the background):
//    the other moments wait for a later session, unspent.
//    Review round 2: the native plugin is resolved first, then every rule is checked again, live, right before the moment
//    is recorded and the store is asked (a phone app, not the demo, not a sample household, in the foreground, still on
//    screen, no trouble in 24 hours, the session, three a year); any failing means no ask and the moment kept. The
//    launch's open and a resume's open pass ONE check (signed in, data loaded, not the demo, not a sample household, in
//    the foreground), and a launch that fails it can still count later in the same launch.
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
  t.eq(Object.values(T), ["meeting_done", "first_safe", "third_open_day"], "three moments: a money meeting marked done, the first safe-to-spend number, the third day the app is opened");
  t.eq(R.FIRST_SAFE_DELAY_MS, 3000, "the first number's ask waits about 3 seconds");
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

  // ── 1d. The first safe-to-spend number, and the third day the app is opened (2026-11-24) ────────
  {
    const d0 = at("2026-11-24T19:00:00");
    const moment = (state, trigger, now, extra = {}) => decideReviewAsk({ state, trigger, now, native: true, demo: false, ...extra });
    t.eq(moment(emptyReviewState(), T.FIRST_SAFE, d0), { ask: true, reason: "first_safe" }, "the first safe-to-spend number asks");
    const spent = R.withMomentSpent(emptyReviewState(), T.FIRST_SAFE, d0);
    t.eq(moment(spent, T.FIRST_SAFE, later(d0, 30)), { ask: false, reason: "moment_spent" }, "…once per install: never again, even a month on");
    t.eq(moment(emptyReviewState(), T.FIRST_SAFE, d0, { native: false }).reason, "web", "the web never asks on the first number");
    t.eq(moment(emptyReviewState(), T.FIRST_SAFE, d0, { demo: true }).reason, "demo", "…nor does the demo");
    t.eq(moment(withTrouble(emptyReviewState(), later(d0, -0.01)), T.FIRST_SAFE, d0).reason, "recent_trouble", "…nor within 24 hours of trouble (a failed bank link in onboarding)");
    const full = [0, 7, 14].reduce((s, n) => withAsked(s, later(d0, n - 30), "m" + n), emptyReviewState());
    t.eq(moment(full, T.FIRST_SAFE, d0).reason, "yearly_limit", "…and it counts toward the same three a year");

    // Opened on three different days of the person's own calendar.
    const day1 = at("2026-11-24T08:00:00"), day1b = at("2026-11-24T23:30:00"), day2 = at("2026-11-26T09:00:00"), day3 = at("2026-11-30T00:30:00");
    let s = R.withOpenDay(emptyReviewState(), day1);
    t.eq(moment(s, T.THIRD_OPEN_DAY, day1).reason, "not_third_day", "day 1: no ask");
    s = R.withOpenDay(s, day1b);
    t.eq([s.openDays, moment(s, T.THIRD_OPEN_DAY, day1b).reason], [["2026-11-24"], "not_third_day"], "opened again the same day: still one day");
    s = R.withOpenDay(s, day2);
    t.eq(moment(s, T.THIRD_OPEN_DAY, day2).reason, "not_third_day", "day 2: no ask");
    s = R.withOpenDay(s, day3);
    t.eq([s.openDays.length, moment(s, T.THIRD_OPEN_DAY, day3)], [3, { ask: true, reason: "third_open_day" }], "the 3rd different day the app is opened asks (the days need not be in a row)");
    const after3 = R.withMomentSpent(s, T.THIRD_OPEN_DAY, day3);
    t.eq(moment(R.withOpenDay(after3, later(day3, 1)), T.THIRD_OPEN_DAY, later(day3, 1)).reason, "moment_spent", "…once per install: day 4 and on never ask");
    t.eq(moment(R.withOpenDay(R.withOpenDay(s, later(day3, 1)), later(day3, 2)), T.THIRD_OPEN_DAY, later(day3, 2)), { ask: true, reason: "third_open_day" }, "a later open still asks while the moment is unspent (it waits for a later session; review round 1)");
    t.eq(R.withOpenDay(after3, later(day3, 9)).openDays.length, 3, "only the first three days are kept");
    t.eq(moment(s, T.THIRD_OPEN_DAY, day3, { native: false }).reason, "web", "the web never asks on the third day");
    t.eq(moment(s, T.THIRD_OPEN_DAY, day3, { demo: true }).reason, "demo", "…nor does the demo");
    t.eq(moment(withTrouble(s, later(day3, -0.5)), T.THIRD_OPEN_DAY, day3).reason, "recent_trouble", "…nor within 24 hours of trouble");
    t.eq(moment(withAsked(withAsked(withAsked(s, day1, "a"), day2, "b"), day2, "c"), T.THIRD_OPEN_DAY, day3).reason, "yearly_limit", "…and it counts toward the same three a year");
    // One ask per app session (review round 1): whichever moment comes first; the others wait, unspent.
    t.eq(R.REVIEW_SESSION_GAP_MINUTES, 30, "a new app session after 30 minutes in the background");
    for (const [trig, extra] of [[T.FIRST_SAFE, {}], [T.THIRD_OPEN_DAY, {}], [T.MEETING_DONE, { meetingKey: localDayKey(day3) }]]) {
      t.eq(moment(s, trig, day3, { askedThisSession: true, ...extra }), { ask: false, reason: "session_already_asked" }, `${trig}: not in a session that already asked`);
    }
    t.eq(moment(after3, T.THIRD_OPEN_DAY, day3, { askedThisSession: true }).reason, "moment_spent", "(a spent moment still reads as spent)");
    // The meeting's ask is unchanged by the two new moments, and the moments do not need a meeting.
    t.eq(ask(after3, later(day3, 2)).ask, true, "the meeting-done ask still asks");
    t.eq(moment(emptyReviewState(), T.FIRST_SAFE, d0, { meetingKey: null }).ask, true, "a moment needs no meeting key");
    t.eq(normalizeReviewState({ askedAt: [], openDays: ["2026-11-24", 7, "2026-11-24", "not-a-day", "2026-11-25"], moments: { first_safe: "garbage", third_open_day: null } }, d0.getTime()),
      { askedAt: [], askedMeetings: [], lastTroubleAt: null, openDays: ["2026-11-24", "2026-11-25"], moments: { first_safe: d0.toISOString(), third_open_day: null } },
      "a stored record is read safely: days de-duplicated, an unreadable moment counts as spent (never asks sooner)");
  }

  // ── 2. The wrapper ───────────────────────────────────────────────────────────────────────────
  {
    const store = {};
    global.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
    const P = await import("../src/lib/reviewPrompt.js");
    // A later app session: 31 minutes in the background, then back (review round 1, one ask per session).
    const newSession = (when) => { P._reviewVisibility("hidden", when.getTime() - 31 * 60 * 1000); P._reviewVisibility("visible", when.getTime()); };
    const r1 = await P.reviewOnMeetingDone({});
    P.noteReviewTrouble();
    t.eq(r1.reason, "web", "web: the meeting trigger does not ask");
    t.eq(Object.keys(store), [], "web: nothing is written");
    t.ok(!P.REVIEW_STORAGE_KEY.startsWith("flourish_"), "the record's key is outside the flourish_ prefix that sign-out and the shared-device wipe remove");
    t.eq(typeof P.reviewOnTodayOpen + typeof P.reviewOnCheckInDone, "undefinedundefined", "the retired triggers are gone from the wrapper");
    const w1 = await P.reviewOnFirstSafe({ delayMs: 0 }), w2 = await P.reviewOnAppLaunch({});
    t.eq([w1.reason, w2.reason, Object.keys(store)], ["web", "web", []], "web: the first number and the app opening do not ask, and nothing is written");

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
    newSession(at("2026-10-12T10:00:00"));
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-12T10:00:00") })).ask, true, "the next week's meeting asks (2 of 3)");
    newSession(at("2026-10-19T10:00:00"));
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-19T10:00:00") })).ask, true, "…and the one after (3 of 3)");
    newSession(at("2026-10-26T10:00:00"));
    t.eq((await P.reviewOnMeetingDone({ now: at("2026-10-26T10:00:00") })).reason, "yearly_limit", "…and then no more within the year");
    P.noteReviewTrouble(at("2027-11-01T11:00:00"));
    t.eq(JSON.parse(store[P.REVIEW_STORAGE_KEY]).lastTroubleAt, at("2027-11-01T11:00:00").toISOString(), "native: trouble is recorded");
    t.eq((await P.reviewOnMeetingDone({ now: at("2027-11-01T12:00:00") })).reason, "recent_trouble", "…and a meeting an hour later does not ask");

    // The two new moments on a native shell (a fresh install's record).
    for (const k of Object.keys(store)) delete store[k];
    const asks = [];
    P._setReviewPluginForTest({ requestReview: async () => { asks.push(Date.now()); } });
    const rdemo = await P.reviewOnFirstSafe({ demo: true, delayMs: 0, now: at("2026-11-24T10:00:00") });
    t.eq([rdemo.reason, store[P.REVIEW_STORAGE_KEY], asks.length], ["demo", undefined, 0], "native demo: the first number never asks, and writes nothing (the real first number is still to come)");
    // A fresh install in a fresh session, its launch not yet counted (coming to the foreground counts a launch: round 2).
    const fresh = (when) => { P._resetReviewForTest(); newSession(when); P._resetLaunchForTest(); for (const k of Object.keys(store)) delete store[k]; };
    const rec2 = () => JSON.parse(store[P.REVIEW_STORAGE_KEY] || "null");
    global.document = { visibilityState: "visible" };
    const T0 = at("2026-11-24T10:00:00");
    fresh(T0);
    const started = Date.now();
    const shown = P.reviewOnFirstSafe({ delayMs: 120, now: T0 });
    t.ok(typeof shown.cancel === "function", "the first number's wait can be cancelled");
    const fs1 = await shown;
    t.ok(Date.now() - started >= 110, "the first number's ask waits its delay before asking");
    t.eq([fs1, asks.length], [{ ask: true, reason: "first_safe" }, 1], "native: the first number asks after the wait");
    t.ok(rec2().askedAt.length === 1 && !!rec2().moments.first_safe, "…recorded as an ask, and the moment as spent");
    newSession(at("2026-11-29T10:00:00"));
    t.eq((await P.reviewOnFirstSafe({ delayMs: 0, now: at("2026-11-29T10:00:00") })).reason, "moment_spent", "…and never again on this install");
    // Trouble during the wait: the decision is made after the wait, so it does not ask, and the moment is spent.
    fresh(T0);
    const waiting = P.reviewOnFirstSafe({ delayMs: 80, now: T0 });
    P.noteReviewTrouble(at("2026-11-24T09:59:59"));
    t.eq([(await waiting).reason, asks.length, !!rec2().moments.first_safe], ["recent_trouble", 1, true], "trouble during the 3 seconds: no ask, and the moment has passed");

    // R1 (review round 1): the wait ends early, or the check right before asking fails. No ask, and the moment is NOT spent.
    const unspent = () => !(rec2() && rec2().moments.first_safe) && asks.length === 1;
    fresh(T0);
    const left = P.reviewOnFirstSafe({ delayMs: 200, now: T0 });
    setTimeout(() => left.cancel(), 20);
    t.eq([(await left).reason, unspent()], ["cancelled", true], "R1a the number leaves the screen during the wait (Today or the first-number screen unmounts): no ask, moment kept");
    const gone = await P.reviewOnFirstSafe({ delayMs: 30, now: T0, onScreen: () => false });
    t.eq([gone.reason, unspent()], ["not_on_screen", true], "R1b the number is no longer on screen when the wait ends: no ask, moment kept");
    const bg = P.reviewOnFirstSafe({ delayMs: 200, now: T0 });
    setTimeout(() => P._reviewVisibility("hidden", T0.getTime() + 50), 20);
    t.eq([(await bg).reason, unspent()], ["background", true], "R1c the app goes to the background during the wait: no ask, moment kept");
    P._reviewVisibility("visible", T0.getTime() + 60_000);
    global.document.visibilityState = "hidden";
    const bg2 = await P.reviewOnFirstSafe({ delayMs: 20, now: T0 });
    global.document.visibilityState = "visible";
    t.eq([bg2.reason, unspent()], ["background", true], "R1d the app is not in the foreground at the moment of asking: no ask, moment kept");
    let demoNow = false;
    const dm = P.reviewOnFirstSafe({ delayMs: 120, now: T0, isDemo: () => demoNow });
    setTimeout(() => { demoNow = true; }, 20);
    t.eq([(await dm).reason, unspent()], ["demo", true], "R1e the demo starts during the wait: no ask, moment kept");
    const a = P.reviewOnFirstSafe({ delayMs: 120, now: T0 }), b = P.reviewOnFirstSafe({ delayMs: 120, now: T0 });
    const [ra, rb] = await Promise.all([a, b]);
    t.eq([ra.reason, rb, asks.length], ["replaced", { ask: true, reason: "first_safe" }, 2], "R1f a second showing replaces the first wait: one ask, after the number is back and has stayed");

    // R2: an open is a real open. Once when the app loads, then each return to the foreground; one calendar day counts once.
    // The gate is App's: signed in, the household's data loaded, the demo, a sample household (one check for both).
    const gate = { signedIn: true, hydrated: true, demo: false, sample: false };
    P.startReviewWatch(() => gate);
    fresh(at("2026-11-24T08:00:00"));
    const day = () => (rec2() ? rec2().openDays : []);
    gate.demo = true;
    t.eq((await P.reviewOnAppLaunch({ now: at("2026-11-24T08:00:00") })).reason, "demo", "R2a native demo: opening the demo counts no day");
    t.eq(store[P.REVIEW_STORAGE_KEY], undefined, "…and writes nothing");
    gate.demo = false;
    t.eq((await P.reviewOnAppLaunch({ now: at("2026-11-24T23:59:00") })).reason, "not_third_day", "R2b the app loads: day 1 counted");
    t.eq([(await P.reviewOnAppLaunch({ now: at("2026-11-25T00:01:00") })).reason, day()], ["already_counted", ["2026-11-24"]], "R2c a data update after midnight (the same launch) counts no new day");
    const resume = async (when) => { P._reviewVisibility("hidden", when.getTime() - 60_000); return P._reviewVisibility("visible", when.getTime()); };
    gate.signedIn = false;
    await resume(at("2026-11-25T09:00:00"));
    t.eq(day(), ["2026-11-24"], "R2d a return to the foreground while signed out (or before data loads) counts nothing");
    gate.signedIn = true;
    await resume(at("2026-11-25T09:30:00"));
    await resume(at("2026-11-25T21:00:00"));
    t.eq(day(), ["2026-11-24", "2026-11-25"], "R2e the app comes back to the foreground: an open; twice in a day is one day");
    gate.demo = true;
    await resume(at("2026-11-27T08:00:00"));
    t.eq(day(), ["2026-11-24", "2026-11-25"], "R2f a return to the demo counts no day");
    gate.demo = false;
    const third = await resume(at("2026-11-27T08:05:00"));
    t.eq([third, asks.length], [{ ask: true, reason: "third_open_day" }, 3], "R2g the 3rd different day the app is opened asks");
    t.eq((await resume(at("2026-11-28T08:00:00"))).reason, "moment_spent", "…once per install");

    // Round 2, R2-2: the launch passes the same check as a resume, and counts only once it has.
    fresh(at("2026-11-24T08:00:00"));
    gate.sample = true;
    t.eq([(await P.reviewOnAppLaunch({ now: at("2026-11-24T08:00:00") })).reason, day()], ["sample", []], "R2-2a a sample household's launch counts no day");
    gate.sample = false;
    global.document.visibilityState = "hidden";
    t.eq([(await P.reviewOnAppLaunch({ now: at("2026-11-24T08:01:00") })).reason, day()], ["background", []], "R2-2b a launch in the background counts no day");
    global.document.visibilityState = "visible";
    await P._reviewVisibility("visible", at("2026-11-24T08:02:00").getTime());
    t.eq(day(), ["2026-11-24"], "R2-2c …and when that launch comes to the foreground, it counts");
    t.eq((await P.reviewOnAppLaunch({ now: at("2026-11-24T08:03:00") })).reason, "already_counted", "…once");
    fresh(at("2026-11-25T08:00:00"));
    gate.hydrated = false;
    t.eq([(await P.reviewOnAppLaunch({ now: at("2026-11-25T08:00:00") })).reason, day()], ["not_ready", []], "R2-2d a launch before the household's data has loaded counts no day");
    gate.hydrated = true;
    t.eq([(await P.reviewOnAppLaunch({ now: at("2026-11-25T08:00:05") })).reason, day()], ["not_third_day", ["2026-11-25"]], "R2-2e …and the same launch counts once its data is in");
    t.eq([(await P.reviewOnAppLaunch({ now: at("2026-11-25T08:00:09") })).reason, day()], ["already_counted", ["2026-11-25"]], "…once");

    // Round 2, R2-1: the plugin is resolved first; while it loads, the person can leave. Checked again, live, after it.
    const slowPlugin = () => {
      const d = {};
      d.started = new Promise((r) => { d.enter = r; });
      d.loaded = new Promise((r) => { d.release = r; });
      P._setReviewPluginLoaderForTest(async () => { d.enter(); await d.loaded; return { requestReview: async () => { asks.push(Date.now()); } }; });
      return d;
    };
    const kept = (before) => asks.length === before && !(rec2() && (rec2().moments.first_safe || rec2().askedAt.length));
    for (const [name, leave, back, why] of [
      ["the app goes to the background", () => { global.document.visibilityState = "hidden"; }, () => { global.document.visibilityState = "visible"; }, "background"],
      ["the demo starts", () => { demoNow = true; }, () => { demoNow = false; }, "demo"],
      ["the number leaves the screen", () => { onScreenNow = false; }, () => { onScreenNow = true; }, "not_on_screen"],
      ["a sample household is loaded", () => { gate.sample = true; }, () => { gate.sample = false; }, "sample"],
      ["trouble is noted", () => { P.noteReviewTrouble(T0); }, () => {}, "recent_trouble"],
    ]) {
      fresh(T0);
      demoNow = false; var onScreenNow = true;
      const before = asks.length;
      const d = slowPlugin();
      const w = P.reviewOnFirstSafe({ delayMs: 0, now: T0, isDemo: () => demoNow, onScreen: () => onScreenNow });
      await d.started;
      leave();
      d.release();
      t.eq([(await w).reason, kept(before)], [why, true], `R2-1 ${name} while the plugin loads: no ask, and the moment is not spent`);
      back();
    }
    {
      fresh(at("2026-11-27T08:00:00"));
      P._resetLaunchForTest();   // fresh() came back to the foreground, which counted its launch; this is the next one
      store[P.REVIEW_STORAGE_KEY] = JSON.stringify({ openDays: ["2026-11-24", "2026-11-25"] });
      const before = asks.length;
      const d = slowPlugin();
      const w = P.reviewOnAppLaunch({ now: at("2026-11-27T08:00:00") });
      await d.started;
      global.document.visibilityState = "hidden";
      d.release();
      t.eq([(await w).reason, asks.length === before, rec2().moments.third_open_day, rec2().openDays.length], ["background", true, null, 3], "R2-1 the third day's ask, the app backgrounded while the plugin loads: no ask, the moment kept (the day counted)");
      global.document.visibilityState = "visible";
      const d2 = slowPlugin();
      const a1 = P.reviewOnFirstSafe({ delayMs: 0, now: at("2026-11-27T08:01:00") }), a2 = P.reviewOnMeetingDone({ now: at("2026-11-27T08:01:00") });
      await d2.started; await new Promise((r) => setTimeout(r, 10));
      d2.release();
      const [x1, x2] = await Promise.all([a1, a2]);
      t.eq([[x1.ask, x2.ask].filter(Boolean).length, asks.length - before], [1, 1], "R2-1 two moments waiting on the plugin at once: the session's one ask, not two");
    }
    P._setReviewPluginLoaderForTest(null);

    // G1: one ask per app session, whichever moment comes first. The others wait, unspent, for a later session.
    fresh(at("2026-11-24T08:00:00"));
    await P.reviewOnAppLaunch({ now: at("2026-11-24T08:00:00") });
    for (const d of ["2026-11-25T08:00:00", "2026-11-27T08:00:00"]) { P._resetLaunchForTest(); newSession(at(d)); await P.reviewOnAppLaunch({ now: at(d) }); }
    const g1Before = asks.length;
    t.eq(rec2().moments.third_open_day !== null && rec2().askedAt.length === 1, true, "G1a the third day's open asks");
    const fsSame = await P.reviewOnFirstSafe({ delayMs: 0, now: at("2026-11-27T08:01:00") });
    t.eq([fsSame.reason, !!rec2().moments.first_safe], ["session_already_asked", false], "G1b the first number in the same session does not ask, and waits (unspent)");
    const mSame = await P.reviewOnMeetingDone({ now: at("2026-11-27T08:02:00") });
    t.eq([mSame.reason, rec2().askedMeetings], ["session_already_asked", []], "G1c a meeting marked done in the same session does not ask either");
    P._reviewVisibility("hidden", at("2026-11-27T08:03:00").getTime());
    P._reviewVisibility("visible", at("2026-11-27T08:20:00").getTime());
    t.eq((await P.reviewOnFirstSafe({ delayMs: 0, now: at("2026-11-27T08:20:00") })).reason, "session_already_asked", "G1d 17 minutes in the background is the same session");
    newSession(at("2026-11-27T19:00:00"));
    t.eq([(await P.reviewOnFirstSafe({ delayMs: 0, now: at("2026-11-27T19:00:00") })), asks.length - g1Before], [{ ask: true, reason: "first_safe" }, 1], "G1e a later session: the first number asks");
    t.eq(rec2().askedAt.length, 2, "…two of the three yearly asks, each in its own session");
    P.startReviewWatch(null);
    delete global.document;
    P._setReviewPluginForTest(null);
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
    // Free v1 on the website (2026-11-23): a free-plan refusal (not a failure) shows its own line first; every other failure notes trouble.
    t.ok(/catch \(err\) \{[\s\S]{0,240}?if\(isFreeBankRefusal\(err\)\)\{ freeBankDialogRef\.current\(\); return; \}\s*noteReviewTrouble\(\);\s*alertModal\(\{message:"Could not reconnect/.test(app), "a failed reconnect notes trouble");
    t.ok(/noteReviewTrouble\(\); alertModal\(\{message:"Could not start bank connection/.test(app), "a failed Add Bank start notes trouble");
    // The sign-out and shared-device wipes only remove flourish_* keys, so the record survives them.
    t.ok(/k\.startsWith\("flourish_"\) && k !== STORAGE_KEY && k !== STAMP_KEY/.test(app), "(sign-out removes only flourish_* keys)");

    t.ok(!/reviewOnTodayOpen|reviewOnCheckInDone/.test(app), "the retired triggers are gone from the app");
    // 2026-11-24: the first safe-to-spend number (the first-number screen after onboarding, or Today for a household that
    // never saw it on this install) and the app opening. Demo and the sample households never ask.
    t.eq((app.match(/reviewOnFirstSafe\(/g) || []).length, 2, "the first number asks from two places: the first-number screen and Today");
    const fv = app.slice(app.indexOf("function FirstVisitScreen("), app.indexOf("function AIDisclosureScreen("));
    t.ok(/useEffect\(\(\) => \{ if \(!numberShown\) return; const wait = reviewOnFirstSafe\(\{ isDemo: \(\) => _activationOff \}\); return \(\) => wait\.cancel\(\); \}, \[numberShown\]\);/.test(fv),
      "…the first-number screen, when its number shows, its wait cancelled when the screen goes (R1)");
    t.ok(!/reviewOnFirstSafe/.test(app.slice(app.indexOf("onNumberShown={()=>{"), app.indexOf("onNumberShown={()=>{") + 400)), "…not from App's onNumberShown callback, which cannot cancel");
    t.ok(/useEffect\(\(\)=>\{ if\(showsSafeFigure && !data\?\.demo\) signalActivation\("safe_view", false\); \},\[showsSafeFigure\]\);[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*const firstSafeOnScreen = useRef\(false\); firstSafeOnScreen\.current = showsSafeFigure && !data\?\.demo;\s*useEffect\(\(\)=>\{ if\(!showsSafeFigure \|\| data\?\.demo\) return; const wait = reviewOnFirstSafe\(\{ onScreen: \(\)=>firstSafeOnScreen\.current, isDemo: \(\)=>_activationOff \}\); return \(\)=>wait\.cancel\(\); \},\[showsSafeFigure, !!data\?\.demo\]\);/.test(app),
      "…Today, when it shows the figure (beside the safe_view count): cancelled when Today goes or the demo starts, checked again before asking (R1)");
    t.ok(!/reviewOnAppOpen/.test(app), "R2 the per-data-update open is gone");
    t.eq((app.match(/reviewOnAppLaunch\(/g) || []).length, 1, "the app's load counts its open from one place");
    t.ok(!/reviewOnAppLaunch\(\{ demo: false \}\)/.test(app), "R2-2 the launch no longer skips the shared check with a fixed demo: false");
    const gateSet = app.indexOf("reviewGateRef.current = { signedIn: !!user, hydrated: !!user && hydratedUidRef.current === user.id, demo: !!appData?.demo, sample: _activationOff };");
    const watch = app.indexOf("useEffect(() => startReviewWatch(() => reviewGateRef.current), []);");
    const launch = app.indexOf("useEffect(() => { reviewOnAppLaunch(); }, [user, appData]);");
    t.ok(gateSet > 0 && watch > gateSet && launch > watch, "R2-2 one gate for the launch and every resume (signed in, data loaded, demo, sample household), registered before the launch's effect");
    const meetCalls = app.match(/reviewOnMeetingDone\(/g) || [];
    t.eq(meetCalls.length, 1, "the meeting asks from exactly one place");
    // Meeting memory (2026-11-08): markDone saves the meeting first, so "after the meeting is recorded" is now checked
    // in order: the review is asked only after a save that succeeded and after the meeting is marked done.
    const md = app.slice(app.indexOf("const markDone = async () => {"), app.indexOf("return heldToday", app.indexOf("const markDone = async () => {")));
    const iOk = md.indexOf("if (!res || !res.ok) {"), iDone = md.indexOf("lastMeetingAt: new Date().toISOString()"), iAsk = md.indexOf("reviewOnMeetingDone({ demo: !!data.demo });");
    t.ok(md.length > 0 && iOk > 0 && iDone > iOk && iAsk > iDone && /if \(!res \|\| !res\.ok\) \{[^}]*return; \}/.test(md),
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
    t.ok(/registerPlugin\("FlourishReview"\)/.test(rd("src", "lib", "reviewPrompt.js")) && /await plugin\.requestReview\(\)/.test(rd("src", "lib", "reviewPrompt.js")), "reviewPrompt.js asks through it, at the moment of asking only");
  }

  t.summary("reviewPrompt.test");
})();
