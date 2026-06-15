/**
 * Connection details for a Vast.ai instance, parsed either from a `vscode://`
 * deep-link query or from a pasted `ssh ...` command.
 */
export interface ConnInfo {
  host: string;
  port: number;
  user: string;
  /** Optional git repo to clone onto the box. */
  repo?: string;
  /** Optional branch to check out after cloning. */
  branch?: string;
  /** Remote directory to open. */
  path?: string;
}

/** A stable, filename-safe alias used as the `Host` entry in ~/.ssh/config. */
export function aliasFor(conn: ConnInfo): string {
  const host = conn.host.replace(/[^a-zA-Z0-9.-]/g, "-");
  return `forge-${host}-${conn.port}`;
}

/** Derive a directory name from a git URL, e.g. git@github.com:me/proj.git → proj. */
export function repoNameFromUrl(url: string): string {
  const tail = url.replace(/\/+$/, "").split(/[/:]/).pop() ?? "repo";
  return tail.replace(/\.git$/, "") || "repo";
}

/**
 * Normalize any GitHub remote — HTTPS, SSH, or an SSH host *alias* like
 * `git@github-work:owner/repo` — to the canonical `git@github.com:owner/repo.git`
 * form. The box authenticates with its own key (see remoteAuth), so we don't
 * depend on the user's local SSH config/aliases existing on the box. Non-GitHub
 * or unrecognised URLs are returned unchanged.
 */
export function toGitHubSshUrl(url: string): string {
  const u = url.trim();

  // https://github.com/owner/repo(.git)
  let m = u.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (m) {
    return `git@github.com:${m[1]}/${m[2]}.git`;
  }

  // ssh://git@github.com/owner/repo(.git)
  m = u.match(/^ssh:\/\/[^@]+@([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (m && /github/i.test(m[1])) {
    return `git@github.com:${m[2]}/${m[3]}.git`;
  }

  // git@<host-or-alias>:owner/repo(.git) — collapse any "github" alias to github.com
  m = u.match(/^[^@]+@([^:]+):([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (m && /github/i.test(m[1])) {
    return `git@github.com:${m[2]}/${m[3]}.git`;
  }

  return u;
}

/**
 * Parse a pasted SSH command as shown by the Vast.ai console, e.g.
 *   ssh -p 12345 root@ssh5.vast.ai -L 8080:localhost:8080
 * Only the host, port and user are extracted; extra flags are ignored.
 */
export function parseSshCommand(input: string): ConnInfo {
  const text = input.trim();
  if (!/^ssh\b/.test(text)) {
    throw new Error('Not an ssh command — expected it to start with "ssh".');
  }

  const tokens = text.split(/\s+/);
  let port = 22;
  let target: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "-p") {
      const next = tokens[++i];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid port: ${next}`);
      }
      port = parsed;
    } else if (tok.startsWith("-")) {
      // Flags that take a value we don't care about (e.g. -L, -i, -o).
      if (["-L", "-R", "-i", "-o", "-D", "-J"].includes(tok)) {
        i++;
      }
    } else if (!target) {
      target = tok;
    }
  }

  if (!target) {
    throw new Error("Could not find user@host in the ssh command.");
  }

  const at = target.indexOf("@");
  const user = at >= 0 ? target.slice(0, at) : "root";
  const host = at >= 0 ? target.slice(at + 1) : target;
  if (!host) {
    throw new Error("Could not parse host from the ssh command.");
  }

  return { host, port, user };
}

/** Parse connection info from a deep-link query string. */
export function parseQuery(query: string): ConnInfo {
  const p = new URLSearchParams(query);
  const host = p.get("host");
  if (!host) {
    throw new Error("Deep link missing required 'host' parameter.");
  }
  const portRaw = p.get("port") ?? "22";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Deep link has invalid 'port': ${portRaw}`);
  }
  return {
    host,
    port,
    user: p.get("user") ?? "root",
    repo: p.get("repo") ?? undefined,
    path: p.get("path") ?? undefined,
  };
}
