import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";
import { readForgeConfig } from "./forgeConfig";

/**
 * "Forge: Bootstrap" — runs the env + data setup on the remote box.
 *
 * Must be invoked from a Forge Remote-SSH window. We read the remote
 * `.forge/forge.yml` (workspace.fs proxies to the remote), then pipe the
 * bootstrap script to the box over ssh in a local terminal. This keeps
 * everything on the single (UI) extension host — no remote extension needed.
 */
export async function bootstrapCommand(
  context: vscode.ExtensionContext
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage("Forge: open a folder first.");
    return;
  }

  const authority = folder.uri.authority; // e.g. "ssh-remote+forge-ssh5.vast.ai-12345"
  if (!authority.startsWith("ssh-remote+")) {
    vscode.window.showErrorMessage(
      "Forge: Bootstrap must run in a Forge Remote-SSH window. Use 'Forge: Add Connection' first."
    );
    return;
  }
  const alias = authority.slice("ssh-remote+".length);
  const remotePath = folder.uri.path;

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
    `cd ${sq(remotePath)}`,
    `export FORGE_ENV_NAME=${sq(config.env.name)}`,
    `export FORGE_ENV_FILE=${sq(config.env.file)}`,
    `export FORGE_DATA=${sq(dataLines)}`,
    `export FORGE_SETUP=${sq(setupLines)}`,
    script,
  ].join("\n");

  const b64 = Buffer.from(wrapper, "utf8").toString("base64");
  const terminal = vscode.window.createTerminal({ name: "Forge Bootstrap" });
  terminal.show();
  terminal.sendText(`printf %s ${sq(b64)} | base64 -d | ssh -o BatchMode=yes ${alias} bash -s`);
}

/** POSIX single-quote a string so it survives the local shell verbatim. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
