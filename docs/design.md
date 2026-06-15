# Forge extension — design

## What it is

A thin VS Code extension that turns a Vast.ai GPU box into a remote dev
environment. You start/stop the machine in the **Vast browser UI**; the
extension only **connects** (Remote-SSH) and **bootstraps** (env + data).

## Why Remote-SSH, not rsync

"Edit locally → rsync → run remote" starves your IntelliSense and AI agent of the
datasets/checkpoints that live on the box. VS Code Remote-SSH keeps only the
editor UI local; the filesystem, language servers, terminal, and AI agent run on
the remote — so they see the real data. This is the Lightning.ai Studio model.

## Modules (`src/`)

| File | Responsibility |
|---|---|
| `extension.ts` | `activate()`: register commands + the `vscode://` URI handler; on remote-window startup, auto-Bootstrap once if a `.forge/` is present |
| `connection.ts` | `ConnInfo` type; parse from a pasted `ssh …` command or a deep-link query; stable `Host` alias; repo-name + `https→git@` GitHub URL helpers |
| `localRepo.ts` | read the local repo's `origin`, current branch, and dirty/ahead state via `git -C` |
| `openRepoOnRemote.ts` | `Forge: Open Repo on Remote` — local repo → pick/recall machine → connect (clone + branch) |
| `sshconfig.ts` | write/remove an idempotent managed block in `~/.ssh/config` (atomic temp + rename); sets `ForwardAgent yes` |
| `connect.ts` | write config → optional `git clone -b <branch>` on the box (agent-forwarded) → `vscode.openFolder(vscode-remote://ssh-remote+<alias><path>)` |
| `uri.ts` | handle `vscode://forge.forge/connect?host=…&port=…&user=…&repo=…&path=…` |
| `paste.ts` | `Forge: Add Connection` — input box → parse → connect |
| `forgeConfig.ts` | read + validate `.forge/forge.toml` + `env.toml` (TOML, via `workspace.fs`); generate the conda `environment.yml` string |
| `bootstrap.ts` | `Forge: Bootstrap` — read `.forge/`, run `resources/bootstrap.sh` directly in a remote terminal (which is on the box) |
| `resources/bootstrap.sh` | **reusable core**: conda env (reuse-or-install Miniconda) + volume-aware data download, idempotent |
| `resources/bookmarklet.js`, `browser/` | build the deep link from a Vast instance page (bookmarklet + a Chrome content-script) |

## Key design decisions

- **Git auth = relay first, box-key fallback** (`forge.gitAuth`, default `relay`):
  - **relay** (`localCreds.ts`): forward your local SSH key for the clone via
    `ssh -A` — the box authenticates to GitHub with *your* already-authorized key,
    nothing stored on the box, no key to add. If the agent is empty it lists
    `~/.ssh` keys (one → use it, several → ask which) and loads the choice.
  - **box-key** (`remoteAuth.ts` + `resources/setup-git-auth.sh`): fallback (or
    forced) — generate a dedicated ed25519 key **on the box** (persisted on `/data`
    if mounted), point `git config --global core.sshCommand` at it, test
    `ssh -T git@github.com`, and if unauthorized show the public key to add to
    GitHub once. Needed for **terminal/agent** git, because forwarding (relay or
    `GIT_ASKPASS`) is stripped by the **tmux** many GPU images auto-start.
  - `connection.ts` `toGitHubSshUrl()` normalizes any origin (HTTPS / SSH /
    host-alias like `github-work`) to canonical `git@github.com:owner/repo.git`.
  - Caveat: relay covers clone + Source Control–panel push/pull (extension host);
    terminal `git push` needs box-key on tmux images.
- **Terminals in a remote window run on the box.** So `bootstrap.ts` runs the
  script *directly* in a remote integrated terminal (`… | base64 -d | bash -s`) —
  no `ssh` hop.
- **No cross-window state.** Instead of passing intent from the local window to the
  remote window, auto-Bootstrap simply keys off remote-window startup
  (`onStartupFinished`) + the presence of `.forge/forge.toml`, guarded by a
  per-workspace flag so it runs once.
- **TOML in, YAML out.** `forgeConfig.ts` parses `forge.toml` + `env.toml`
  (`smol-toml`) and `js-yaml.dump`s a throwaway `environment.yml` for conda; the
  shell script gets plain inputs via env vars (`FORGE_ENV_NAME`, `FORGE_ENV_YAML`,
  `FORGE_DATA`, `FORGE_SETUP`) — no parsing on the remote. `[tasks]` holds
  setup/run so trailing `[[data]]` blocks can't absorb them.
- **Idempotent everywhere.** ssh-config = one marked block per host, atomic write;
  bootstrap = env create-or-update, data skipped via sentinel files.
- **No secrets at rest.** Lifecycle is browser-side, so there's no API key; only
  an SSH alias + your existing key path land in `~/.ssh/config`.

## The `.forge/` spec

`.forge/forge.toml` (`[workspace]` / `[env]` / `[tasks]` / `[[data]]`) + a conda
`env.toml`. See [`../examples/.forge/`](../examples/.forge/).

## Build phases

P0 scaffold ✓ · P1 connect-via-paste ✓ · P2 deep link ✓ · P3 bootstrap ✓ ·
P4 polish (git clone on connect ✓, auto-bootstrap-on-connect ✓) · P5 local-repo
flow + git auth ✓ · P6 TOML config + conda ✓ · packaging `.vsix` pending.

## Known soft spots

- The bookmarklet scrapes Vast's DOM for the SSH command — may break on UI
  changes; paste is the stable fallback.
- `git clone` on connect needs git creds / a public repo on the box.
- Vast **local** volumes are tied to one physical machine — no Lightning-style
  "swap GPU, keep data" until network volumes ship.
