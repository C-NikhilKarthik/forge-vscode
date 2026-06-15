import * as vscode from "vscode";
import { addConnectionCommand } from "./paste";
import { openRepoOnRemoteCommand } from "./openRepoOnRemote";
import { makeUriHandler } from "./uri";
import { bootstrapCommand } from "./bootstrap";

const BOOTSTRAPPED_KEY = "forge.bootstrapped";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.openRepoOnRemote", () =>
      openRepoOnRemoteCommand(context)
    ),
    vscode.commands.registerCommand("forge.addConnection", () => addConnectionCommand(context)),
    vscode.commands.registerCommand("forge.bootstrap", () => bootstrapCommand(context)),
    vscode.window.registerUriHandler(makeUriHandler(context))
  );

  void maybeAutoBootstrap(context);
}

/**
 * When a Forge remote window opens onto a folder with a `.forge/` config, run
 * Bootstrap once automatically (if enabled). Guarded by a per-workspace flag so
 * it doesn't re-run on every reload — re-run manually via "Forge: Bootstrap".
 */
async function maybeAutoBootstrap(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || !folder.uri.authority.startsWith("ssh-remote+")) {
    return;
  }
  const cfg = vscode.workspace.getConfiguration("forge");
  if (!cfg.get<boolean>("autoBootstrapOnConnect", true)) {
    return;
  }
  if (context.workspaceState.get<boolean>(BOOTSTRAPPED_KEY)) {
    return;
  }

  const forgeFile = vscode.Uri.joinPath(folder.uri, ".forge", "forge.toml");
  try {
    await vscode.workspace.fs.stat(forgeFile);
  } catch {
    return; // no .forge/ here — nothing to bootstrap
  }

  await context.workspaceState.update(BOOTSTRAPPED_KEY, true);
  await bootstrapCommand(context);
}

export function deactivate(): void {
  // nothing to clean up
}
