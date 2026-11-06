// public/newsletter/newsletter.js: the website's sign-up form (public/newsletter/index.html, CASL, 2026-11-04).
// The wording comes from the server, and the box starts unticked. Nothing is sent without a tick.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var version = null;
  function say(text) { $("error").textContent = text; $("error").hidden = !text; }

  fetch("/api/newsletter").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || j.open !== true) return;
    version = j.version;
    $("wording").textContent = j.wording;
    $("consent").checked = false;
    $("closed").hidden = true;
    $("form").hidden = false;
  }).catch(function () { /* the page keeps saying sign-ups aren't open */ });

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    say("");
    var email = $("email").value.trim();
    if (!email) { say("Enter your email address."); return; }
    if (!$("consent").checked) { say("Tick the box to sign up."); return; }
    $("submit").disabled = true;
    fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, consent: true, version: version, source: "site_newsletter" })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
      if (res.ok) { $("form").hidden = true; $("done").hidden = false; return; }
      $("submit").disabled = false;
      if (res.j.error === "invalid_email") say("Enter a valid email address.");
      else if (res.j.error === "rate_limited") say(res.j.message || "Too many attempts. Try again in an hour.");
      else if (res.j.error === "consent_required") say("This page is out of date. Refresh it and try again.");
      else say("That didn't go through. Please try again in a moment.");
    }).catch(function () { $("submit").disabled = false; say("That didn't go through. Please try again in a moment."); });
  });
})();
