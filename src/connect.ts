import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConnInfo } from "./connection";
import { writeManagedHost } from "./sshconfig";
import { ensureGitHubAuth, GitIdentity } from "./remoteAuth";
import { ensureRelayKey } from "./localCreds";

const execFileAsync = promisify(execFile);

/**
 * Write the ~/.ssh/config entry for `conn`, optionally set up GitHub access and
 * clone the repo, then open a Remote-SSH window on the chosen path.
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
 * Ensure `targetPath` exists on the box and, if a `repo` is given, clone it.
 *
 * Auth strategy (default "relay", overridable via `forge.gitAuth`):
 *  - **relay**: forward your local SSH key (`ssh -A`) so the box authenticates to
 *    GitHub with *your* key for the clone — nothing is stored on the box. Falls
 *    back to box-key if you have no local key or the relay clone fails.
 *  - **box-key**: give the box its own dedicated key (see remoteAuth) — needed for
 *    terminal/agent git on images whose tmux strips forwarded credentials.
 *
 * The folder is always created first so the window opens even if cloning fails.
 */
async function setupRemoteFolder(
  context: vscode.ExtensionContext,
  alias: string,
  repo: string | undefined,
  targetPath: string,
  branch: string | undefined,
  identity: GitIdentity
): Promise<string> {
  await sshExec(["-o", "BatchMode=yes"], alias, `mkdir -p ${q(targetPath)}`).catch(() => {});

  if (!repo) {
    return targetPath;
  }

  try {
    await sshExec(["-o", "BatchMode=yes"], alias, `test -e ${q(targetPath)}/.git`);
    return targetPath; // already a clone
  } catch {
    // empty dir → set up auth + clone into it
  }

  const mode = vscode.workspace.getConfiguration("forge").get<string>("gitAuth", "relay");
  let cloned = false;

  // 1) Relay: forward the local key for the clone (no secret on the box).
  if (mode !== "box-key" && (await ensureRelayKey())) {
    cloned = await cloneRepo(alias, repo, targetPath, branch, {
      forwardAgent: true,
      gitEnv: "GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=accept-new' ",
    });
  }

  // 2) Box-key: dedicated key on the box (also enables terminal/agent git).
  if (!cloned) {
    const authed = await ensureGitHubAuth(context, alias, identity);
    if (authed) {
      // setup-git-auth.sh set core.sshCommand (key + accept-new); plain clone uses it.
      cloned = await cloneRepo(alias, repo, targetPath, branch, {
        forwardAgent: false,
        gitEnv: "",
      });
    }
  }

  if (cloned) {
    await setRepoIdentity(alias, targetPath, identity);
    // Drop a marker in .git/ (never committed) so the remote window auto-runs
    // Bootstrap the instant it opens onto this fresh clone.
    await sshExec(
      ["-o", "BatchMode=yes"],
      alias,
      `touch ${q(targetPath)}/.git/.forge-bootstrap`
    ).catch(() => {});
  } else {
    vscode.window.showWarningMessage(
      `Forge: couldn't clone ${repo}. The folder opened empty — clone it from a terminal ` +
        `(or set "forge.gitAuth": "box-key" and retry).`
    );
  }
  return targetPath;
}

interface CloneOpts {
  forwardAgent: boolean;
  gitEnv: string;
}

async function cloneRepo(
  alias: string,
  repo: string,
  targetPath: string,
  branch: string | undefined,
  opts: CloneOpts
): Promise<boolean> {
  const sshArgs = opts.forwardAgent ? ["-A", "-o", "BatchMode=yes"] : ["-o", "BatchMode=yes"];
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Forge: cloning ${repo}…` },
      () => sshExec(sshArgs, alias, `${opts.gitEnv}git clone ${q(repo)} ${q(targetPath)}`)
    );
    if (branch) {
      // Best-effort: the default branch is already checked out if this fails.
      await sshExec(
        sshArgs,
        alias,
        `${opts.gitEnv}git -C ${q(targetPath)} checkout ${q(branch)}`
      ).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

async function setRepoIdentity(
  alias: string,
  targetPath: string,
  identity: GitIdentity
): Promise<void> {
  if (identity.name) {
    await sshExec(
      ["-o", "BatchMode=yes"],
      alias,
      `git -C ${q(targetPath)} config user.name ${q(identity.name)}`
    ).catch(() => {});
  }
  if (identity.email) {
    await sshExec(
      ["-o", "BatchMode=yes"],
      alias,
      `git -C ${q(targetPath)} config user.email ${q(identity.email)}`
    ).catch(() => {});
  }
}

async function sshExec(sshArgs: string[], alias: string, remoteCommand: string): Promise<void> {
  await execFileAsync("ssh", [...sshArgs, alias, remoteCommand], { timeout: 180_000 });
}

function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
