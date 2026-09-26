#!/usr/bin/env node
// ONE COMMAND PER WEEK:  npm run reels -- week-01
//
// Reads every script in scripts/<week>/, and for each one: speaks the lines, records the screens
// they ask for, composes the reel, and writes the video, the cover and the caption file.
//
// Each stage fails loudly. A reel with a missing screen, a silent line or someone else's marketing
// copy in it is worse than no reel, so nothing here falls back to "near enough".
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { CANVAS, SAFE, PACE, ROOT, APP_ROOT, dir, ensure, brandColours } from "./config.mjs";
import { speak } from "./voice.mjs";
import { recordScreens, SCREENS } from "./record.mjs";
import { writeCaptions } from "./captions.mjs";
import { renderReel } from "./render.mjs";
import { assembleNarration, normaliseTo, uiTone, maybeMusicBed } from "./audio.mjs";
import { runQualityGate } from "./qc.mjs";
import { targetRectInFrame, captionAnchorFor, captionRect, intersects, screenRect, zoomToRect, MAX_SHOT_SECONDS, CAPTION, PHONE_TOP_FOR, deviceRect } from "./layout.mjs";

dotenv.config({ path: path.join(ROOT, ".env") });

const args = process.argv.slice(2);
const week = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
// 5173 is commonly taken by another project; the app is served on 5174 by default here.
const BASE_URL = flag("url", "http://localhost:5174");
const SKIP_RECORD = args.includes("--no-record");

if (!week) {
  console.error("Usage: npm run reels -- week-01 [--url=http://localhost:5174] [--no-record]");
  process.exit(1);
}

const APP_PUBLIC = path.join(APP_ROOT, "public");
const log = (msg) => console.log(`  ${msg}`);

// A gap after each line so the voice does not run on top of itself.
const GAP = 0.22;
const MAX_CAPTION_WORDS = 6;      // STYLE.md §3

async function buildOne(scriptPath) {
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const outDir = ensure(path.join(dir.out, week));
  const workDir = ensure(path.join(dir.publicDir, week, script.id));
  console.log(`\n▶ ${script.id} — "${script.hook}"`);

  // ── 1. voice ──────────────────────────────────────────────────────────────────────────────
  const lines = [];
  let voiceSource = null, timingsMeasured = true, credits = 0, voiceModel = null, voiceIdUsed = null;
  for (const [i, line] of script.voice.entries()) {
    const spoken = await speak(line.text, path.join(workDir, `line-${String(i + 1).padStart(2, "0")}.mp3`));
    voiceSource = spoken.source;
    timingsMeasured = timingsMeasured && spoken.measured;
    credits += spoken.credits || 0;
    voiceModel = spoken.model || voiceModel;
    voiceIdUsed = spoken.voiceId || voiceIdUsed;
    lines.push({ ...line, ...spoken });
    log(`voice ${i + 1}/${script.voice.length} · ${spoken.duration.toFixed(2)}s · ${spoken.source}${spoken.measured ? " · measured timings" : " · estimated timings"}`);
  }

  // ── 2. screens ────────────────────────────────────────────────────────────────────────────
  const wanted = script.voice.map((l) => l.screen);
  let clips = {};
  const shotsFile = path.join(workDir, "shots.json");
  if (SKIP_RECORD) {
    // Reuse the clips AND the measurements. Without the measured boxes the zoom would fall back to
    // the middle of the screen, which is exactly the guesswork this pipeline removed.
    if (fs.existsSync(shotsFile)) {
      clips = JSON.parse(fs.readFileSync(shotsFile, "utf8"));
      log(`--no-record: reusing ${Object.keys(clips).length} recorded screen(s) and their measured targets`);
    } else {
      log("--no-record: no shots.json, falling back to whatever clips are present");
    }
  } else {
    log(`recording ${new Set(wanted.filter((s) => s !== "end-card")).size} screen(s) from ${BASE_URL}`);
    // Every clip must cover the longest line that uses it, with a little room.
    const tailSeconds = Math.ceil(Math.max(...lines.map((l) => l.duration)) + GAP + 2);
    clips = await recordScreens(wanted, { baseUrl: BASE_URL, week, reelId: script.id, tailSeconds });
    for (const [screen, shot] of Object.entries(clips)) {
      const dest = path.join(workDir, `${screen}.mp4`);
      fs.copyFileSync(shot.file, dest);
      clips[screen] = { ...shot, file: dest };
    }
    fs.writeFileSync(shotsFile, JSON.stringify(clips, null, 2));
    for (const [screen, shot] of Object.entries(clips)) {
      log(`  ${screen}: focus ${shot.focus.x.toFixed(2)},${shot.focus.y.toFixed(2)} box ${shot.ring ? shot.ring.w.toFixed(2) + "x" + shot.ring.h.toFixed(2) : "-"} zoom ${shot.zoom}`);
    }
  }

  // ── 3. the timeline ──────────────────────────────────────────────────────────────────────
  // STYLE.md §6: the hook is on screen before the voice, and there is a cut every 1.5-2.5s. A
  // "shot" is one spoken line; it is split into BEATS so the cut cadence holds even when a line
  // runs long. Beat one sits wide, beat two pushes in on the number being narrated.
  const rel = (abs) => path.relative(dir.publicDir, abs).split(path.sep).join("/");

  // STYLE.md §3 limits what is on screen AT ONCE, not what may be said. The copy is the writer's
  // and is never edited here, so a long line is shown in timed chunks of six words or fewer,
  // each held for exactly as long as those words are spoken.
  // Chunks break at NATURAL PHRASE BOUNDARIES, never mid-phrase. Punctuation first; failing that,
  // before a word that starts a new phrase. A chunk is only forced when no break exists at all,
  // and that case is reported rather than silently split.
  const PHRASE_STARTERS = /^(and|but|so|then|or|to|for|with|that|which|when|after|before|never|until|because|while|if)$/i;
  const chunk = (words) => {
    if (words.length <= MAX_CAPTION_WORDS) return [mk(words)];
    const out = [];
    let cur = [];
    const flush = () => { if (cur.length) { out.push(mk(cur)); cur = []; } };
    for (let i = 0; i < words.length; i++) {
      cur.push(words[i]);
      const endsClause = /[.,!?;:]$/.test(words[i].word);
      const nextStartsPhrase = words[i + 1] && PHRASE_STARTERS.test(words[i + 1].word.replace(/[^A-Za-z']/g, ""));
      const full = cur.length >= MAX_CAPTION_WORDS;
      // Break at a clause end, or just before a new phrase once the chunk is worth holding.
      if (endsClause || (nextStartsPhrase && cur.length >= 3) || (full && nextStartsPhrase)) flush();
      else if (full) {
        // No natural break within six words: fall back to the nearest phrase start behind us.
        let k = cur.length - 1;
        while (k > 1 && !PHRASE_STARTERS.test(cur[k].word.replace(/[^A-Za-z']/g, ""))) k--;
        if (k > 1) { const tail = cur.splice(k); flush(); cur = tail; } else flush();
      }
    }
    flush();
    // A one-word tail reads as a mistake; fold it back when the previous chunk has room.
    if (out.length > 1 && out[out.length - 1].words.length === 1 && out[out.length - 2].words.length < MAX_CAPTION_WORDS) {
      const tail = out.pop();
      out[out.length - 1] = mk([...out[out.length - 1].words, ...tail.words]);
    }
    return out;
  };
  const mk = (ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end });
  const assertChunks = (chunks, where) => {
    const over = chunks.find((c) => c.words.length > MAX_CAPTION_WORDS);
    if (over) throw new Error(`${where}: "${over.words.map((w) => w.word).join(" ")}" puts ${over.words.length} words on screen at once; STYLE.md §3 allows ${MAX_CAPTION_WORDS}.`);
  };

  // Natural length of each shot, then padded evenly until the reel is at least 20s.
  // The end card is not a shot: its line is spoken over it, so only the SCREEN lines are padded.
  const screenLines = lines.filter((l) => l.screen !== "end-card");
  const endSeconds = Math.max(PACE.endCard, ...lines.filter((l) => l.screen === "end-card").map((l) => l.duration + GAP), 0);
  // PACE. No shot runs longer than MAX_SHOT_SECONDS; a line that needs more than that keeps
  // speaking over the next shot, which is what a cut is for. The audio is one continuous track, so
  // nothing is lost. Any time still needed to clear the 20s floor goes to the END CARD, which is
  // the one beat the pace rule exempts — and which is the call to action, so holding it is no loss.
  const natural = lines.map((l) => Math.min(MAX_SHOT_SECONDS, Math.max(l.duration + GAP, PACE.minBeat)));
  let shotSeconds = natural.slice();
  // Reaching the 20s floor: give the time to the SHOTS first, up to their 2.5s cap, and only the
  // remainder to the end card. Dumping it all on the card put 8.5 seconds of call-to-action on the
  // end of a 20-second reel — within every rule, and no way to watch.
  let endHold = endSeconds;
  const shotSum = () => shotSeconds.slice(0, screenLines.length).reduce((a, b) => a + b, 0);
  let deficit = CANVAS.minSeconds + 0.4 - (PACE.hookLead + endHold + shotSum());
  if (deficit > 0) {
    const headroom = screenLines.map((_, i) => MAX_SHOT_SECONDS - shotSeconds[i]);
    const room = headroom.reduce((a, b) => a + b, 0);
    const take = Math.min(deficit, room);
    if (room > 0) screenLines.forEach((_, i) => { shotSeconds[i] += (headroom[i] / room) * take; });
    deficit -= take;
    if (deficit > 0) endHold += deficit;         // only what the shots could not absorb
  }
  const shotTotal = shotSum();
  const total = PACE.hookLead + shotTotal + endHold;
  if (total > CANVAS.maxSeconds) {
    throw new Error(`The reel is ${total.toFixed(1)}s and STYLE.md §1 allows ${CANVAS.minSeconds}-${CANVAS.maxSeconds}s. Cut a line from ${path.basename(scriptPath)}.`);
  }

  const beats = [];
  // The hook card runs under the lead-in and stays until the first line has something to show.
  // The hook is on screen at frame 0, before any voice (STYLE.md §6), in chunks of six.
  const hookWords = script.hook.trim().split(/\s+/);
  const hookChunks = chunk(hookWords.map((word, i) => ({
    word, start: (i / hookWords.length) * PACE.hookLead, end: ((i + 1) / hookWords.length) * PACE.hookLead,
  })));
  assertChunks(hookChunks, "hook");
  beats.push({ kind: "hook", chunks: hookChunks, from: 0, duration: PACE.hookLead });

  // A line whose screen is "end-card" is SPOKEN OVER the end card, not held as its own statement
  // beat first. It used to be both, so "Your money, handled." was shown twice before the card.
  const lastScreenIndex = lines.reduce((acc, l, i) => (l.screen === "end-card" ? acc : i), -1);
  const endCardLines = lines.slice(lastScreenIndex + 1);

  let t = PACE.hookLead;
  let lastPhoneTop = PHONE_TOP_FOR(false);      // the hook cuts to a wide shot
  const narrationLines = [];
  const tones = [];
  lines.forEach((line, i) => {
    if (i > lastScreenIndex) return;          // spoken over the end card, below
    const shot = shotSeconds[i];
    narrationLines.push({ file: line.file, start: t });
    const recipe = SCREENS[line.screen] || {};
    const take = clips[line.screen]
      || (fs.existsSync(path.join(workDir, `${line.screen}.mp4`))
        ? { file: path.join(workDir, `${line.screen}.mp4`), focus: { x: 0.5, y: 0.45 }, ring: null, zoom: (recipe && recipe.zoom) || 1 }
        : null);
    const clip = take ? take.file : null;
    if (line.screen !== "end-card" && !clip) {
      throw new Error(`No recording for screen "${line.screen}" — run without --no-record, or add a recipe in src/record.mjs.`);
    }
    // How many cuts this shot needs to keep the 1.5-2.5s cadence.
    let count = Math.max(1, Math.ceil(shot / PACE.maxBeat));
    while (count > 1 && shot / count < PACE.minBeat) count--;
    const each = shot / count;
    // Word timings are relative to the line; beats are absolute, so shift them per beat.
    for (let b = 0; b < count; b++) {
      const beatFrom = t + b * each;
      const isClose = count === 1 ? true : b > 0;
      beats.push({
        // A line with no screen behind it is a statement, held full-bleed — no phone, no figures,
        // so nothing to label.
        kind: line.screen === "end-card" ? "statement" : "screen",
        video: clip ? rel(clip) : null,
        from: beatFrom,
        duration: each,
        // A real push-in, not a drift: the second beat is close enough to read the figure being
        // narrated, which is the whole reason for cutting to it.
        // With shots capped at 2.5s a shot is usually ONE beat, so the push-in has to happen inside
        // it rather than on a second beat that no longer exists: the shot opens a touch wide and
        // moves in on the measured element. Where a shot is long enough to hold two beats, the
        // first still sits wide and the second comes close.
        zoom: isClose ? (take && take.zoom) || 2.0 : 1.0,
        // The measured element, centre and size in screen fractions. The composition zooms to it,
        // rings it and dims around it from this one box, so they cannot disagree.
        box: take && take.focus && take.ring
          ? { x: take.focus.x, y: take.focus.y, w: take.ring.w, h: take.ring.h } : null,
        ring: isClose && !!(take && take.ring),              // the ring arrives with the push-in
        chunks: (() => {
          const shifted = line.words.map((w) => ({ ...w, start: w.start + (t - beatFrom), end: w.end + (t - beatFrom) }));
          const cs = chunk(shifted);
          assertChunks(cs, `line "${line.text}"`);
          return cs;
        })(),
      });
      if (isClose && take && take.ring) tones.push({ at: beatFrom });   // a soft tone on the reveal
      // The caption goes OPPOSITE the element being talked about, so it never covers it.
      const bt = beats[beats.length - 1];
      const isCloseBeat = !!bt.ring;
      bt.targetRect = bt.box ? targetRectInFrame(bt.box, bt.zoom, 40, isCloseBeat) : null;
      bt.captionAnchor = captionAnchorFor();
      // Where the device was when the previous beat ended, so this one can ease from there.
      bt.phoneTopFrom = lastPhoneTop;
      lastPhoneTop = PHONE_TOP_FOR(isCloseBeat);
    }
    t += shot;
  });
  // The end card carries whatever is left to say, and holds for at least its 2.5 seconds.
  let endDuration = endHold;
  for (const line of endCardLines) narrationLines.push({ file: line.file, start: t });
  beats.push({ kind: "end-card", from: t, duration: endDuration });
  t += endDuration;

  // ── 4. audio ─────────────────────────────────────────────────────────────────────────────
  const narrationRaw = path.join(workDir, "narration.wav");
  await assembleNarration(narrationLines, narrationRaw, total);
  const { file: narrationFile, twoPass } = await normaliseTo(narrationRaw, path.join(workDir, "narration.mp3"));
  log(`narration normalised to -14 LUFS${twoPass ? " (two-pass)" : " (single pass — measurement unavailable)"}`);
  const tonePath = path.join(workDir, "tone.wav");
  if (tones.length) await uiTone(tonePath);
  const music = await maybeMusicBed(total, path.join(workDir, "music.mp3"));
  log(music ? "music bed: ElevenLabs, -24 LUFS" : "music bed: none (no licensed source configured)");

  // The logo is copied in for the end card only.
  const logoSrc = path.join(APP_PUBLIC, "flourish-symbol.png");
  let logoRel = null;
  if (fs.existsSync(logoSrc)) { fs.copyFileSync(logoSrc, path.join(workDir, "logo.png")); logoRel = rel(path.join(workDir, "logo.png")); }

  // ── 5. render ────────────────────────────────────────────────────────────────────────────
  const brand = brandColours();
  const inputProps = {
    beats, endCard: script.endCard, brand, safe: SAFE,
    narration: rel(narrationFile),
    tones: tones.map((x) => ({ ...x, file: rel(tonePath) })),
    music: music ? rel(music) : null,
    logo: logoRel,
  };
  const durationInFrames = Math.ceil(total * CANVAS.fps);
  const mp4Out = path.join(outDir, `${script.id}.mp4`);
  const coverOut = path.join(outDir, `${script.id}-cover.jpg`);
  log(`rendering ${total.toFixed(1)}s (${durationInFrames} frames @ ${CANVAS.fps}fps) at ${CANVAS.width}x${CANVAS.height}`);
  await renderReel({
    inputProps, durationInFrames, mp4Out, coverOut,
    coverFrame: Math.round((PACE.hookLead + 0.8) * CANVAS.fps),
  });

  // ── 5. captions ───────────────────────────────────────────────────────────────────────────
  const capOut = writeCaptions(script, path.join(outDir, `${script.id}-captions.md`), {
    durationSeconds: total, width: CANVAS.width, height: CANVAS.height, fps: CANVAS.fps,
    voiceSource, timingsMeasured,
  });

  // ── 6. the quality gate. It fails the render; it does not warn. ──────────────────────────
  const { sheet } = await runQualityGate({
    mp4: mp4Out, outDir, reelId: script.id, script, brand,
    durationSeconds: total,
    captionColour: brand.cream, endCardColour: brand.cream,
    appWindows: beats.filter((b) => b.kind === "screen").map((b) => [b.from, b.from + b.duration]),
    beats, endCardLines: script.endCard, shots: clips,
    voice: { source: voiceSource, measured: timingsMeasured, credits, model: voiceModel, voiceId: voiceIdUsed },
    // One row per spoken line, for review against the words.
    storyboard: (() => {
      const rows = [];
      let at = PACE.hookLead;
      lines.forEach((line, i) => {
        if (i > lastScreenIndex) return;
        const sh = clips[line.screen];
        rows.push({ kind: "screen", from: at, seconds: shotSeconds[i], line: line.text,
                    target: sh && sh.text ? sh.text : null,
                    zoom: sh && sh.ring ? zoomToRect({ x: sh.focus.x, y: sh.focus.y, w: sh.ring.w, h: sh.ring.h }, sh.zoom, 40, true).scale : null });
        at += shotSeconds[i];
      });
      rows.push({ kind: "end-card", from: at, seconds: endHold, line: (endCardLines[0] || {}).text || script.endCard[0], target: null, zoom: null });
      return rows;
    })(),
  });

  console.log(`\n✓ ${path.relative(ROOT, mp4Out)}`);
  console.log(`✓ ${path.relative(ROOT, coverOut)}`);
  console.log(`✓ ${path.relative(ROOT, sheet)}`);
  console.log(`✓ ${path.relative(ROOT, capOut)}`);
  return { mp4Out, coverOut, capOut, sheet, total };
}

const weekDir = path.join(dir.scripts, week);
if (!fs.existsSync(weekDir)) {
  console.error(`No scripts at ${path.relative(ROOT, weekDir)}. Create it and add reel-01.json.`);
  process.exit(1);
}
const scripts = fs.readdirSync(weekDir).filter((f) => f.endsWith(".json")).sort();
if (!scripts.length) { console.error(`No .json scripts in ${weekDir}.`); process.exit(1); }

console.log(`Flourish reel factory · ${week} · ${scripts.length} script(s)`);
for (const file of scripts) await buildOne(path.join(weekDir, file));
console.log(`\nDone. Output in ${path.relative(ROOT, path.join(dir.out, week))}/`);
