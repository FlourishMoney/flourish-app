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
import { PHONE as GEO, BEZEL, PILL, CAPTION, captionRect, zoomToRect, screenRect, PHONE_TOP_FOR } from "../src/layout.mjs";

// Self-hosted by @remotion/google-fonts — bundled into the render, no network call (STYLE.md §3).
const { fontFamily } = loadFont();

const MAX_TILT_DEG = 8;          // STYLE.md §4

// Geometry lives in src/layout.mjs so the composition and the quality gate compute it once, from
// the same numbers. The device is 80% of the frame width at the recording's true 390:844 ratio,
// so it is taller than the canvas and runs off the bottom. Its TOP moves: lower on a wide shot so
// the caption has clean background above it, higher on a zoom so more screen is visible — eased
// between, never cut.
const PHONE = { w: GEO.w, h: GEO.h, radius: GEO.radius };

// ── the device ───────────────────────────────────────────────────────────────────────────────
// One frame, one shadow, one highlight. The tilt and the push-in are driven by a spring so the
// move starts and settles like a physical object rather than a linear slide.
const Phone = ({ src, brand, progress, box, zoom, showRing, phoneTop, close }) => {
  const tilt = interpolate(progress, [0, 1], [MAX_TILT_DEG, MAX_TILT_DEG * 0.35]);

  // ONE TRANSFORM, ONE LAYER. The ring and the dim used to live in a separate layer that scaled
  // from a different origin and measured against the bezel rather than the screen — which is how a
  // 2px outline around a wide box became two green lines across the frame, and how the dim ended
  // up over the very thing it was meant to reveal. They are now children of the element the video
  // is in, positioned in unzoomed screen coordinates, so they cannot drift from it.
  const { scale: full, tx: fullTx, ty: fullTy } = zoomToRect(box, zoom, 40, close);
  const scale = 1 + (full - 1) * progress;
  const tx = fullTx * progress;
  const ty = fullTy * progress;
  const ringOpacity = interpolate(progress, [0.18, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: phoneTop, perspective: 3200, overflow: "hidden" }}>
      <div style={{
        width: PHONE.w, height: PHONE.h,
        transform: `rotateY(${tilt}deg) rotateX(${tilt * 0.22}deg)`,
        transformStyle: "preserve-3d",
        borderRadius: PHONE.radius + 12, padding: BEZEL,
        background: "linear-gradient(150deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.16) 100%)",
        boxShadow: `0 60px 140px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.05)`,
      }}>
        <div style={{ width: "100%", height: "100%", borderRadius: PHONE.radius, overflow: "hidden", background: brand.bg, position: "relative" }}>
          <div style={{ width: "100%", height: "100%", position: "relative",
                        transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}>
            {src ? <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            {showRing && box ? (
              <div style={{
                position: "absolute",
                left: `${(box.x - box.w / 2) * 100}%`, top: `${(box.y - box.h / 2) * 100}%`,
                width: `${box.w * 100}%`, height: `${box.h * 100}%`,
                border: `${2 / scale}px solid ${brand.greenBright}`,
                borderRadius: `${16 / scale}px`,
                // The dim is this element's own shadow, so it is exactly "everything but the
                // target", at 50% and no more. Nothing is blurred: the target is untouched.
                boxShadow: `0 0 0 ${4000 / scale}px ${brand.bg}80`,
                opacity: ringOpacity,
              }} />
            ) : null}
          </div>
          <AbsoluteFill style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 38%)" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// STYLE.md §5: visible for the whole time app footage is on screen. Inside the safe zone.
// In the clear strip between the top safe line and the device, right-aligned — so it covers no
// app pixel at all. It used to sit over the demo banner.
const ExampleLabel = ({ brand }) => (
  <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", paddingTop: PILL.top, paddingRight: PILL.right, height: PILL.h }}>
    <div style={{
      fontFamily, fontSize: 26, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase",
      color: brand.bg, background: brand.cream, padding: "9px 22px", borderRadius: 999,
    }}>Example</div>
  </AbsoluteFill>
);

// STYLE.md §8: word by word, current word lime, lower third, two lines at most.
const Caption = ({ chunks = [], brand, fps }) => {
  const t = useCurrentFrame() / fps;
  // Six words at most on screen (STYLE.md §3): show the chunk being spoken, and hold the last one
  // rather than cutting to nothing between chunks.
  const active = chunks.filter((c) => t >= c.start - 0.05).pop() || chunks[0];
  const words = active ? active.words : [];
  const rect = captionRect();
  // NO BAND. The device starts below this box, so the background behind the words is the
  // background — there is nothing of the app to cover up.
  return (
    <AbsoluteFill>
      <div style={{
        position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center", fontFamily, fontWeight: 800, fontSize: 76, lineHeight: 1.18, letterSpacing: -1.6 }}>
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
        fontFamily, fontWeight: 900, fontSize: 146, lineHeight: 1.06, letterSpacing: -4,
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
  const { height, width } = useVideoConfig();
  // STYLE.md §1 and §8, checked here so a layout edit cannot quietly push type into Instagram's UI.
  if (PHONE.w / width < 0.75) throw new Error(`The device is ${Math.round((PHONE.w / width) * 100)}% of the frame; it must be at least 75%.`);
  const cap = captionRect();
  if (cap.y < safe.top) throw new Error("The caption runs into the top safe band.");
  for (const close of [true, false]) {
    const top = PHONE_TOP_FOR(close);
    if (cap.y + cap.h + CAPTION.gap > top) {
      throw new Error(`The caption ends at ${cap.y + cap.h}px and the device starts at ${top}px — less than ${CAPTION.gap}px of air.`);
    }
  }
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

  // The move: spring in over ~450ms, hold, then ease back out over the last ~450ms of the beat.
  // "Ease back out" matters — a zoom that stops at its closest point reads as a freeze frame.
  const inP = spring({ frame, fps, config: { damping: 200, mass: 1.1 }, durationInFrames: Math.round(0.45 * fps) });
  const total = Math.max(1, Math.round((beat.duration || 2) * fps));
  const outStart = total - Math.round(0.45 * fps);
  const outP = interpolate(frame, [outStart, total], [1, 0.55], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic),
  });
  const progress = inP * outP;
  const box = beat.box || null;
  const close = !!beat.ring;
  // The device's own move, eased on the same spring as the push-in, from wherever the previous beat
  // left it. A cut that also jumps the phone reads as two different shots of two different phones.
  const topFrom = beat.phoneTopFrom ?? PHONE_TOP_FOR(close);
  const phoneTop = topFrom + (PHONE_TOP_FOR(close) - topFrom) * progress;
  return (
    <>
      <Phone src={beat.video ? staticFile(beat.video) : null} brand={brand} progress={progress}
             box={box} zoom={beat.zoom || 1} showRing={!!beat.ring} phoneTop={phoneTop} close={close} />
      <Caption chunks={beat.chunks || []} brand={brand} fps={fps} />
      {/* After the caption: the caption paints a scrim, and the pill has to stay legible over it. */}
      <ExampleLabel brand={brand} />
    </>
  );
};
