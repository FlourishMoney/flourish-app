// src/lib/plusClient.js
// -----------------------------------------------------------------------------
// WHICH PLUS CODE THIS APP CARRIES (2026-11-21), SAID TO THE SERVER WITH EVERY REQUEST FOR PLUS DATA.
//
// Apps before 1.1.8 put investment holdings into the household's shared data, where the other member reads all of
// them. From 1.1.8 the app keeps them on this device and shows a partner only what was shared. The server cannot see
// which app is asking, so the app says so: client_version, on the holdings call (plaid.js get_investments), on every
// /api/networth call and on plus_status. The server sends net worth entries and holdings only to a client that says
// PLUS_MIN_CLIENT or newer (netlify/functions/_lib/plusAddon.js); an app that says nothing gets no Plus data.
//
// PLUS_CLIENT_VERSION is the version of THIS CODE'S handling of Plus data, not the number on the store page: the
// website, the iPhone app and the Android app built from this code all say the same thing, whatever their own
// version label reads. Raise it only when the way Plus data is kept private changes, together with the server's
// minimum. It never goes below 1.1.8.
// -----------------------------------------------------------------------------

export const PLUS_CLIENT_VERSION = "1.1.8";

/** The field every request for Plus data carries. */
export const plusClientFields = () => ({ client_version: PLUS_CLIENT_VERSION });

const parts = (v) => { const m = typeof v === "string" ? /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v.trim()) : null; return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };

/**
 * Is this app older than the server's minimum for Plus data (plus_status min_client)? Only a minimum that reads as a
 * version and is newer than PLUS_CLIENT_VERSION says so; no minimum, or one that makes no sense, is not "too old".
 */
export function clientTooOld(minClient, own = PLUS_CLIENT_VERSION) {
  const a = parts(own), b = parts(minClient);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
