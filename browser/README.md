# Forge browser button (Chrome / Edge)

A tiny content-script extension that injects an **"Open in VS Code"** button onto
Vast.ai pages. Clicking it scrapes the instance's `ssh -p … user@host` and opens
a `vscode://forge.forge/connect?…` deep link, which the Forge VS Code extension
handles (writes `~/.ssh/config`, opens a Remote-SSH window).

This is pure UX sugar over the deep link — the **bookmarklet**
(`../resources/bookmarklet.js`) and **Forge: Add Connection** (paste) do the same
thing without installing anything.

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** → select this `browser/` folder.
4. Visit a Vast.ai instance page → a blue **Open in VS Code** button appears
   bottom-right. Open the instance's SSH/connect panel so the `ssh …` command is
   on the page, then click the button.

## Prerequisites

- The **Forge** VS Code extension installed (it registers the `vscode://` handler).
- Your SSH public key already added to your Vast account (done once in the browser).

## Notes

- Scraping the SSH command is best-effort and can break if Vast changes its page
  layout — the button will say "No SSH found"; fall back to paste in VS Code.
- To hardcode a repo/path into the link, edit `REPO` / `PATH` at the top of
  `content.js`.
- No icons are bundled; Chrome shows a default. Add an `icons` entry to
  `manifest.json` if you publish to the store.
