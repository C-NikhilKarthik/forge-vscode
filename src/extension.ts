import * as vscode from "vscode";
import { addConnectionCommand } from "./paste";
import { uriHandler } from "./uri";
import { bootstrapCommand } from "./bootstrap";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.addConnection", addConnectionCommand),
    vscode.commands.registerCommand("forge.bootstrap", () => bootstrapCommand(context)),
    vscode.window.registerUriHandler(uriHandler)
  );
}

export function deactivate(): void {
  // nothing to clean up
}
