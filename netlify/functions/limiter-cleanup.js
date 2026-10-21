// netlify/functions/limiter-cleanup.js
// -----------------------------------------------------------------------------
// Scheduled, daily (netlify.toml): deletes the rate limiters' expired entries and any key in the old raw
// format (_lib/limiterCleanup.js). It logs counts only, never a key or a value.
// -----------------------------------------------------------------------------
"use strict";
const { getStore } = require("@netlify/blobs");
const { connectBlobs } = require("./_lib/blobsContext");
const { cleanAll } = require("./_lib/limiterCleanup");

exports.handler = async (event) => {
  connectBlobs(event);   // before any getStore: Lambda-style functions get their Blobs context on the event
  try {
    const result = await cleanAll({ getStore });
    console.log(`[limiter-cleanup] ${Object.entries(result).map(([s, c]) => `${s}: old raw ${c.oldRaw}, expired ${c.expired}, kept ${c.kept}`).join("; ")}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("[limiter-cleanup] failed:", e && e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
