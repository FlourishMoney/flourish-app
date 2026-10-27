// public/get/get.js: the device link's script (public/get/index.html, 2026-10-27).
// -----------------------------------------------------------------------------
// WHERE IT SENDS PEOPLE. An iPhone or iPad goes to the App Store listing, an Android phone or tablet to the Google
// Play listing, both straight away. Anything else (a computer) stays on the page: both badges, and the website.
// An iPad that asks for the desktop site says "Macintosh"; it is told apart by its touch screen.
//
// WHAT PLAUSIBLE IS TOLD (cookieless, as on the rest of the public site, src/lib/webAnalytics.js): one event,
// "Get link", with two properties and nothing else: way (which of the five ways below) and ref (which link it came
// from: "founding", or "other" for anything else, so nothing typed into the address reaches Plausible). The page
// address is sent as https://flourishmoney.app/get with no query string, and the referrer as origin and path only.
// No email, no id, no cookie, nothing about the household. The phone's redirect waits for the event at most 700 ms.
// -----------------------------------------------------------------------------
(function () {
  "use strict";
  var PLAUSIBLE_SRC = "https://plausible.io/js/pa-greGtasruQXP4d1IGIYrH.js";
  var EVENT = "Get link";
  var WAYS = ["iPhone or iPad to the App Store", "Android to Google Play", "Page: App Store badge", "Page: Google Play badge", "Page: website"];
  var REFS = ["founding", "other"];
  var APP_STORE = document.getElementById("app-store").href;
  var PLAY = document.getElementById("google-play").href;

  var params = new URLSearchParams(window.location.search);
  var ref = params.get("ref") === "founding" ? "founding" : "other";
  // The website's way in: the founding checkout for the founding link, the home page otherwise.
  if (ref !== "founding") document.getElementById("website").setAttribute("href", "/");

  function device() {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "other";
  }

  function cleanUrl(href) {
    try { var u = new URL(String(href)); return (u.protocol === "https:" || u.protocol === "http:") ? u.origin + u.pathname : null; }
    catch (e) { return null; }
  }
  // Every request Plausible is about to send: this page's address without its query, the referrer cut to origin and
  // path, and only the two known properties with known values.
  function transformRequest(p) {
    if (!p) return null;
    var out = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];
    out.u = window.location.origin + "/get";
    if (p.r) { var r = cleanUrl(p.r); if (r) out.r = r; else delete out.r; }
    var props = p.p && typeof p.p === "object" ? p.p : {};
    out.p = {};
    if (WAYS.indexOf(props.way) >= 0) out.p.way = props.way;
    if (REFS.indexOf(props.ref) >= 0) out.p.ref = props.ref;
    return out;
  }
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  window.plausible.init = window.plausible.init || function (i) { window.plausible.o = i || {}; };
  window.plausible.init({ autoCapturePageviews: false, transformRequest: transformRequest });
  var s = document.createElement("script");
  s.async = true;
  s.src = PLAUSIBLE_SRC;
  document.head.appendChild(s);

  // Count the way, then go (at most 700 ms later, whether or not Plausible answered).
  function countThenGo(way, url) {
    var gone = false;
    function go() { if (!gone) { gone = true; window.location.assign(url); } }
    try { window.plausible(EVENT, { props: { way: way, ref: ref }, callback: go }); } catch (e) { /* the redirect still happens */ }
    setTimeout(go, 700);
  }

  var d = device();
  if (d === "ios") { countThenGo(WAYS[0], APP_STORE); return; }
  if (d === "android") { countThenGo(WAYS[1], PLAY); return; }

  // A computer: the page. Each link is counted, then followed.
  [["app-store", WAYS[2]], ["google-play", WAYS[3]], ["website", WAYS[4]]].forEach(function (pair) {
    var a = document.getElementById(pair[0]);
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) { try { window.plausible(EVENT, { props: { way: pair[1], ref: ref } }); } catch (x) { /* nothing */ } return; }
      e.preventDefault();
      countThenGo(pair[1], a.href);
    });
  });
})();
