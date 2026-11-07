// public/clarity/loader.js: Microsoft Clarity on the website's static pages, /get and the guides (Amanda, 2026-11-06).
// -----------------------------------------------------------------------------
// The same rules as the app's pages (src/lib/webClarity.js): website only, never inside the iPhone or Android app (this file
// is not in a store build: scripts/strip-landing-media.mjs), never where the edge says no (Quebec, the EEA, the UK,
// Switzerland, a place it cannot name, or before CLARITY_ENABLED is on: netlify/edge-functions/clarity-gate.js), never with a
// query string or hash in the address, and only after the page is interactive. Nothing is kept: the edge's answer is
// asked for on each visit. Project z9lh2hoxvh, masking Strict and cookies off, both set in Clarity.
// -----------------------------------------------------------------------------
(function () {
  "use strict";
  var TAG_SRC = "https://www.clarity.ms/tag/z9lh2hoxvh";
  var GATE = "/api/clarity-gate";
  var w = window, l = w.location, d = w.document;

  var p = l.pathname;
  // The address itself: /get, the guides' index, or one guide (a lowercase slug, as build-guides.mjs requires). Nothing else.
  var page = p === "/get" || p === "/get/" || p === "/guides" || p === "/guides/" || /^\/guides\/[a-z0-9]+(-[a-z0-9]+)*\/?$/.test(p);
  var clean = !l.search && (!l.hash || l.hash === "#");
  if (!page || !clean || w.Capacitor || typeof w.fetch !== "function") return;

  function load() {
    if (l.search || (l.hash && l.hash !== "#") || w.clarity) return;
    w.fetch(GATE, { credentials: "omit", cache: "no-store" })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || j.load !== true || l.search || (l.hash && l.hash !== "#") || w.clarity) return;
        w.clarity = function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
        var s = d.createElement("script");
        s.async = true;
        s.src = TAG_SRC;
        d.head.appendChild(s);
      })
      .catch(function () { /* no answer is a no */ });
  }
  function idle() {
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(load, { timeout: 4000 });
    else w.setTimeout(load, 1500);
  }
  if (d.readyState === "complete") idle();
  else w.addEventListener("load", idle, { once: true });
})();
