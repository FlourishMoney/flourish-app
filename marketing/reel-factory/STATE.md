# Reel factory — state of play

**Read this before acting on any reel-factory brief.** Briefs are written from memory and go stale;
this file is written from the repo. Where a brief and this file disagree, check the repo and say so.

_Last updated 2026-09-27._

## Status: ON HOLD

The factory is parked behind the safe-to-spend film. Nothing here is scheduled.

## Voice: OFF

**Flourish reels carry no AI voice.** Founder decision, 2026-09-27. This overrides every earlier
brief, including the v5–v9 work that selected and tuned a narrator.

The machinery still exists and still works — `src/voice.mjs`, `take.mjs`, `dub.mjs`, `dubTake.mjs`,
the audition harness, and the gate checks that enforce a real read (`voice is ElevenLabs`,
`caption timings measured`). It is dormant, not deleted. If voice is ever switched back on:

- env var is **`ELEVENLABS_VOICE_ID`** — not `VOICE_ID`, which nothing reads
- the voice chosen and kept through a four-voice audition was **Sarah, `EXAVITQu4vr4xnSDxMaL`**
  (`eleven_multilingual_v2`); Matilda, Eric and Brian also passed 12/12
- `.env` holds `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, is gitignored,
  and is never printed by the pipeline

## Posting path: Jitter

Jitter is how reels get posted now. The Remotion render path in this folder is not the posting path.

## Pipeline: v9

`fa6928c` — "v9: the bed is instrumental by rule, and the gate can prove it".

One command per week: `npm run reels -- week-03 --url=http://localhost:PORT`. It speaks the lines,
records the screens, writes captions, renders, lays the music bed, normalises to −14 LUFS, and runs
the gate. **The gate fails the render; it does not warn.**

- video gate: **26 checks** (`src/qc.mjs`)
- audio gate: **12 checks** (`src/qcAudio.mjs`)

## Recording: film current main, never this worktree

**This worktree's app is 64 commits behind `origin/main`.** A dev server started here serves a UI
that no longer exists: its only "Example" label is a 10px uppercase one that main replaced with the
13px gold pill, and it has none of the layout rule (`GAP`, `wrapText`, 44px tap targets).

Any future recording must point at a checkout of **current main** and pass `--url`. Do not merge
main into this branch to fix it — run main's dev server separately. 5173 is another project; this
factory defaults to 5174, and a separate main server can take any other free port.

## Registry (`src/record.mjs`)

Added 2026-09-27, every anchor and target read back out of the running demo on main, not taken from
a script file:

| screen | shot |
|---|---|
| `today-headline` | Today hero, wide — the safe-to-spend figure carries it, nothing to push in on |
| `today-breakdown` | the working sheet behind the figure; opened by `tap` on the button's **aria-label** |
| `bill-due-card` | Today's "One thing to know" card; anchored on the heading, because which bill it names is computed and the due-date wording moves daily |
| `meet-agenda` | Meet, wide — five computed lines plus the decision card do not survive a push-in |

Fixed the same day: **`payday-deposit`** anchored on `"+$2,840 deposit"`, which matches nothing on
main. The app names a deposit after the income entry that earned it — `"💰 +$2,840 Full-time Job"`.
That entry would have thrown on the next run of any week.

## Loader (`src/cli.mjs`)

`scripts/<week>/` holds reel scripts **and** the `.dub.json` / `.take.json` specs for the one-take
pipeline. The loader used to read every `.json` as a script and die on `script.voice.entries is not
a function`, because a spec's `voice` is an object. It now selects **by shape** — `voice` and
`captionLines` both arrays — so a spec cannot be mistaken for a script whatever it is named.

## Week-03 scripts: five corrections

`scripts/reels-week-03.json` is the founder's original, kept as written. The per-reel files the
pipeline reads are `scripts/week-03/reel-03-0N.json`, and they carry five corrections — each one a
claim that did not hold when checked against the running app:

| reel | was | now | why |
|---|---|---|---|
| 03-01 | "Every bill." | "Every bill, added up." | the shot (`today-breakdown`) shows one total, `Upcoming bills $65`, not a list |
| 03-02 | "Flourish finds them the moment you link your bank." | "Flourish finds them in your last 90 days of transactions." | detection needs **3 occurrences** inside the **90 days** fetched on connect; an account with no history yields nothing |
| 03-03 | "Flourish shows you exactly which ones." | "Flourish lays out every payday for 90 days." | **the app has no three-payday feature.** Nothing on Today or the 90-day Watch view says "three times", "extra paycheque" or "third pay" |
| 03-03 | "So you know the extra paycheque is coming," | "So you can see it coming," | the app lists paydays with dates; the counting is the viewer's |
| 03-03 | "and what to do with it." | "and what's already spoken for." | nothing advises what to do with an extra deposit; the bills card shows commitments |

The Instagram/TikTok/Facebook captions for 03-02 and 03-03 were narrowed to match.

**None of the four week-03 reels has been rendered.**

## Not to be repeated

`out/` and `recordings/` are gitignored; `remotion/public/` tracks only `.gitkeep`. A render
overwrites `out/<week>/<id>.mp4` in place — there is no version suffix, so **re-running a week
destroys the previous cut of that reel.** Copy anything worth keeping out of `out/` first.
