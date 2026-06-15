import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

const execFileAsync = promisify(execFile);

/**
 * Ensure the local ssh-agent has a key to relay to the box via `ssh -A`, so the
 * box can authenticate to GitHub with *your* key without it ever leaving your
 * machine. If the agent already has identities, use them. Otherwise list the
 * private keys in ~/.ssh — one → use it; several → ask which — and load it.
 * Returns true once the agent has at least one identity.
 */
export async function ensureRelayKey(): Promise<boolean> {
  if (await agentHasKeys()) {
    return true;
  }

  const keys = await listPrivateKeys();
  if (keys.length === 0) {
    return false;
  }

  let chosen = keys[0];
  if (keys.length > 1) {
    const pick = await vscode.window.showQuickPick(
      keys.map((k) => ({ label: path.basename(k), description: k })),
      {
        title: "Forge: which SSH key should the box use for GitHub? (forwarded, never copied)",
        ignoreFocusOut: true,
      }
    );
    if (!pick) {
      return false;
    }
    chosen = pick.description;
  }

  await addToAgent(chosen);
  return agentHasKeys();
}

async function agentHasKeys(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ssh-add", ["-l"], { timeout: 10_000 });
    return stdout.trim().length > 0 && !/no identities/i.test(stdout);
  } catch {
    // ssh-add -l exits non-zero when there's no agent or no identities.
    return false;
  }
}

async function listPrivateKeys(): Promise<string[]> {
  const dir = path.join(os.homedir(), ".ssh");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const pubs = new Set(entries.filter((e) => e.endsWith(".pub")));
  // A private key is a file with a matching `.pub` sibling.
  return entries
    .filter((e) => !e.endsWith(".pub") && pubs.has(`${e}.pub`))
    .map((e) => path.join(dir, e));
}

async function addToAgent(keyPath: string): Promise<void> {
  const args = process.platform === "darwin" ? ["--apple-use-keychain", keyPath] : [keyPath];
  try {
    await execFileAsync("ssh-add", args, { timeout: 20_000 });
  } catch {
    // May require a passphrase prompt we can't satisfy headlessly — best-effort;
    // the relay clone will simply fall back to the box-key path if this didn't load.
  }
}
