import * as vscode from "vscode";
import { parseQuery } from "./connection";
import { connect } from "./connect";

/**
 * Handles `vscode://forge.forge/connect?host=…&port=…&user=…&repo=…&path=…`
 * deep links (e.g. from the Vast console bookmarklet).
 */
export const uriHandler: vscode.UriHandler = {
  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== "/connect") {
      vscode.window.showErrorMessage(`Forge: unknown deep link path "${uri.path}".`);
      return;
    }

    let conn;
    try {
      conn = parseQuery(uri.query);
    } catch (e) {
      vscode.window.showErrorMessage(`Forge: ${(e as Error).message}`);
      return;
    }

    await connect(conn);
  },
};
