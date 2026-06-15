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

## Install

Forge isn't on the Marketplace — install the packaged `.vsix`:

- **From a release:** download `forge-vscode.vsix` from the latest
  [GitHub Release](../../releases), then either run
  `code --install-extension forge-vscode.vsix` or use the Extensions panel →
  `⋯` → **Install from VSIX…**. Cut a release by tagging: `npm version patch &&
  git push --follow-tags` (the `release` workflow attaches the `.vsix`).
- **Latest from CI:** every push to `main` uploads a fresh `forge-vscode.vsix` as
  a build artifact — grab it from the run's **Artifacts** and install it the same way.
- **Build locally:** `npm ci && npx @vscode/vsce package` → install the resulting
  `.vsix`.

After installing, reload VS Code. Forge auto-installs its **Remote - SSH**
dependency.

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

## Git auth (`forge.gitAuth`)

Any origin form works — `git@github.com:…`, `https://github.com/…`, or an SSH
host-alias like `git@github-work:…` — Forge normalizes it to the canonical repo.
Two strategies:

- **`relay`** (default): Forge forwards your **local** SSH key for the clone
  (`ssh -A`), so the box authenticates with the key you *already* have on GitHub —
  **nothing is stored on the box** and there's no key to add. If your agent is
  empty it lists your `~/.ssh` keys (one → uses it, several → asks which) and loads
  the choice. Push/pull then works via the **Source Control panel**.
- **`box-key`**: Forge generates a dedicated key **on the box**, and shows you its
  public key to add to GitHub once (it can persist on a `/data` volume). Use this
  when you need **terminal** `git push` / **AI agents** to authenticate — because
  many GPU images auto-start `tmux`, which strips forwarded credentials from
  shells. Relay falls back to this automatically if it can't forward a key.

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
