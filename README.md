# Forge (VS Code extension)

> One-click remote GPU dev on Vast.ai — connect via Remote-SSH and bootstrap the
> environment from a `.forge/` config in your repo.

You manage the GPU machine in the [Vast.ai](https://vast.ai) browser UI. Forge
handles the annoying parts:

1. **Open Repo on Remote** — from a repo open locally, one command mirrors *that
   repo* onto the box (clone from `origin` + your current branch) and opens a
   VS Code **Remote-SSH** window on it. Editor UI stays local; files, terminal,
   language servers, and your AI agent run *on the box* — so they see your real
   datasets and checkpoints. Git push/pull keeps working: VS Code forwards your
   credentials to the box, so **nothing (no token, no key) is copied there**.
2. **Bootstrap** — on the remote, creates a **conda** environment (reusing an
   existing conda or installing Miniconda) and downloads the datasets/checkpoints
   declared in `.forge/`, caching to a `/data` volume if one is mounted.

## Setup (once)

- Install the **Remote - SSH** extension (`ms-vscode-remote.remote-ssh`).
- Add your existing SSH **public** key (`~/.ssh/id_ed25519.pub`) to your Vast.ai
  account, so every instance you launch accepts it.
- (Optional) Set `forge.identityFile` if your key isn't `~/.ssh/id_ed25519`.

## Use it

**Open a repo on a GPU box (primary):** open your project locally, then Command
Palette → **Forge: Open Repo on Remote**. Paste the SSH command Vast shows (e.g.
`ssh -p 12345 root@ssh5.vast.ai`) the first time — it's remembered after that.
Forge clones the repo onto the box and opens a Remote-SSH window on it. If a
`.forge/` is present, Bootstrap runs automatically.

**Connect to a box without mirroring a repo:** Command Palette → **Forge: Add
Connection** → paste the SSH command. Or, one click: drag the bookmarklet in
[`resources/bookmarklet.js`](resources/bookmarklet.js) to your bookmarks bar (or
load the [`browser/`](browser/) extension), then click **Open in VS Code** on a
Vast instance page — it fires a `vscode://forge.forge/connect?...` deep link.

**Bootstrap manually:** in the remote window, Command Palette → **Forge: Bootstrap
environment**. Reads `.forge/forge.toml`, sets up the conda env, downloads data.
Safe to re-run — completed steps are skipped.

## Git auth (the box gets its own key — your creds are never copied)

Forge gives the **box its own GitHub identity** rather than forwarding or copying
yours (forwarding breaks on images that auto-start tmux). On first clone it
generates a dedicated ed25519 key on the box, points all git at it, and — if the
box isn't authorized yet — shows you the public key with a **Copy & open GitHub**
button. You add it to your GitHub SSH keys once (it can live on a `/data` volume
so it survives instance rebuilds), and from then on clone/push/pull work in **any
shell, the Source Control panel, and for AI agents** — tmux or not. Your laptop
keys and any PAT never touch the box; the box key is revocable from GitHub.

Any origin form works — `git@github.com:…`, `https://github.com/…`, or an SSH
host-alias like `git@github-work:…` — Forge normalizes it to the canonical repo.

## The `.forge/` config

Put this in your project repo (both files are **TOML**):

```
.forge/
├── forge.toml         # [workspace] + [env] + [tasks] + [[data]]
└── env.toml           # conda env spec; Forge generates environment.yml from it
```

See [`examples/.forge/`](examples/.forge/) for a working sample.

## Develop

```bash
npm install
npm run compile      # bundle with esbuild
# then press F5 in VS Code to launch the Extension Development Host
npm run package      # build a .vsix
```

See [docs/](docs/) for design, conventions, and contributing.

## License

MIT — see [LICENSE](LICENSE).
