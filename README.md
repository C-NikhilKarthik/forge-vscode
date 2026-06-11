# Forge (VS Code extension)

> One-click remote GPU dev on Vast.ai — connect via Remote-SSH and bootstrap the
> environment from a `.forge/` config in your repo.

You manage the GPU machine in the [Vast.ai](https://vast.ai) browser UI. Forge
handles the two annoying parts:

1. **Connect** — writes a `~/.ssh/config` entry for the instance and opens a
   VS Code **Remote-SSH** window on it. (Editor UI stays local; files, terminal,
   language servers, and your AI agent run *on the box* — so they see your real
   datasets and checkpoints.)
2. **Bootstrap** — on the remote, creates a micromamba environment and downloads
   the datasets/checkpoints declared in `.forge/`, caching to a `/data` volume if
   one is mounted.

## Setup (once)

- Install the **Remote - SSH** extension (`ms-vscode-remote.remote-ssh`).
- Add your existing SSH **public** key (`~/.ssh/id_ed25519.pub`) to your Vast.ai
  account, so every instance you launch accepts it.
- (Optional) Set `forge.identityFile` if your key isn't `~/.ssh/id_ed25519`.

## Use it

**Connect (paste):** Command Palette → **Forge: Add Connection** → paste the SSH
command Vast shows (e.g. `ssh -p 12345 root@ssh5.vast.ai`). A Remote-SSH window
opens on the box.

**Connect (one click):** drag the bookmarklet in
[`resources/bookmarklet.js`](resources/bookmarklet.js) to your bookmarks bar.
On a Vast instance page, click it → an "Open in VS Code" link fires a
`vscode://forge.forge/connect?...` deep link that connects automatically.

**Bootstrap:** in the remote window, Command Palette → **Forge: Bootstrap
environment**. Reads `.forge/forge.yml`, sets up the env, downloads data. Safe to
re-run — completed steps are skipped.

## The `.forge/` config

Put this in your project repo:

```
.forge/
├── forge.yml          # env + data + setup steps
└── environment.yml    # standard conda/micromamba env spec
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
