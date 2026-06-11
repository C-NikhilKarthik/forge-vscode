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
  /** Remote directory to open. */
  path?: string;
}

/** A stable, filename-safe alias used as the `Host` entry in ~/.ssh/config. */
export function aliasFor(conn: ConnInfo): string {
  const host = conn.host.replace(/[^a-zA-Z0-9.-]/g, "-");
  return `forge-${host}-${conn.port}`;
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
