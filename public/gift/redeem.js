// public/gift/redeem.js: redeem a gift code (flourishmoney.app/gift/redeem). Website only.
//
// Signed in: the website's own Supabase session, the one the app keeps in this browser's storage (same origin). Only
// its access token is used, sent to /api/gift as a Bearer token; the server checks it (it is never trusted here). With
// no session, or one that has run out, the page offers the website's sign-in (/?gift=redeem), and the app sends the
// person back here once signed in (src/lib/giftReturn.js). A code typed before signing in is kept in this tab only.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var tpl = document.querySelector("#words");
  var words = function (id, vars) {
    var w = tpl && tpl.content.querySelector('[data-id="' + id + '"]');
    var s = w ? w.textContent : "";
    Object.keys(vars || {}).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  };
  var CODE_KEY = "flourish_gift_code";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function day(iso) {
    var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return MONTHS[Number(p.month) - 1] + " " + Number(p.day) + ", " + p.year;
  }

  // The website's session, as supabase-js stores it ("sb-<project>-auth-token"). Expired or missing: signed out.
  function session() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!/^sb-[a-z0-9]+-auth-token$/.test(k)) continue;
        var s = JSON.parse(localStorage.getItem(k) || "null");
        if (s && s.access_token && Number(s.expires_at) * 1000 > Date.now() + 30000) return { key: k, token: s.access_token, email: (s.user && s.user.email) || "" };
      }
    } catch (e) { /* storage blocked: signed out */ }
    return null;
  }

  var form = $("#redeem-form"), input = $("#code"), err = $("#result-error");
  try { var kept = sessionStorage.getItem(CODE_KEY); if (kept) input.value = kept; } catch (e) { /* none */ }
  input.addEventListener("input", function () { try { sessionStorage.setItem(CODE_KEY, input.value); } catch (e) { /* none */ } });

  function show() {
    var s = session();
    $("#signed-out").hidden = !!s;
    form.hidden = !s;
    if (s) $("#signed-in-as").textContent = words("gift-redeem-signed-in", { email: s.email });
    return s;
  }
  var s = show();
  $("#switch").addEventListener("click", function () {
    // Signs this browser out of the website, then the sign-in brings them back here with the other account.
    try { if (s) localStorage.removeItem(s.key); } catch (e) { /* none */ }
    location.assign("/?gift=redeem");
  });

  function fail(id, vars) { err.textContent = words(id, vars); err.hidden = false; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    var code = input.value.trim();
    if (!code) { fail("gift-redeem-empty"); input.focus(); return; }
    var cur = session();
    if (!cur) { show(); $("#signed-out").hidden = false; return; }
    var btn = $("#submit"), label = btn.textContent;
    btn.disabled = true; btn.textContent = words("gift-redeem-working") || label;
    fetch("/api/gift", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cur.token }, body: JSON.stringify({ action: "redeem", code: code }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = label;
        var j = res.j || {};
        if (res.status === 401) { fail("gift-redeem-signin-again"); $("#signed-out").hidden = false; return; }
        if (res.status === 429) { fail("gift-redeem-limited"); return; }
        if (j.ok && j.result === "ok") {
          try { sessionStorage.removeItem(CODE_KEY); } catch (e2) { /* none */ }
          // The Plus gift is not sold yet and its name is not approved: until it is, the flourish line stands.
          var plan = words(j.plan === "flourish_plus" && words("gift-plan-plus") ? "gift-plan-plus" : "gift-plan-flourish");
          $("#result-ok").textContent = words(j.pending ? "gift-redeem-ok-later" : "gift-redeem-ok", { plan: plan, start: day(j.starts_at), end: day(j.ends_at) });
          if (j.already_paid) {
            $("#paid-note").textContent = words("gift-redeem-paid-note", { date: day(j.already_paid.period_end) });
            $("#paid-note").hidden = false;
            if (j.already_paid.renews) {
              var where = { app_store: "gift-redeem-renew-app-store", play_store: "gift-redeem-renew-play-store" }[j.already_paid.provider] || "gift-redeem-renew-stripe";
              $("#renew-note").textContent = words(where); $("#renew-note").hidden = false;
            }
          }
          form.hidden = true; $("#done").hidden = false;
          return;
        }
        if (j.result === "mine") { fail("gift-redeem-mine", { end: j.ends_at ? day(j.ends_at) : "" }); return; }
        if (j.result === "used") { fail("gift-redeem-used"); return; }
        if (j.result === "void") { fail("gift-redeem-void"); return; }
        if (j.result === "invalid") { fail("gift-redeem-invalid"); return; }
        fail("gift-redeem-error");
      })
      .catch(function () { btn.disabled = false; btn.textContent = label; fail("gift-redeem-error"); });
  });
})();
