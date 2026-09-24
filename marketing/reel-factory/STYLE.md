# Reel style — the standard every reel is held to

The target is Silicon Valley fintech marketing: Stripe, Ramp, Mercury, Apple product films.
**Calm, expensive, precise.** Restraint is the house style — if a shot is doing two things, it is
doing one too many.

This file is not advice. Every numbered rule below is enforced in code, and the checks in §10 fail
the render rather than warning about it. Where a rule is enforced, the file that enforces it is
named.

## 1. Format
1080 × 1920, **60 fps**, **20–28 seconds**, high-bitrate H.264 (CRF 16, yuv420p).
Nothing readable in the **top 250 px** or the **bottom 400 px** — that is where Instagram draws its
own interface over the video.
*Enforced:* `src/config.mjs` (`CANVAS`, `SAFE`), duration asserted in `src/cli.mjs`, bands checked
in `src/qc.mjs`.

## 2. Colour
Every colour is read from the app's own theme in `src/App.jsx` at render time. None is typed here
or in the composition; if the app renames one, the render stops.
- Background: the app's `bg`, with **at most one** soft radial glow in the app's `green`.
- Type: the app's `cream`.
- Accent: the app's `greenBright` (lime) on **one** word or number per shot, never more.
- No busy gradients, no stock photography, no people, no emoji.
*Enforced:* `brandColours()` in `src/config.mjs`; one glow per shot in `remotion/Reel.jsx`; the
one-accent rule is a property of the script (`emphasis`), asserted in `src/cli.mjs`.

## 3. Type
The app's own typeface, **Plus Jakarta Sans**, loaded locally through `@remotion/google-fonts` —
self-hosted at render, no network call, no Google Fonts stylesheet. Heavy weight (800/900) for
hooks. **At most 6 words on screen at once**, one idea per shot.
*Enforced:* `remotion/Reel.jsx` loads the font; the 6-word cap is asserted per caption line in
`src/cli.mjs`.

## 4. Device
A realistic iPhone frame: rounded bezel, soft shadow, subtle screen highlight. A slow 3D tilt of
**no more than 8°**. Push-in zooms onto the number being narrated, with a thin highlight ring.
The app is recorded at **deviceScaleFactor 3** so type is crisp at 1080 wide. Scrolling is
scripted and eased — never a raw wheel event, never a jump.
*Enforced:* `MAX_TILT_DEG` in `remotion/Reel.jsx`; `DEVICE.scale` and `easedScrollTo()` in
`src/record.mjs`.

## 5. Motion
Remotion `spring()` easing. Transitions **300–500 ms**. Match cuts between beats of the same shot.
No wipes, no spins, no template effects. Example figures may count up. The **“Example” label stays
visible for the whole time app footage is on screen** — it is never animated out.
*Enforced:* `remotion/Reel.jsx`; the label's presence is checked per frame in `src/qc.mjs`.

## 6. Pace
Hook text is on screen **within the first second, before the voice starts**. A cut every
**1.5–2.5 s**.
*Enforced:* `HOOK_LEAD` and the beat splitter in `src/cli.mjs`, asserted before render.

## 7. Audio
Narration **loudness-normalised to −14 LUFS** (two-pass `loudnorm`). An optional music bed at
about −24 LUFS, ducked under the voice, **only** from ElevenLabs music where the key permits
commercial use — otherwise **no music at all**. Never trending audio, never an unlicensed track.
A soft, synthesised UI tone on each number reveal (generated, not sampled).
*Enforced:* `src/audio.mjs`; measured on the finished file in `src/qc.mjs`.

## 8. Captions
Word by word from the voice timestamps, the current word in lime. Lower third, inside the safe
zone, **two lines at most**.
*Enforced:* `remotion/Reel.jsx`; line count and position checked in `src/qc.mjs`.

## 9. End card
The wordmark lockup, then “Your money, handled.”, then “Join the waitlist. First 50 households get
the founding price.”, then “Link in bio.” Held **2.5 s**. **The logo appears only here** — never
over app footage.
*Enforced:* `remotion/Reel.jsx`; the copy itself comes from the script file, never from code.

## 10. Quality gate
Runs automatically after every render. Prints one PASS/FAIL line per check and **fails the render**
on any FAIL.

| Check | Fails when |
|---|---|
| Contact sheet | — (always written: `out/week-NN/reel-NN-contact.jpg`, 9 frames) |
| Duration | outside 20–28 s |
| Frame rate | not 60 fps |
| Safe zone | cream type is found in the top 250 px or bottom 400 px |
| Example label | a frame showing app footage has no “Example” label |
| Contrast | caption or end-card text is below WCAG AA (4.5:1) on its background |
| Loudness | integrated loudness is not −14 LUFS ± 1.5 |
| Spelling | a caption or end-card word is not a real word and not an approved brand term |

*Enforced:* `src/qc.mjs`, called by `src/cli.mjs` after every render.

## What this rules out
Zoom-bounce transitions. Three colours of text in one frame. A caption that fills the screen.
Emoji. Anything that looks like it came from a template. A number on screen without “Example”
beside it. Music that someone else owns.
