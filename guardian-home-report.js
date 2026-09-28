/* guardian-home-report.js — fill homepage $C7 report card from /api/token */
(function () {
  "use strict";
  var MINT = "979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww";
  var root = document.querySelector("[data-c7-report]");
  if (!root) return;

  function set(id, text, cls) {
    var n = document.getElementById(id);
    if (!n) return;
    n.textContent = text;
    n.className = cls || "";
  }

  function fallback() {
    set("c7-mint-auth", "See live report");
    set("c7-freeze", "See live report");
    set("c7-lp", "See live report");
    set("c7-top1", "See live report");
  }

  fetch("/api/token?mint=" + encodeURIComponent(MINT), { cache: "no-store" })
    .then(function (r) {
      return r.json().then(function (d) {
        return { ok: r.ok, d: d };
      });
    })
    .then(function (res) {
      var d = res.d;
      if (!res.ok || !d || d.error || d.x402Version) {
        throw new Error((d && (d.error || d.message)) || "unavailable");
      }
      set(
        "c7-mint-auth",
        d.mintAuthorityRevoked ? "Revoked" : "Active",
        d.mintAuthorityRevoked ? "ok" : "flag"
      );
      set(
        "c7-freeze",
        d.freezeAuthorityRevoked ? "Revoked" : "Active",
        d.freezeAuthorityRevoked ? "ok" : "flag"
      );
      var L = d.liquidity || {};
      var locked = L.measured
        ? (Number(L.lockedPct) || 0) + (Number(L.burnedPct) || 0)
        : null;
      set(
        "c7-lp",
        locked != null ? locked.toFixed(0) + "% locked" : "Not measured",
        locked != null && locked >= 90 ? "ok" : ""
      );
      set(
        "c7-top1",
        d.top1Pct != null ? d.top1Pct + "%" : "Not measured"
      );
    })
    .catch(fallback);
})();
