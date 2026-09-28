/* scan-evm.js — Guardian v2 EVM adapter on cyre.dev Scan & Swap */
(function (global) {
  "use strict";

  var SCAN_URLS = [
    "/api/multichain-scan",
    "https://scan.cyre.dev/api/scan",
  ];

  function isEvm(s) {
    return /^0x[a-fA-F0-9]{40}$/.test(s || "");
  }

  function isSolana(s) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || "");
  }

  function gradeClass(grade) {
    if (grade === "A" || grade === "B") return "r-LOW";
    if (grade === "C") return "r-MEDIUM";
    return "r-HIGH";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hideSwapUi() {
    var teaser = document.getElementById("swap-teaser");
    var proceed = document.getElementById("proceed-block");
    var panel = document.getElementById("swap-panel");
    if (teaser) teaser.style.display = "none";
    if (proceed) proceed.style.display = "none";
    if (panel) panel.style.display = "none";
    if (window.CyreScanSwap && typeof window.CyreScanSwap.onScanStart === "function") {
      window.CyreScanSwap.onScanStart();
    }
  }

  function renderPresence(presence, address) {
    var box = document.getElementById("signals");
    if (!box) return;
    var chips = (presence || [])
      .map(function (p) {
        var label = esc(p.chainName) + (p.exists ? " · found" : " · empty");
        if (!p.exists) {
          return '<span class="chain-chip">' + label + "</span>";
        }
        return (
          '<a class="chain-chip is-on" href="https://scan.cyre.dev/app?address=' +
          encodeURIComponent(address) +
          "&chain=" +
          encodeURIComponent(p.chainId) +
          '">' +
          label +
          "</a>"
        );
      })
      .join("");
    box.insertAdjacentHTML(
      "afterbegin",
      '<div class="chain-row"><small>Where this contract exists</small><div class="chain-chips">' +
        chips +
        "</div></div>",
    );
  }

  function renderReport(result) {
    var report = (result.reports && result.reports[0]) || null;
    if (!report) return false;
    var token = report.token || {};
    var nameEl = document.getElementById("token-name");
    var symbolEl = document.getElementById("token-symbol");
    var mintEl = document.getElementById("token-mint");
    var idBox = document.getElementById("token-id");
    if (nameEl) nameEl.textContent = token.name || "Unnamed contract";
    if (symbolEl) symbolEl.textContent = token.symbol ? "$" + token.symbol : "";
    if (mintEl) {
      mintEl.textContent =
        (report.chain && report.chain.name ? report.chain.name + " · " : "") +
        (token.address || result.address || "");
    }
    if (idBox) idBox.style.display = "block";

    var banner = document.getElementById("banner");
    if (banner) banner.className = "risk-banner " + gradeClass(report.grade);
    var word = document.getElementById("riskword");
    var score = document.getElementById("riskscore");
    if (word) word.textContent = "GRADE " + report.grade;
    if (score) {
      score.textContent =
        (report.headline || "Grade " + report.grade + " · score " + report.score + "/100") +
        " · patterns, not a verdict";
    }

    var pill = document.getElementById("lock-pill");
    if (pill) pill.className = "lock-pill";

    var facts = document.getElementById("facts");
    if (facts) {
      facts.innerHTML = (report.checks || [])
        .map(function (c) {
          return (
            '<div class="fact"><small>' +
            esc(c.title) +
            "</small><b>Grade " +
            esc(c.grade) +
            " · " +
            esc(c.status) +
            "</b></div>"
          );
        })
        .join("");
    }

    var sig = document.getElementById("signals");
    if (sig) {
      var lines = (report.checks || []).map(function (c) {
        var lvl = c.status === "pass" ? "good" : c.grade === "F" ? "high" : "med";
        return (
          '<div class="sig"><i class="i-' +
          lvl +
          '"></i><p><strong>' +
          esc(c.title) +
          ".</strong> " +
          esc(c.summary) +
          "</p></div>"
        );
      });
      var cats = (report.copycats || []).slice(0, 6).map(function (c) {
        var flags = (c.flags || []).join(", ");
        return (
          '<div class="sig"><i class="i-info"></i><p>Copycat $' +
          esc(c.symbol) +
          (flags ? " · " + esc(flags) : "") +
          " · " +
          esc(c.chainName) +
          "</p></div>"
        );
      });
      sig.innerHTML = lines.concat(cats).join("");
    }

    renderPresence(result.presence, result.address);
    var rep = document.getElementById("report");
    if (rep) rep.style.display = "block";
    return true;
  }

  async function postScan(address, chain) {
    var payload = JSON.stringify({ address: address, chain: chain || undefined });
    var lastErr = "Scan failed";
    for (var i = 0; i < SCAN_URLS.length; i++) {
      try {
        var res = await fetch(SCAN_URLS[i], {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          cache: "no-store",
        });
        var data = await res.json();
        if (data && data.kind && data.kind !== "error") return data;
        lastErr = (data && data.error) || lastErr;
        if (res.ok) return data;
      } catch (err) {
        lastErr = err && err.message ? err.message : lastErr;
      }
    }
    throw new Error(lastErr);
  }

  async function scanEvm(address, chain) {
    hideSwapUi();
    var data = await postScan(address, chain);
    if (data.kind === "error") throw new Error(data.error || "Scan failed");
    if (data.kind === "presence") {
      var err = document.getElementById("err");
      if (err) {
        err.textContent = data.message || "Contract not found on a configured EVM chain.";
        err.style.display = "block";
      }
      var rep = document.getElementById("report");
      if (rep) {
        document.getElementById("facts").innerHTML = "";
        document.getElementById("signals").innerHTML = "";
        document.getElementById("token-id").style.display = "none";
        document.getElementById("lock-pill").className = "lock-pill";
        document.getElementById("riskword").textContent = "NOT FOUND";
        document.getElementById("riskscore").textContent = data.message || "";
        document.getElementById("banner").className = "risk-banner r-MEDIUM";
        renderPresence(data.presence, data.address);
        rep.style.display = "block";
      }
      return data;
    }
    if (!renderReport(data)) throw new Error("No report returned.");
    return data;
  }

  global.CyreScanEvm = {
    isEvm: isEvm,
    isSolana: isSolana,
    scan: scanEvm,
  };
})(window);
