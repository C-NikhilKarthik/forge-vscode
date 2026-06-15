import * as vscode from "vscode";
import { parseSshCommand, toGitHubSshUrl, repoNameFromUrl, ConnInfo } from "./connection";
import { readLocalRepo, readGitIdentity } from "./localRepo";
import { connect } from "./connect";

const LAST_SSH_KEY = "forge.lastSshCommand";

/**
 * "Forge: Open Repo on Remote" — run from a repo open locally. Reads the repo's
 * origin + current branch, picks/recalls a Vast machine, then clones the repo
 * onto the box and opens a Remote-SSH window on it. Git auth rides the forwarded
 * SSH agent / VS Code's credential forwarding — nothing is copied to the box.
 */
export async function openRepoOnRemoteCommand(
  context: vscode.ExtensionContext
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder?.uri.authority.startsWith("ssh-remote+")) {
    vscode.window.showInformationMessage(
      "Forge: you're already in a remote window. Run this from a locally-open repo."
    );
    return;
  }

  // 1. Resolve the repo URL + branch — from the open local repo, else ask.
  let origin: string | undefined;
  let branch: string | undefined;
  const localPath = folder?.uri.scheme === "file" ? folder.uri.fsPath : undefined;

  if (localPath) {
    const repo = await readLocalRepo(localPath);
    if (repo) {
      origin = repo.origin;
      branch = repo.branch;
      if (repo.dirty || repo.ahead > 0) {
        const proceed = await vscode.window.showWarningMessage(
          `Forge: this repo has ${repo.dirty ? "uncommitted changes" : ""}` +
            `${repo.dirty && repo.ahead > 0 ? " and " : ""}` +
            `${repo.ahead > 0 ? `${repo.ahead} unpushed commit(s)` : ""}. ` +
            `The box is cloned from origin/${branch ?? "HEAD"}, so that work won't be there yet.`,
          { modal: true },
          "Continue"
        );
        if (proceed !== "Continue") {
          return;
        }
      }
    }
  }

  if (!origin) {
    origin = await vscode.window.showInputBox({
      title: "Forge: repo to open on the remote",
      prompt: "Git URL to clone onto the box",
      placeHolder: "git@github.com:me/project.git",
      ignoreFocusOut: true,
    });
    if (!origin) {
      return;
    }
  }

  // 2. Resolve the machine (recall the last one, or paste a new SSH command).
  const machine = await resolveMachine(context);
  if (!machine) {
    return;
  }

  // 3. Build the connection: canonical GitHub URL (the box uses its own key),
  //    the current branch, and a per-repo remote path.
  const cfg = vscode.workspace.getConfiguration("forge");
  const base = cfg.get<string>("defaultRemotePath", "/workspace").replace(/\/+$/, "");
  const repoName = repoNameFromUrl(origin);

  const conn: ConnInfo = {
    ...machine,
    repo: toGitHubSshUrl(origin),
    branch,
    path: `${base}/${repoName}`,
  };

  const identity = await readGitIdentity(localPath);
  await connect(conn, context, identity);
}

/** Recall the last-used SSH command (per workspace) or prompt for a new one. */
async function resolveMachine(
  context: vscode.ExtensionContext
): Promise<ConnInfo | undefined> {
  const last = context.workspaceState.get<string>(LAST_SSH_KEY);

  let sshCommand = last;
  if (last) {
    const pick = await vscode.window.showQuickPick(
      [
        { label: `$(server) Reuse: ${last}`, value: "reuse" },
        { label: "$(edit) Enter a different machine…", value: "new" },
      ],
      { title: "Forge: which machine?", ignoreFocusOut: true }
    );
    if (!pick) {
      return undefined;
    }
    if (pick.value === "new") {
      sshCommand = undefined;
    }
  }

  if (!sshCommand) {
    sshCommand = await vscode.window.showInputBox({
      title: "Forge: Vast machine",
      prompt: "Paste the SSH command from the Vast.ai instance page",
      placeHolder: "ssh -p 12345 root@ssh5.vast.ai",
      ignoreFocusOut: true,
    });
    if (!sshCommand) {
      return undefined;
    }
  }

  try {
    const conn = parseSshCommand(sshCommand);
    await context.workspaceState.update(LAST_SSH_KEY, sshCommand);
    return conn;
  } catch (e) {
    vscode.window.showErrorMessage(`Forge: ${(e as Error).message}`);
    return undefined;
  }
}
