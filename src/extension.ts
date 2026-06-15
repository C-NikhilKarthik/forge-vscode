import * as vscode from "vscode";
import { addConnectionCommand } from "./paste";
import { openRepoOnRemoteCommand } from "./openRepoOnRemote";
import { makeUriHandler } from "./uri";
import { bootstrapCommand } from "./bootstrap";
import { cleanupCommand } from "./cleanup";

// Marker Forge drops in a fresh clone's .git/ (never committed). Its presence in
// a remote window means "this was just cloned — bootstrap it now, once."
export const BOOTSTRAP_MARKER = [".git", ".forge-bootstrap"];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.openRepoOnRemote", () =>
      openRepoOnRemoteCommand(context)
    ),
    vscode.commands.registerCommand("forge.addConnection", () => addConnectionCommand(context)),
    vscode.commands.registerCommand("forge.bootstrap", () => bootstrapCommand(context)),
    vscode.commands.registerCommand("forge.cleanupRemote", () => cleanupCommand(context)),
    vscode.window.registerUriHandler(makeUriHandler(context))
  );

  void maybeAutoBootstrap(context);
}

/**
 * Right after a Forge clone, the remote window opens with a marker in `.git/`.
 * On activation we consume that marker and run Bootstrap once — so it fires the
 * instant a fresh clone opens, but not on later reopens (marker is gone). Re-run
 * manually any time via "Forge: Bootstrap".
 */
async function maybeAutoBootstrap(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || !folder.uri.authority.startsWith("ssh-remote+")) {
    return;
  }
  if (!vscode.workspace.getConfiguration("forge").get<boolean>("autoBootstrapOnConnect", true)) {
    return;
  }

  const marker = vscode.Uri.joinPath(folder.uri, ...BOOTSTRAP_MARKER);
  if (!(await statWithRetry(marker))) {
    return; // not a just-cloned Forge repo
  }

  // Only bootstrap if there's actually a .forge config; consume the marker either way.
  let hasForge = true;
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ".forge", "forge.toml"));
  } catch {
    hasForge = false;
  }
  await safeDelete(marker);
  if (hasForge) {
    await bootstrapCommand(context);
  }
}

/**
 * stat with a few retries, because the remote filesystem may not be ready the
 * instant the extension activates. A genuine "not found" returns immediately;
 * only transient errors are retried.
 */
async function statWithRetry(uri: vscode.Uri): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (e) {
      if (e instanceof vscode.FileSystemError && e.code === "FileNotFound") {
        return false;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

async function safeDelete(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // best-effort
  }
}

export function deactivate(): void {
  // nothing to clean up
}
