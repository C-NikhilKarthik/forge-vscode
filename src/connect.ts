import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConnInfo } from "./connection";
import { writeManagedHost } from "./sshconfig";

const execFileAsync = promisify(execFile);

/**
 * Write the ~/.ssh/config entry for `conn`, optionally clone the repo onto the
 * box, then open a Remote-SSH window on the chosen remote path.
 */
export async function connect(conn: ConnInfo): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("forge");
  const identityFile = cfg.get<string>("identityFile", "~/.ssh/id_ed25519");
  const defaultPath = cfg.get<string>("defaultRemotePath", "/root");

  const alias = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Forge: writing SSH config…" },
    () => writeManagedHost(conn, identityFile)
  );

  let remotePath = conn.path ?? defaultPath;

  if (conn.repo) {
    remotePath = await ensureRepoCloned(alias, conn.repo, conn.path ?? defaultPath);
  }

  const remoteUri = vscode.Uri.parse(
    `vscode-remote://ssh-remote+${alias}${remotePath}`
  );

  await vscode.commands.executeCommand("vscode.openFolder", remoteUri, {
    forceNewWindow: true,
  });
}

/**
 * Clone `repo` onto the box if `targetPath` doesn't already exist there.
 * Best-effort: if the clone fails we still return the path so the window opens
 * and the user can fix it manually. Returns the path to open.
 */
async function ensureRepoCloned(
  alias: string,
  repo: string,
  targetPath: string
): Promise<string> {
  try {
    // `test -d` exits non-zero if the dir is absent, which rejects the promise.
    await sshExec(alias, `test -d ${shellQuote(targetPath)}`);
    return targetPath; // already present
  } catch {
    // not present → clone
  }

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Forge: cloning ${repo}…` },
      () => sshExec(alias, `git clone ${shellQuote(repo)} ${shellQuote(targetPath)}`)
    );
  } catch (e) {
    vscode.window.showWarningMessage(
      `Forge: git clone failed (${(e as Error).message}). Opening ${targetPath} anyway — clone it manually.`
    );
  }
  return targetPath;
}

async function sshExec(alias: string, remoteCommand: string): Promise<void> {
  await execFileAsync(
    "ssh",
    ["-o", "BatchMode=yes", alias, remoteCommand],
    { timeout: 120_000 }
  );
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
