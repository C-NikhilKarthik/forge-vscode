// Forge — content script for Vast.ai pages.
//
// Injects a floating "Open in VS Code" button. On click it scrapes the
// `ssh -p <port> <user>@<host>` shown on the page and opens a vscode:// deep
// link that the Forge VS Code extension handles (writes ~/.ssh/config + opens a
// Remote-SSH window).
//
// BEST-EFFORT: Vast's page layout can change and break the scrape. The stable
// fallback is always "Forge: Add Connection" in VS Code (paste the ssh command).

(function () {
  "use strict";

  var BTN_ID = "forge-open-in-vscode";
  if (document.getElementById(BTN_ID)) return; // already injected

  // Customize for your project if you like (leave blank to skip).
  var REPO = ""; // e.g. "git@github.com:me/project.git"
  var PATH = ""; // e.g. "/root/project"

  // Scan the page text for an ssh command. Returns {host,port,user} or null.
  function findSsh() {
    var text = (document.body && document.body.innerText) || "";
    var m = text.match(/ssh\s+-p\s+(\d+)\s+([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)/);
    if (!m) return null;
    return { port: m[1], user: m[2], host: m[3] };
  }

  function buildLink(s) {
    var q =
      "host=" + encodeURIComponent(s.host) +
      "&port=" + encodeURIComponent(s.port) +
      "&user=" + encodeURIComponent(s.user) +
      (REPO ? "&repo=" + encodeURIComponent(REPO) : "") +
      (PATH ? "&path=" + encodeURIComponent(PATH) : "");
    return "vscode://forge.forge/connect?" + q;
  }

  function onClick() {
    var s = findSsh();
    if (!s) {
      btn.textContent = "No SSH found — open the connect panel";
      setTimeout(function () { btn.textContent = LABEL; }, 2500);
      return;
    }
    window.location.href = buildLink(s);
  }

  var LABEL = "Open in VS Code";
  var btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.type = "button";
  btn.textContent = LABEL;
  btn.addEventListener("click", onClick);

  // Minimal inline styling so it doesn't depend on the page's CSS.
  var s = btn.style;
  s.position = "fixed";
  s.zIndex = "2147483647";
  s.bottom = "20px";
  s.right = "20px";
  s.padding = "10px 16px";
  s.font = "600 13px system-ui, -apple-system, sans-serif";
  s.color = "#fff";
  s.background = "#007acc"; // VS Code blue
  s.border = "none";
  s.borderRadius = "8px";
  s.boxShadow = "0 2px 8px rgba(0,0,0,.3)";
  s.cursor = "pointer";

  function inject() {
    if (document.body && !document.getElementById(BTN_ID)) {
      document.body.appendChild(btn);
    }
  }
  inject();
  // Vast is a SPA — re-inject if the page re-renders and drops the button.
  var obs = new MutationObserver(inject);
  if (document.body) obs.observe(document.body, { childList: true });
})();
