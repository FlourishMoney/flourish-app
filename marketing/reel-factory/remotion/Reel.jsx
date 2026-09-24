// The composition. STYLE.md is the specification; this file is its implementation.
//
// It decides nothing about wording, colour or timing on its own: the copy comes from the script
// file, the colours from the app's theme, the timings from the measured voice. What lives here is
// the LOOK — the frame, the motion and the restraint.
import React from "react";
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring, Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";

// Self-hosted by @remotion/google-fonts — bundled into the render, no network call (STYLE.md §3).
const { fontFamily } = loadFont();

const MAX_TILT_DEG = 8;          // STYLE.md §4

// The frame keeps the RECORDING's aspect ratio (390x844), so nothing is cropped away by
// objectFit. Its height is chosen so the device sits between the top safe band and the caption
// band and never touches either — a caption over the screen is the thing that makes a reel look
// like a template.
const PHONE_TOP = 330;                           // clears the "Example" pill below the safe line
const PHONE = { w: 462, h: 1000, radius: 54 };   // 462/1000 == 390/844, so nothing is cropped
const CAPTION_TOP = PHONE_TOP + PHONE.h + 38;    // where the lower third starts

// ── the device ───────────────────────────────────────────────────────────────────────────────
// One frame, one shadow, one highlight. The tilt and the push-in are driven by a spring so the
// move starts and settles like a physical object rather than a linear slide.
const Phone = ({ src, brand, progress, focus, zoom }) => {
  const tilt = interpolate(progress, [0, 1], [MAX_TILT_DEG, MAX_TILT_DEG * 0.35]);
  // THE SCREEN ZOOMS, NOT THE DEVICE. Scaling the whole phone pushed its corners up into the
  // reserved top band and down into the caption — the layout has to stay fixed, so the push-in
  // happens inside the bezel, anchored on the number being narrated. This is also what the move
  // looks like in a product film: the camera does not grow the object, it moves closer to it.
  const scale = interpolate(progress, [0, 1], [1, zoom]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: PHONE_TOP, perspective: 2200 }}>
      <div style={{
        width: PHONE.w, height: PHONE.h,
        transform: `rotateY(${tilt}deg) rotateX(${tilt * 0.22}deg)`,
        transformStyle: "preserve-3d",
        borderRadius: PHONE.radius + 12, padding: 11,
        background: "linear-gradient(150deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.16) 100%)",
        boxShadow: `0 60px 140px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.05)`,
      }}>
        <div style={{ width: "100%", height: "100%", borderRadius: PHONE.radius, overflow: "hidden", background: brand.bg, position: "relative" }}>
          {src ? (
            <OffthreadVideo src={src} muted style={{
              width: "100%", height: "100%", objectFit: "cover",
              transform: `scale(${scale})`, transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`,
            }} />
          ) : null}
          {/* a single soft screen highlight, not a gradient wash */}
          <AbsoluteFill style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 38%)" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// A thin ring over the number being narrated. Fades in with the push-in, never bounces.
const HighlightRing = ({ brand, progress, focus, box, zoom = 1 }) => {
  const opacity = interpolate(progress, [0.15, 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [1, zoom]);
  if (!box) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: PHONE_TOP, pointerEvents: "none" }}>
      <div style={{ width: PHONE.w, height: PHONE.h, position: "relative", overflow: "hidden", borderRadius: PHONE.radius,
                    transform: `scale(${scale})`, transformOrigin: `${focus.x * 100}% ${focus.y * 100}%` }}>
        <div style={{
          position: "absolute",
          left: `${(focus.x - box.w / 2) * 100}%`, top: `${(focus.y - box.h / 2) * 100}%`,
          width: `${box.w * 100}%`, height: `${box.h * 100}%`,
          border: `2px solid ${brand.greenBright}`, borderRadius: 18,
          boxShadow: `0 0 0 6px ${brand.greenBright}1A`,
          opacity,
        }} />
      </div>
    </AbsoluteFill>
  );
};

// STYLE.md §5: visible for the whole time app footage is on screen. Inside the safe zone.
const ExampleLabel = ({ brand, safe }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: safe.top + 12 }}>
    <div style={{
      fontFamily, fontSize: 26, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase",
      color: brand.bg, background: brand.cream, padding: "9px 22px", borderRadius: 999,
    }}>Example</div>
  </AbsoluteFill>
);

// STYLE.md §8: word by word, current word lime, lower third, two lines at most.
const Caption = ({ chunks = [], brand, safe, fps }) => {
  const t = useCurrentFrame() / fps;
  // Six words at most on screen (STYLE.md §3): show the chunk being spoken, and hold the last one
  // rather than cutting to nothing between chunks.
  const active = chunks.filter((c) => t >= c.start - 0.05).pop() || chunks[0];
  const words = active ? active.words : [];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: CAPTION_TOP }}>
      <div style={{
        maxWidth: 880, textAlign: "center", fontFamily, fontWeight: 800,
        fontSize: 54, lineHeight: 1.22, letterSpacing: -1.1,
      }}>
        {words.map((w, i) => {
          const spoken = t >= w.start - 0.03;
          const current = spoken && t < w.end + 0.08;
          return (
            <span key={i} style={{
              color: current ? brand.greenBright : (spoken ? brand.cream : `${brand.cream}59`),
              marginRight: 14, display: "inline-block",
            }}>{w.word}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// The hook: on screen from frame 0, before the voice (STYLE.md §6).
const HookCard = ({ chunks = [], brand, safe }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const s = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const active = chunks.filter((c) => t >= c.start - 0.05).pop() || chunks[0];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: `${safe.top}px 80px ${safe.bottom}px` }}>
      <div style={{
        fontFamily, fontWeight: 900, fontSize: 92, lineHeight: 1.12, letterSpacing: -2.6,
        color: brand.cream, textAlign: "center",
        opacity: s, transform: `translateY(${(1 - s) * 26}px)`,
      }}>{active ? active.words.map((w) => w.word).join(" ") : ""}</div>
    </AbsoluteFill>
  );
};

// STYLE.md §9. The logo appears here and nowhere else.
const EndCard = ({ lines, brand, safe, logo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = (i) => spring({ frame: frame - i * 14, fps, config: { damping: 200, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: `${safe.top}px 80px ${safe.bottom}px` }}>
      <div style={{ textAlign: "center", fontFamily }}>
        <div style={{ opacity: at(0), transform: `translateY(${(1 - at(0)) * 18}px)`, marginBottom: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          {logo ? <Img src={staticFile(logo)} style={{ width: 86, height: 86 }} /> : null}
          <span style={{ fontSize: 62, fontWeight: 800, color: brand.cream, letterSpacing: -1.5 }}>flourish</span>
        </div>
        {lines.map((line, i) => {
          const s = at(i + 1);
          const lead = i === 0;
          return (
            <div key={i} style={{
              opacity: s, transform: `translateY(${(1 - s) * 18}px)`,
              color: lead ? brand.cream : `${brand.cream}D9`,
              fontWeight: lead ? 900 : 700,
              fontSize: lead ? 84 : 40,
              lineHeight: 1.25, letterSpacing: lead ? -2 : -0.3,
              marginBottom: lead ? 40 : 18,
            }}>{line}</div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Reel = ({ beats = [], endCard = [], brand, safe, narration, tones = [], music, logo }) => {
  const { height } = useVideoConfig();
  // STYLE.md §1 and §8, checked here so a layout edit cannot quietly push type into Instagram's UI.
  if (PHONE_TOP < safe.top) throw new Error(`The device starts at ${PHONE_TOP}px, inside the top safe band (${safe.top}px).`);
  if (CAPTION_TOP < PHONE_TOP + PHONE.h) throw new Error("The caption overlaps the device.");
  if (CAPTION_TOP + 150 > height - safe.bottom) throw new Error(`The caption runs into the bottom safe band (starts ${CAPTION_TOP}, band at ${height - safe.bottom}).`);
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: brand.bg, fontFamily }}>
      {/* STYLE.md §2: exactly one soft radial glow, in the app's green. */}
      <AbsoluteFill style={{ background: `radial-gradient(58% 38% at 50% 34%, ${brand.green}26 0%, ${brand.bg} 72%)` }} />

      {narration ? <Audio src={staticFile(narration)} /> : null}
      {music ? <Audio src={staticFile(music)} volume={0.5} /> : null}
      {tones.map((tone, i) => (
        <Sequence key={`t${i}`} from={Math.round(tone.at * fps)} durationInFrames={Math.round(0.25 * fps)}>
          <Audio src={staticFile(tone.file)} volume={0.5} />
        </Sequence>
      ))}

      {beats.map((beat, i) => {
        const from = Math.round(beat.from * fps);
        const dur = Math.max(1, Math.round(beat.duration * fps));
        return (
          <Sequence key={`b${i}`} from={from} durationInFrames={dur}>
            <BeatBody beat={beat} brand={brand} safe={safe} endCard={endCard} logo={logo} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// Split out so each beat gets its own frame counter (Sequence resets it), which is what makes the
// spring restart per beat and produce a match cut rather than one long drift.
const BeatBody = ({ beat, brand, safe, endCard, logo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (beat.kind === "end-card") return <EndCard lines={endCard} brand={brand} safe={safe} logo={logo} />;
  if (beat.kind === "hook" || beat.kind === "statement") return <HookCard chunks={beat.chunks} brand={brand} safe={safe} />;

  // 300-500ms settle on a spring (STYLE.md §5).
  const progress = spring({ frame, fps, config: { damping: 200, mass: 1.1 }, durationInFrames: Math.round(0.45 * fps) });
  const focus = beat.focus || { x: 0.5, y: 0.45 };
  return (
    <>
      <Phone src={beat.video ? staticFile(beat.video) : null} brand={brand} progress={progress} focus={focus} zoom={beat.zoom || 1} />
      {beat.ring ? <HighlightRing brand={brand} progress={progress} focus={focus} box={beat.ring} zoom={beat.zoom || 1} /> : null}
      <ExampleLabel brand={brand} safe={safe} />
      <Caption chunks={beat.chunks || []} brand={brand} safe={safe} fps={fps} />
    </>
  );
};
