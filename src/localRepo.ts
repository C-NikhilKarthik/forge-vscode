import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface LocalRepo {
  /** `origin` remote URL. */
  origin: string;
  /** Current branch name (or undefined if detached). */
  branch?: string;
  /** True if the working tree has uncommitted changes. */
  dirty: boolean;
  /** Commits ahead of the upstream (0 if none / no upstream). */
  ahead: number;
}

/**
 * Read git facts about the repo at `cwd`. Returns null if it isn't a git repo or
 * has no `origin` remote (the caller then falls back to asking for a URL).
 */
export async function readLocalRepo(cwd: string): Promise<LocalRepo | null> {
  const origin = (await git(cwd, ["remote", "get-url", "origin"]).catch(() => ""))?.trim();
  if (!origin) {
    return null;
  }

  const branchRaw = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")).trim();
  const branch = branchRaw && branchRaw !== "HEAD" ? branchRaw : undefined;

  const status = (await git(cwd, ["status", "--porcelain"]).catch(() => "")).trim();
  const dirty = status.length > 0;

  let ahead = 0;
  const aheadRaw = (
    await git(cwd, ["rev-list", "--count", "@{upstream}..HEAD"]).catch(() => "0")
  ).trim();
  const n = Number(aheadRaw);
  if (Number.isInteger(n) && n > 0) {
    ahead = n;
  }

  return { origin, branch, dirty, ahead };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { timeout: 15_000 });
  return stdout;
}

/** Read the local git user.name / user.email so the box can attribute commits. */
export async function readGitIdentity(cwd?: string): Promise<{ name?: string; email?: string }> {
  const base = cwd ? ["-C", cwd] : [];
  const read = async (key: string): Promise<string | undefined> => {
    try {
      const { stdout } = await execFileAsync("git", [...base, "config", "--get", key], {
        timeout: 10_000,
      });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  };
  return { name: await read("user.name"), email: await read("user.email") };
}
