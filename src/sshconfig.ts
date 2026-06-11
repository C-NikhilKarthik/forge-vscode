import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { ConnInfo, aliasFor } from "./connection";

const SSH_DIR = path.join(os.homedir(), ".ssh");
const CONFIG_PATH = path.join(SSH_DIR, "config");

/**
 * Write (or replace) a managed `~/.ssh/config` block for this connection and
 * return the Host alias. The block is delimited by markers so we can update or
 * remove it idempotently without touching the user's other entries. The whole
 * file is rewritten via a temp file + rename so a crash never leaves it
 * half-written.
 */
export async function writeManagedHost(
  conn: ConnInfo,
  identityFile: string
): Promise<string> {
  const alias = aliasFor(conn);
  const begin = `# >>> forge:${alias} >>>`;
  const end = `# <<< forge:${alias} <<<`;

  const block = [
    begin,
    `Host ${alias}`,
    `    HostName ${conn.host}`,
    `    Port ${conn.port}`,
    `    User ${conn.user}`,
    `    IdentityFile ${expandHome(identityFile)}`,
    `    StrictHostKeyChecking accept-new`,
    `    UserKnownHostsFile ${path.join(SSH_DIR, "known_hosts")}`,
    end,
    "",
  ].join("\n");

  await fs.mkdir(SSH_DIR, { recursive: true, mode: 0o700 });

  const existing = await readIfExists(CONFIG_PATH);
  const withoutBlock = stripBlock(existing, begin, end);
  const next =
    withoutBlock.length > 0 && !withoutBlock.endsWith("\n")
      ? `${withoutBlock}\n\n${block}`
      : `${withoutBlock}${block}`;

  await atomicWrite(CONFIG_PATH, next, 0o600);
  return alias;
}

/** Remove a managed block for an alias, if present. */
export async function removeManagedHost(alias: string): Promise<void> {
  const begin = `# >>> forge:${alias} >>>`;
  const end = `# <<< forge:${alias} <<<`;
  const existing = await readIfExists(CONFIG_PATH);
  if (!existing) {
    return;
  }
  const next = stripBlock(existing, begin, end);
  await atomicWrite(CONFIG_PATH, next, 0o600);
}

function stripBlock(content: string, begin: string, end: string): string {
  const startIdx = content.indexOf(begin);
  if (startIdx === -1) {
    return content;
  }
  const endIdx = content.indexOf(end, startIdx);
  if (endIdx === -1) {
    // Marker pair is broken; leave the file alone rather than guess.
    return content;
  }
  const after = endIdx + end.length;
  // Also swallow a single trailing newline left by the block.
  const tail = content[after] === "\n" ? after + 1 : after;
  const result = content.slice(0, startIdx) + content.slice(tail);
  return result.replace(/\n{3,}/g, "\n\n");
}

async function readIfExists(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw e;
  }
}

async function atomicWrite(file: string, content: string, mode: number): Promise<void> {
  const tmp = `${file}.forge-${process.pid}.tmp`;
  await fs.writeFile(tmp, content, { mode });
  await fs.rename(tmp, file);
}

function expandHome(p: string): string {
  if (p === "~") {
    return os.homedir();
  }
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
