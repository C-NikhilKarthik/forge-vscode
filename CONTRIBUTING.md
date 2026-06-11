# Contributing

## Setup

```bash
npm install
```

You'll also want the **Remote - SSH** extension installed in VS Code.

## Build & run

```bash
npm run compile      # bundle once (esbuild → dist/extension.js)
npm run watch        # rebuild on change
npm run lint         # typecheck (tsc --noEmit)
npm run package      # build a .vsix (needs @vscode/vsce)
```

Press **F5** in VS Code to launch an Extension Development Host with the
extension loaded. Try **Forge: Add Connection** against any SSH box you control.

## Layout

See [docs/design.md](docs/design.md) for the module map and key decisions. The
durable core is [`resources/bootstrap.sh`](resources/bootstrap.sh) plus the
`.forge/` spec — keep them tool-agnostic so a future CLI can reuse them.

## Conventions

- TypeScript strict mode; no `tsc` errors and no unused locals/params.
- Shell out to `ssh`/`git` via `child_process`; don't add SSH/HTTP libraries
  unless there's a real need.
- All side effects idempotent: ssh-config writes use the marked managed block +
  atomic rename; bootstrap steps check for prior completion.
- Never write secrets to disk or logs.

## Testing against Vast

1. Start a cheap instance in the Vast browser UI; add your SSH public key.
2. Paste its SSH command via **Forge: Add Connection** → a remote window opens.
3. In that window, add a `.forge/` (see `examples/`) and run **Forge: Bootstrap**;
   run it twice to confirm the second run skips completed steps.
4. Tear the instance down in the Vast UI when done.
