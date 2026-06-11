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
| `extension.ts` | `activate()`: register commands + the `vscode://` URI handler |
| `connection.ts` | `ConnInfo` type; parse from a pasted `ssh …` command or a deep-link query; stable `Host` alias |
| `sshconfig.ts` | write/remove an idempotent managed block in `~/.ssh/config` (atomic temp + rename) |
| `connect.ts` | write config → optional `git clone` on the box → `vscode.openFolder(vscode-remote://ssh-remote+<alias><path>)` |
| `uri.ts` | handle `vscode://forge.forge/connect?host=…&port=…&user=…&repo=…&path=…` |
| `paste.ts` | `Forge: Add Connection` — input box → parse → connect |
| `forgeConfig.ts` | read + validate `.forge/forge.yml` (via `workspace.fs`, works over the remote) |
| `bootstrap.ts` | `Forge: Bootstrap` — derive alias from the window authority, pipe `resources/bootstrap.sh` to the box over ssh in a terminal |
| `resources/bootstrap.sh` | **reusable core**: micromamba env + volume-aware data download, idempotent |
| `resources/bookmarklet.js` | builds the deep link from a Vast instance page |

## Key design decisions

- **Single (UI) extension host.** Bootstrap doesn't need a remote extension host:
  it reads the remote `.forge/forge.yml` through `workspace.fs` (VS Code proxies
  it), derives the SSH alias from `workspaceFolders[0].uri.authority`
  (`ssh-remote+<alias>`), and pipes the script to the box via
  `… | base64 -d | ssh <alias> bash -s` in a terminal. Avoids `extensionKind`
  juggling entirely.
- **YAML parsed in TS, not bash.** `forgeConfig.ts` parses `forge.yml`; the shell
  script receives plain inputs via env vars (`FORGE_ENV_NAME`, `FORGE_ENV_FILE`,
  `FORGE_DATA`, `FORGE_SETUP`) — no YAML parsing on the remote.
- **Idempotent everywhere.** ssh-config = one marked block per host, atomic write;
  bootstrap = env create-or-update, data skipped via sentinel files.
- **No secrets at rest.** Lifecycle is browser-side, so there's no API key; only
  an SSH alias + your existing key path land in `~/.ssh/config`.

## The `.forge/` spec

`.forge/forge.yml` (`env` / `data` / `setup` / `run`) + a standard
`environment.yml`. See [`../examples/.forge/`](../examples/.forge/).

## Build phases

P0 scaffold ✓ · P1 connect-via-paste ✓ · P2 deep link ✓ · P3 bootstrap ✓ ·
P4 polish (git clone on connect ✓, auto-bootstrap setting — wire-up pending,
package `.vsix`).

## Known soft spots

- The bookmarklet scrapes Vast's DOM for the SSH command — may break on UI
  changes; paste is the stable fallback.
- `git clone` on connect needs git creds / a public repo on the box.
- Vast **local** volumes are tied to one physical machine — no Lightning-style
  "swap GPU, keep data" until network volumes ship.
