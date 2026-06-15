import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";
import { readForgeConfig } from "./forgeConfig";

/**
 * "Forge: Bootstrap" — runs the conda env + data setup on the remote box.
 *
 * Must be invoked from a Forge Remote-SSH window. We read the remote
 * `.forge/forge.toml` (workspace.fs proxies to the remote), then run the
 * bootstrap script in a remote integrated terminal. A terminal in a Remote-SSH
 * window already runs on the box, so the script executes there directly — no
 * `ssh` hop needed, and VS Code's git credential forwarding is live in it.
 */
export async function bootstrapCommand(
  context: vscode.ExtensionContext
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage("Forge: open a folder first.");
    return;
  }
  if (!folder.uri.authority.startsWith("ssh-remote+")) {
    vscode.window.showErrorMessage(
      "Forge: Bootstrap must run in a Remote-SSH window. Use 'Forge: Open Repo on Remote' first."
    );
    return;
  }

  let config;
  try {
    config = await readForgeConfig(folder.uri);
  } catch (e) {
    vscode.window.showErrorMessage(`Forge: ${(e as Error).message}`);
    return;
  }

  const scriptPath = path.join(context.extensionPath, "resources", "bootstrap.sh");
  const script = await fs.readFile(scriptPath, "utf8");

  const dataLines = config.data.map((d) => `${d.src}|${d.dest}`).join("\n");
  const setupLines = config.setup.join("\n");

  const wrapper = [
    `cd ${sq(folder.uri.path)}`,
    `export FORGE_ENV_NAME=${sq(config.env.name)}`,
    `export FORGE_ENV_YAML=${sq(config.env.yaml)}`,
    `export FORGE_DATA=${sq(dataLines)}`,
    `export FORGE_SETUP=${sq(setupLines)}`,
    script,
  ].join("\n");

  const b64 = Buffer.from(wrapper, "utf8").toString("base64");
  const terminal = vscode.window.createTerminal({ name: "Forge Bootstrap" });
  terminal.show();
  // The terminal is remote (Remote-SSH window); run the script on the box directly.
  terminal.sendText(`printf %s ${sq(b64)} | base64 -d | bash -s`);
}

/** POSIX single-quote a string so it survives the shell verbatim. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
