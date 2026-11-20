// public/gift/card.js: the printable gift card. Reads the link's fragment only (never sent to a server).
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
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/;
  var q = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
  var code = String(q.get("c") || "").toUpperCase().replace(/[\s-]+/g, "");
  $("#print").addEventListener("click", function () { window.print(); });
  if (!CODE.test(code)) { $("#missing").hidden = false; $("#print").hidden = true; return; }

  var clip = function (v, n) { return String(v || "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n); };
  var plan = q.get("p") === "flourish_plus" ? "gift-plan-plus-name" : "gift-plan-flourish-name";
  $("#plan-name").textContent = words(plan);
  var to = clip(q.get("to"), 60), msg = clip(q.get("m"), 200), start = String(q.get("s") || "");
  if (to) { $("#for").textContent = words("gift-card-for", { name: to }); $("#for").hidden = false; }
  if (msg) { $("#message").textContent = msg; $("#message").hidden = false; }
  $("#code").textContent = code.replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3");
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  $("#start").textContent = m
    ? words("gift-card-start-on", { date: MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1] })
    : words("gift-card-start-now");
  $("#giftcard").hidden = false;
})();
