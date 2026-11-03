// src/lib/creatorCode.js
// -----------------------------------------------------------------------------
// A CREATOR'S LINK ON A COMPUTER (flourishmoney.app/get?c=CODE, public/get/get.js): the website's link on that page carries
// the code to /?c=CODE, and the web sign-up form starts with it filled in. It is held for this tab only while the person
// finds their way to the form (sessionStorage, never synced), and it leaves the address bar once the app knows the program is
// on. With the program off nothing is touched. It is a suggestion to a form: the server checks whatever is sent
// (netlify/functions/beta.js), and a code gives nobody a discount.
// -----------------------------------------------------------------------------

const KEY = "flourish_creator_code";
const session = (win) => { try { return (win || globalThis).sessionStorage || null; } catch { return null; } };

/** What the person typed, as they can see it being kept: capitals, letters and digits only, at most 20. */
export function creatorCodeInput(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

/** The code in an address's query, or null when there is none that could be a code. */
export function creatorCodeFromSearch(search) {
  try {
    const c = String(new URLSearchParams(search || "").get("c") || "").trim().toUpperCase();
    return /^[A-Z0-9]{3,20}$/.test(c) ? c : null;
  } catch { return null; }
}

export function recallCreatorCode(win) {
  try { return creatorCodeFromSearch(`?c=${session(win)?.getItem(KEY) || ""}`) || ""; } catch { return ""; }
}
export function forgetCreatorCode(win) { try { session(win)?.removeItem(KEY); } catch { /* blocked storage: nothing to forget */ } }

/** The form's starting value: the address's code (remembered for this tab, and taken out of the address), or one remembered. */
export function captureCreatorCode(win = (typeof window === "undefined" ? undefined : window)) {
  if (!win) return "";
  try {
    const u = new URL(win.location.href);
    if (u.searchParams.has("c")) {
      const c = creatorCodeFromSearch(u.search);
      if (c) { try { session(win)?.setItem(KEY, c); } catch { /* blocked storage: the form still starts with it */ } }
      u.searchParams.delete("c");
      win.history.replaceState(win.history.state, "", u.toString());
      if (c) return c;
    }
  } catch { /* an address that can't be read: nothing to capture */ }
  return recallCreatorCode(win);
}
