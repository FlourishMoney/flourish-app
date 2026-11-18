import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel.jsx";

// Duration, size and props all come from the pipeline; the defaults here only exist so the
// composition can be opened in the Remotion studio without running the pipeline first.
export const RemotionRoot = () => (
  <>
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={60 * 22}
      fps={60}
      width={1080}
      height={1920}
      defaultProps={{
        beats: [], endCard: [], tones: [], narration: null, music: null, logo: null,
        brand: { bg: "#050810", card: "#0D1520", cream: "#EDE9E2", green: "#00CC85", greenBright: "#00E89A", gold: "#E8B84B" },
        safe: { top: 250, bottom: 400 },
      }}
    />
  </>
);
