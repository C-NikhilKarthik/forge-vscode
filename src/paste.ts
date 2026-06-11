import * as vscode from "vscode";
import { parseSshCommand } from "./connection";
import { connect } from "./connect";

/**
 * "Forge: Add Connection" — prompt for the SSH command Vast shows, parse it,
 * and connect. This is the stable fallback that needs no web component.
 */
export async function addConnectionCommand(): Promise<void> {
  const input = await vscode.window.showInputBox({
    title: "Forge: Add Connection",
    prompt: "Paste the SSH command from the Vast.ai instance page",
    placeHolder: "ssh -p 12345 root@ssh5.vast.ai",
    ignoreFocusOut: true,
  });

  if (!input) {
    return;
  }

  let conn;
  try {
    conn = parseSshCommand(input);
  } catch (e) {
    vscode.window.showErrorMessage(`Forge: ${(e as Error).message}`);
    return;
  }

  await connect(conn);
}
