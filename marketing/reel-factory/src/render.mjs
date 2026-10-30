// Remotion: bundle the composition, render the mp4, then pull the cover frame.
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { CANVAS, dir } from "./config.mjs";

export async function renderReel({ inputProps, durationInFrames, mp4Out, coverOut, coverFrame }) {
  const serveUrl = await bundle({
    entryPoint: path.join(dir.remotion, "index.jsx"),
    publicDir: dir.publicDir,
    onProgress: () => {},
  });
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
  const comp = { ...composition, durationInFrames, fps: CANVAS.fps, width: CANVAS.width, height: CANVAS.height };

  await renderMedia({
    composition: comp, serveUrl, codec: "h264", outputLocation: mp4Out, inputProps,
    // Instagram re-encodes anyway; this is the quality that survives it without a huge file.
    // STYLE.md §1: high bitrate. CRF 16 survives Instagram's re-encode.
    crf: CANVAS.crf, audioCodec: "aac", audioBitrate: "256k", concurrency: 2, everyNthFrame: 1,
  });
  await renderStill({
    composition: comp, serveUrl, output: coverOut, inputProps,
    frame: Math.min(coverFrame, durationInFrames - 1), imageFormat: "jpeg", jpegQuality: 92,
  });
  return { mp4Out, coverOut };
}
