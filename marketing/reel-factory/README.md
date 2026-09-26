# Flourish reel factory

Turns a written script into a finished faceless Instagram Reel: voice, screen recording,
composition, captions, and a quality gate that fails the render when the result is not shippable.

**One command per week:**

```sh
cd marketing/reel-factory
npm install          # once
npm run reels -- week-01
```

The app's dev server must be running first, in the repo root, with **placeholder** Supabase
variables so the recorder cannot reach a real project:

```sh
VITE_SUPABASE_URL="https://placeholder.supabase.co" \
VITE_SUPABASE_PUBLISHABLE_KEY="placeholder" \
npx vite --port 5174 --strictPort
```

**Port 5174, not 5173.** 5173 is Vite's default and is routinely taken by another project — a reel
recorded against the wrong app is the failure this avoids. The factory defaults to 5174 and takes
`--url` to point somewhere else:

```sh
npm run reels -- week-01 --url=http://localhost:5199
```

It refuses any URL that is not a local dev server.

## What comes out

`out/week-01/`
- `reel-01.mp4` — 1080×1920, 60 fps, 20–28 s, H.264
- `reel-01-cover.jpg` — the cover frame
- `reel-01-contact.jpg` — a 9-frame contact sheet for review
- `reel-01-captions.md` — the Instagram, TikTok and Facebook captions

## Where things live

| | |
|---|---|
| `STYLE.md` | **The quality standard. Read this first.** Every rule in it is enforced in code. |
| `scripts/week-NN/reel-NN.json` | The script: hook, voice lines with the screen each one shows, caption lines, end card, and the per-platform captions. **All copy lives here** — none is written in code. |
| `src/cli.mjs` | The pipeline, stage by stage. |
| `src/voice.mjs` | ElevenLabs, or the macOS `say` voice when there is no key. |
| `src/record.mjs` | Playwright. Demo mode, local dev server only. |
| `src/audio.mjs` | Narration assembly, −14 LUFS normalisation, UI tones, optional music. |
| `remotion/` | The composition. |
| `src/qc.mjs` | The quality gate. |

## The ElevenLabs key

Copy `.env.example` to `.env` and fill in:

```
ELEVENLABS_API_KEY=your-key-here
ELEVENLABS_VOICE_ID=your-voice-id-here
```

`.env` is gitignored. The key is read straight into a request header — it is never printed, never
written to any output file, and never included in an error message.

**Without a key the pipeline still runs end to end**, using the macOS `say` voice. One thing
differs and it is recorded in the caption file: ElevenLabs returns real per-character timestamps,
so caption timings are *measured*; `say` returns none, so they are *estimated* from each word's
length scaled to the clip. Estimated timings are good enough to review a cut and not good enough
to ship a paid ad.

## Licences

- **Remotion** is free for individuals and for companies of **up to 3 people**. Flourish is inside
  that today. Past three people it needs a company licence — see
  <https://remotion.dev/license>. This is worth re-checking before anyone else joins.
- **Music**: only ElevenLabs music, and only where the key's plan permits commercial use. If that
  is not configured there is **no music**. There is deliberately no "royalty-free" fallback: an
  unlicensed track on a brand account is a takedown and a strike, and silence is not.
- The **app recording** is Flourish's own product in demo mode, with synthetic data.

## Rules this pipeline keeps

- **Synthetic data only.** The recorder enters demo mode the way a visitor does, never signs in,
  and refuses any URL that is not a local dev server.
- **Nothing on screen without "Example".** Every frame of app footage carries the label, and the
  gate fails the render if one does not.
- **The copy is the writer's.** Captions are copied from the script file; nothing here writes
  marketing text.
