import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";
import { readForgeConfig } from "./forgeConfig";
import { removeManagedHost } from "./sshconfig";

interface CleanupItem extends vscode.QuickPickItem {
  id: "env" | "data" | "key" | "sshconfig" | "repo";
}

/**
 * "Forge: Clean Up Remote" — remove what Forge set up on the box for this repo.
 * Runs in a Forge Remote-SSH window; reads `.forge/` for the env name + data
 * entries, then lets you pick what to remove (env, data, repo folder, box key)
 * plus the local ~/.ssh/config entry.
 */
export async function cleanupCommand(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || !folder.uri.authority.startsWith("ssh-remote+")) {
    vscode.window.showErrorMessage(
      "Forge: Clean Up Remote must run in a Forge Remote-SSH window."
    );
    return;
  }
  const alias = folder.uri.authority.slice("ssh-remote+".length);
  const repoPath = folder.uri.path;

  // Read the env name + data entries from .forge (best-effort).
  let envName: string | undefined;
  let data: { src: string; dest: string }[] = [];
  try {
    const cfg = await readForgeConfig(folder.uri);
    envName = cfg.env.name;
    data = cfg.data;
  } catch {
    // no/invalid .forge — env & data options just won't be offered
  }

  const items: CleanupItem[] = [];
  if (envName) {
    items.push({ id: "env", label: `Conda env: ${envName}`, picked: true });
  }
  if (data.length) {
    items.push({
      id: "data",
      label: `Downloaded data (${data.length}) + cache markers`,
      picked: true,
    });
  }
  items.push({
    id: "key",
    label: "Box SSH key + git config",
    description: "box-key auth — affects all repos on this box",
  });
  items.push({
    id: "sshconfig",
    label: `Local ~/.ssh/config entry (${alias})`,
    description: "on your Mac",
  });
  items.push({
    id: "repo",
    label: `Delete the cloned repo folder (${repoPath})`,
    description: "destructive — unpushed work is lost",
  });

  const picks = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: "Forge: Clean Up Remote — choose what to remove",
    ignoreFocusOut: true,
  });
  if (!picks || picks.length === 0) {
    return;
  }
  const chosen = new Set(picks.map((p) => p.id));

  if (chosen.has("repo")) {
    const ok = await vscode.window.showWarningMessage(
      `Delete ${repoPath} on the box? Any uncommitted/unpushed work there is lost.`,
      { modal: true },
      "Delete"
    );
    if (ok !== "Delete") {
      chosen.delete("repo");
    }
  }

  // Local: drop the ~/.ssh/config managed block for this box.
  if (chosen.has("sshconfig")) {
    await removeManagedHost(alias);
  }

  // Remote: env / data / key / repo removal via a script on the box.
  const remoteWork = (["env", "data", "key", "repo"] as const).some((k) => chosen.has(k));
  if (remoteWork) {
    const scriptPath = path.join(context.extensionPath, "resources", "cleanup.sh");
    const script = await fs.readFile(scriptPath, "utf8");
    const dataLines = data.map((d) => `${d.src}|${d.dest}`).join("\n");

    const wrapper = [
      `export FORGE_CLEAN_ENV=${chosen.has("env") ? "1" : "0"}`,
      `export FORGE_CLEAN_DATA=${chosen.has("data") ? "1" : "0"}`,
      `export FORGE_CLEAN_KEY=${chosen.has("key") ? "1" : "0"}`,
      `export FORGE_CLEAN_REPO=${chosen.has("repo") ? "1" : "0"}`,
      `export FORGE_ENV_NAME=${sq(envName ?? "")}`,
      `export FORGE_DATA=${sq(dataLines)}`,
      `export FORGE_REPO_PATH=${sq(repoPath)}`,
      script,
    ].join("\n");

    const b64 = Buffer.from(wrapper, "utf8").toString("base64");
    const terminal = vscode.window.createTerminal({ name: "Forge Clean Up" });
    terminal.show();
    terminal.sendText(`printf %s ${sq(b64)} | base64 -d | bash -s`);
  } else if (chosen.has("sshconfig")) {
    vscode.window.showInformationMessage(`Forge: removed ${alias} from ~/.ssh/config.`);
  }
}

function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
