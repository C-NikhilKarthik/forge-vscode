import * as vscode from "vscode";
import * as yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";

export interface DataEntry {
  src: string;
  dest: string;
}

export interface ForgeConfig {
  /** conda env name + the environment.yml content generated from env.toml. */
  env: { name: string; yaml: string };
  data: DataEntry[];
  setup: string[];
  run: string[];
  workspace: { repo?: string; path?: string };
}

interface RawForge {
  workspace?: { repo?: string; path?: string };
  env?: { file?: string; name?: string };
  data?: Array<{ src?: string; dest?: string }>;
  tasks?: { setup?: string[]; run?: string[] };
  // Tolerated as a fallback, but `[tasks]` is preferred: bare keys placed after a
  // `[[data]]` header would otherwise bind to that table in TOML.
  setup?: string[];
  run?: string[];
}

interface RawEnv {
  name?: string;
  channels?: string[];
  dependencies?: unknown[];
  pip?: string[];
}

/**
 * Read and validate `.forge/forge.toml` (+ the referenced env TOML) from the
 * given workspace folder. In a Remote-SSH window this reads the files on the
 * remote box. The conda env spec is authored in TOML and translated here into a
 * standard `environment.yml` string, since conda only consumes YAML.
 */
export async function readForgeConfig(folder: vscode.Uri): Promise<ForgeConfig> {
  const forgeUri = vscode.Uri.joinPath(folder, ".forge", "forge.toml");
  const raw = parseToml(await readText(forgeUri, "No .forge/forge.toml found")) as RawForge;
  if (!raw || typeof raw !== "object") {
    throw new Error(".forge/forge.toml is empty or malformed.");
  }

  const envFileName = raw.env?.file ?? "env.toml";
  const envUri = vscode.Uri.joinPath(folder, ".forge", envFileName);
  const rawEnv = parseToml(
    await readText(envUri, `No .forge/${envFileName} found (referenced by forge.toml)`)
  ) as RawEnv;

  const envName = raw.env?.name ?? rawEnv.name;
  if (!envName) {
    throw new Error(".forge: missing conda env name (set [env].name in forge.toml or name in env.toml).");
  }

  const data: DataEntry[] = (raw.data ?? [])
    .filter((d) => d.src && d.dest)
    .map((d) => ({ src: d.src as string, dest: d.dest as string }));

  return {
    env: { name: envName, yaml: toEnvironmentYaml(envName, rawEnv) },
    data,
    setup: raw.tasks?.setup ?? raw.setup ?? [],
    run: raw.tasks?.run ?? raw.run ?? [],
    workspace: { repo: raw.workspace?.repo, path: raw.workspace?.path },
  };
}

/** Translate the TOML env spec into a conda environment.yml string. */
function toEnvironmentYaml(name: string, env: RawEnv): string {
  const dependencies: unknown[] = [...(env.dependencies ?? [])];
  if (env.pip && env.pip.length > 0) {
    dependencies.push({ pip: env.pip });
  }
  const doc: Record<string, unknown> = { name };
  if (env.channels && env.channels.length > 0) {
    doc.channels = env.channels;
  }
  doc.dependencies = dependencies;
  return yaml.dump(doc, { lineWidth: -1 });
}

async function readText(uri: vscode.Uri, missingMsg: string): Promise<string> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
  } catch {
    throw new Error(missingMsg);
  }
}
