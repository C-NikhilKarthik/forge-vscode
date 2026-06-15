import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConnInfo } from "./connection";
import { writeManagedHost } from "./sshconfig";
import { ensureGitHubAuth, GitIdentity } from "./remoteAuth";

const execFileAsync = promisify(execFile);

/**
 * Write the ~/.ssh/config entry for `conn`, optionally give the box a GitHub
 * identity and clone the repo, then open a Remote-SSH window on the chosen path.
 */
export async function connect(
  conn: ConnInfo,
  context: vscode.ExtensionContext,
  identity: GitIdentity = {}
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("forge");
  const identityFile = cfg.get<string>("identityFile", "~/.ssh/id_ed25519");
  const defaultPath = cfg.get<string>("defaultRemotePath", "/workspace");

  const alias = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Forge: writing SSH config…" },
    () => writeManagedHost(conn, identityFile)
  );

  const remotePath = await setupRemoteFolder(
    context,
    alias,
    conn.repo,
    conn.path ?? defaultPath,
    conn.branch,
    identity
  );

  const remoteUri = vscode.Uri.parse(`vscode-remote://ssh-remote+${alias}${remotePath}`);

  await vscode.commands.executeCommand("vscode.openFolder", remoteUri, {
    forceNewWindow: true,
  });
}

/**
 * Make sure `targetPath` exists on the box and, if a `repo` is given, give the
 * box a GitHub-authorized key (see remoteAuth) and clone the repo there. The
 * folder is always created first so the window has somewhere valid to open (no
 * "Workspace does not exist"). The box authenticates with its own key — nothing
 * from the laptop is copied — so the clone works regardless of the box's shell
 * (tmux) or the user's local SSH config. Best-effort: on failure the (empty)
 * folder still opens. Returns the path to open.
 */
async function setupRemoteFolder(
  context: vscode.ExtensionContext,
  alias: string,
  repo: string | undefined,
  targetPath: string,
  branch: string | undefined,
  identity: GitIdentity
): Promise<string> {
  await sshExec(alias, `mkdir -p ${shellQuote(targetPath)}`).catch(() => {});

  if (!repo) {
    return targetPath;
  }

  try {
    await sshExec(alias, `test -e ${shellQuote(targetPath)}/.git`);
    return targetPath; // already a clone
  } catch {
    // empty dir → set up auth + clone into it
  }

  // Interactive (may prompt to add the box key to GitHub) — no progress spinner.
  const authed = await ensureGitHubAuth(context, alias, identity);
  if (!authed) {
    return targetPath; // open the empty folder; user can finish manually
  }

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Forge: cloning ${repo}…` },
      // core.sshCommand (set by setup-git-auth.sh) points git at the box key and
      // accepts GitHub's host key, so a plain clone authenticates here.
      () => sshExec(alias, `git clone ${shellQuote(repo)} ${shellQuote(targetPath)}`)
    );
    if (branch) {
      // Best-effort: the default branch is already checked out if this fails.
      await sshExec(
        alias,
        `git -C ${shellQuote(targetPath)} checkout ${shellQuote(branch)}`
      ).catch(() => {});
    }
    await setRepoIdentity(alias, targetPath, identity);
  } catch (e) {
    vscode.window.showWarningMessage(
      `Forge: clone failed (${(e as Error).message}). The folder opened empty — open a ` +
        `terminal there and run: git clone ${repo} ${targetPath}`
    );
  }
  return targetPath;
}

async function setRepoIdentity(
  alias: string,
  targetPath: string,
  identity: GitIdentity
): Promise<void> {
  if (identity.name) {
    await sshExec(
      alias,
      `git -C ${shellQuote(targetPath)} config user.name ${shellQuote(identity.name)}`
    ).catch(() => {});
  }
  if (identity.email) {
    await sshExec(
      alias,
      `git -C ${shellQuote(targetPath)} config user.email ${shellQuote(identity.email)}`
    ).catch(() => {});
  }
}

async function sshExec(alias: string, remoteCommand: string): Promise<void> {
  await execFileAsync("ssh", ["-o", "BatchMode=yes", alias, remoteCommand], {
    timeout: 120_000,
  });
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
