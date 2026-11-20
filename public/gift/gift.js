// public/gift/gift.js: the gift page (flourishmoney.app/gift/). Website only.
// Reads the two prices from /api/gift, shows the fields the delivery choice needs, and sends the form to /api/gift
// "checkout", which answers with Stripe Checkout's address. Nothing here decides a price or a plan's terms.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var words = function (id) { var el = document.querySelector('#words'); var w = el && el.content.querySelector('[data-id="' + id + '"]'); return w ? w.textContent : ""; };
  var form = $("#gift-form");
  var TZ = "America/Toronto";

  // Today in Eastern time, the zone the page states, and a year from it: the dates a buyer may pick.
  function torontoToday() {
    var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  }
  function addDays(day, n) { var a = day.split("-").map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)).toISOString().slice(0, 10); }

  if (new URLSearchParams(location.search).get("bought") === "1") {
    $("#thanks").hidden = false; form.hidden = true; $("#intro").hidden = true;
    return;
  }

  var today = torontoToday(), last = addDays(today, 365);
  ["#send_on", "#start_on"].forEach(function (s) { var el = $(s); el.min = today; el.max = last; });
  $("#send_on").value = today;

  function delivery() { var r = form.querySelector('input[name="delivery"]:checked'); return r ? r.value : "email"; }
  function showDelivery() {
    var d = delivery();
    document.querySelectorAll("[data-when]").forEach(function (el) { el.hidden = el.getAttribute("data-when") !== d; });
  }
  form.querySelectorAll('input[name="delivery"]').forEach(function (r) { r.addEventListener("change", showDelivery); });
  showDelivery();

  fetch("/api/gift", { headers: { Accept: "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (j) {
      var fmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: String(j.currency || "cad").toUpperCase() });
      document.querySelectorAll("[data-price]").forEach(function (el) {
        var cents = j.prices && j.prices[el.getAttribute("data-price")];
        el.textContent = Number.isInteger(cents) ? fmt.format(cents / 100) : "";
      });
    })
    .catch(function () { $("#unavailable").hidden = false; form.hidden = true; });

  function showErrors(fields) {
    document.querySelectorAll("[data-error]").forEach(function (el) { el.hidden = fields.indexOf(el.getAttribute("data-error")) < 0; });
    var first = fields.length && form.querySelector('[name="' + fields[0] + '"]');
    if (first && first.focus) first.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#submit"), err = $("#form-error"), label = btn.textContent;
    err.hidden = true; showErrors([]);
    var d = delivery();
    var body = {
      action: "checkout",
      plan: (form.querySelector('input[name="plan"]:checked') || {}).value,
      buyer_email: $("#buyer_email").value,
      buyer_name: $("#buyer_name").value,
      delivery: d,
      recipient_name: $("#recipient_name").value,
      recipient_email: d === "email" ? $("#recipient_email").value : "",
      send_on: d === "email" ? $("#send_on").value : "",
      message: $("#message").value,
      start_on: $("#start_on").value,
    };
    btn.disabled = true; btn.textContent = words("gift-form-sending") || label;
    fetch("/api/gift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 200 && res.j.url) { location.assign(res.j.url); return; }
        btn.disabled = false; btn.textContent = label;
        if (res.status === 400 && Array.isArray(res.j.fields)) { showErrors(res.j.fields); return; }
        err.textContent = words(res.status === 429 ? "gift-error-limited" : "gift-error-generic"); err.hidden = false;
      })
      .catch(function () { btn.disabled = false; btn.textContent = label; err.textContent = words("gift-error-generic"); err.hidden = false; });
  });
})();
