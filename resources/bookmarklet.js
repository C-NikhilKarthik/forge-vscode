// Forge "Open in VS Code" bookmarklet.
//
// Drag a bookmark whose URL is the minified one-liner at the bottom of this file
// to your bookmarks bar. Click it while viewing a Vast.ai instance page; it
// scrapes the SSH host/port shown on the page and opens a vscode:// deep link
// that the Forge extension handles.
//
// This is BEST-EFFORT: Vast's page layout can change and break the scrape. The
// reliable fallback is always "Forge: Add Connection" (paste the ssh command).
//
// Optionally tweak the repo/path appended to the link below.

(function () {
  // Find an `ssh -p <port> <user>@<host>` string anywhere in the page text.
  var text = document.body.innerText || "";
  var m = text.match(/ssh\s+-p\s+(\d+)\s+([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)/);
  if (!m) {
    alert(
      "Forge: couldn't find an SSH command on this page.\n" +
        "Open the instance's SSH/connect panel, or use 'Forge: Add Connection' and paste it."
    );
    return;
  }
  var port = m[1];
  var user = m[2];
  var host = m[3];

  // Customize these for your project if you like:
  var repo = ""; // e.g. "git@github.com:me/project.git"
  var path = ""; // e.g. "/root/project"

  var q =
    "host=" + encodeURIComponent(host) +
    "&port=" + encodeURIComponent(port) +
    "&user=" + encodeURIComponent(user) +
    (repo ? "&repo=" + encodeURIComponent(repo) : "") +
    (path ? "&path=" + encodeURIComponent(path) : "");

  window.location.href = "vscode://forge.forge/connect?" + q;
})();

// --- Minified bookmarklet URL (copy this whole line as the bookmark's address) ---
// javascript:(function(){var t=document.body.innerText||"",m=t.match(/ssh\s+-p\s+(\d+)\s+([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)/);if(!m){alert("Forge: no SSH command found on this page. Use 'Forge: Add Connection'.");return;}var q="host="+encodeURIComponent(m[3])+"&port="+encodeURIComponent(m[1])+"&user="+encodeURIComponent(m[2]);window.location.href="vscode://forge.forge/connect?"+q;})();
