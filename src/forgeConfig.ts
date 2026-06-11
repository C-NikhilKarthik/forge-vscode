import * as vscode from "vscode";
import * as yaml from "js-yaml";

export interface DataEntry {
  src: string;
  dest: string;
}

export interface ForgeConfig {
  env: { file: string; name: string };
  data: DataEntry[];
  setup: string[];
  run: string[];
}

interface RawForge {
  env?: { file?: string; name?: string };
  data?: Array<{ src?: string; dest?: string }>;
  setup?: string[];
  run?: string[];
}

/**
 * Read and validate `.forge/forge.yml` from the given workspace folder.
 * In a Remote-SSH window this reads the file on the remote box.
 */
export async function readForgeConfig(
  folder: vscode.Uri
): Promise<ForgeConfig> {
  const file = vscode.Uri.joinPath(folder, ".forge", "forge.yml");
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(file);
  } catch {
    throw new Error(`No .forge/forge.yml found in ${folder.fsPath}`);
  }

  const raw = yaml.load(Buffer.from(bytes).toString("utf8")) as RawForge | null;
  if (!raw || typeof raw !== "object") {
    throw new Error(".forge/forge.yml is empty or malformed.");
  }

  const envName = raw.env?.name;
  const envFile = raw.env?.file ?? "environment.yml";
  if (!envName) {
    throw new Error(".forge/forge.yml: missing required env.name");
  }

  const data: DataEntry[] = (raw.data ?? [])
    .filter((d) => d.src && d.dest)
    .map((d) => ({ src: d.src as string, dest: d.dest as string }));

  return {
    env: { file: envFile, name: envName },
    data,
    setup: raw.setup ?? [],
    run: raw.run ?? [],
  };
}
