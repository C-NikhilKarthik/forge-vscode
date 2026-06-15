import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import * as path from "path";

const execFileAsync = promisify(execFile);

export interface GitIdentity {
  name?: string;
  email?: string;
}

/**
 * Ensure the box has a GitHub-authorized SSH identity of its own, so git works
 * in any shell / the GUI / for agents — without copying the user's laptop creds
 * or a PAT. Runs `resources/setup-git-auth.sh` on the box (creates the key, sets
 * core.sshCommand + identity, tests auth). If the box isn't authorized yet, shows
 * the public key and walks the user through adding it to GitHub, then re-tests.
 *
 * Returns true once the box can authenticate to GitHub, false if the user backs
 * out (the caller then opens the folder anyway so they can sort it manually).
 */
export async function ensureGitHubAuth(
  context: vscode.ExtensionContext,
  alias: string,
  identity: GitIdentity
): Promise<boolean> {
  const scriptPath = path.join(context.extensionPath, "resources", "setup-git-auth.sh");
  const script = await fs.readFile(scriptPath, "utf8");

  // Re-run the setup/test up to a few times as the user adds the key.
  for (let attempt = 0; attempt < 5; attempt++) {
    const out = await runSetup(alias, script, identity);
    if (out.auth === "ok") {
      return true;
    }

    const choice = await vscode.window.showWarningMessage(
      "Forge: this box isn't authorized on GitHub yet. Add its SSH key (below) to " +
        "your GitHub account, then continue. Your own keys/tokens are never copied here.",
      { modal: true, detail: out.pubkey ?? "(public key unavailable)" },
      "Copy key & open GitHub",
      "I've added it — retry"
    );

    if (choice === "Copy key & open GitHub") {
      if (out.pubkey) {
        await vscode.env.clipboard.writeText(out.pubkey);
      }
      await vscode.env.openExternal(vscode.Uri.parse("https://github.com/settings/ssh/new"));
      // Loop again → user adds the key in the browser, then we re-test.
      const done = await vscode.window.showInformationMessage(
        "Forge: paste the key on GitHub (it's on your clipboard), then click Retry.",
        { modal: true },
        "Retry"
      );
      if (done !== "Retry") {
        return false;
      }
    } else if (choice !== "I've added it — retry") {
      return false; // user dismissed
    }
  }

  vscode.window.showErrorMessage(
    "Forge: still couldn't authenticate to GitHub from the box. Opening the folder anyway."
  );
  return false;
}

interface SetupResult {
  auth?: "ok" | "missing";
  pubkey?: string;
  key?: string;
}

async function runSetup(
  alias: string,
  script: string,
  identity: GitIdentity
): Promise<SetupResult> {
  const wrapper = [
    identity.name ? `export FORGE_GIT_NAME=${sq(identity.name)}` : "",
    identity.email ? `export FORGE_GIT_EMAIL=${sq(identity.email)}` : "",
    script,
  ]
    .filter(Boolean)
    .join("\n");

  const b64 = Buffer.from(wrapper, "utf8").toString("base64");
  let stdout = "";
  try {
    const res = await execFileAsync(
      "ssh",
      ["-o", "BatchMode=yes", alias, `printf %s ${sq(b64)} | base64 -d | bash -s`],
      { timeout: 60_000 }
    );
    stdout = res.stdout;
  } catch (e) {
    // The remote script may exit non-zero; still parse whatever it printed.
    stdout = (e as { stdout?: string }).stdout ?? "";
  }

  const result: SetupResult = {};
  for (const line of stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq);
    const val = line.slice(eq + 1).trim();
    if (key === "FORGE_AUTH") {
      result.auth = val === "ok" ? "ok" : "missing";
    } else if (key === "FORGE_PUBKEY") {
      result.pubkey = val;
    } else if (key === "FORGE_KEY") {
      result.key = val;
    }
  }
  return result;
}

/** POSIX single-quote a string so it survives the shell verbatim. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
