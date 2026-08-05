import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ModelConfig } from "@metis/core";
import { homedir } from "node:os";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function hasOpenAiModels(configRoot: string): Promise<boolean> {
  return exists(join(configRoot, "model", "openai"));
}

/** 从某起点向上找带 model/openai 的 config/ */
async function walkForConfig(startDir: string, maxUp = 12): Promise<string | null> {
  let dir = resolve(startDir);
  for (let i = 0; i < maxUp; i += 1) {
    const candidate = join(dir, "config");
    if (await hasOpenAiModels(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 找 config 根目录（含 model/openai/*.yaml）：
 * 1. METIS_CONFIG_DIR
 * 2. 从 cwd 向上
 * 3. 从可执行文件 / dist 安装路径向上（全局 metis 不在仓库里也能找到）
 * 4. ~/.metis/config
 */
export async function defaultConfigDir(): Promise<string> {
  if (process.env.METIS_CONFIG_DIR) return resolve(process.env.METIS_CONFIG_DIR);

  const fromCwd = await walkForConfig(process.cwd());
  if (fromCwd) return fromCwd;

  // argv[1] = dist/main.js 或 bin/metis；realpath 后向上找
  const argv1 = process.argv[1];
  if (argv1) {
    const fromBin = await walkForConfig(dirname(resolve(argv1)));
    if (fromBin) return fromBin;
  }

  const homeConfig = join(homedir(), ".metis", "config");
  if (await hasOpenAiModels(homeConfig)) return homeConfig;

  return homeConfig;
}

export async function openaiModelDir(configDir?: string): Promise<string> {
  return join(configDir ?? (await defaultConfigDir()), "model", "openai");
}

interface YamlModelEntry {
  api_key?: string;
  base_url?: string;
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
  extra_body?: Record<string, unknown>;
}

export async function loadModelProfile(
  profile: string,
  configDir?: string,
): Promise<ModelConfig & { temperature?: number; maxTokens?: number; extraBody?: Record<string, unknown> }> {
  const root = configDir ?? (await defaultConfigDir());
  const file = join(await openaiModelDir(root), `${profile}.yaml`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    const available = await listModelProfiles(root).catch(() => [] as string[]);
    throw new Error(
      `模型配置不存在: ${file}\n可用: ${available.join(", ") || "(无)"}\n` +
        `解决：\n` +
        `  1) export METIS_CONFIG_DIR="/path/to/config"  （该目录下应有 model/openai/*.yaml）\n` +
        `  2) 或: ln -sfn "/path/to/config" ~/.metis/config\n` +
        `  3) 或在当前项目放 config/model/openai/<profile>.yaml`,
    );
  }

  const doc = parseYaml(raw) as Record<string, YamlModelEntry>;
  const entry = doc[profile] ?? Object.values(doc)[0];
  if (!entry?.api_key || !entry?.base_url || !entry?.model_id) {
    throw new Error(`模型配置字段不全（需要 api_key / base_url / model_id）: ${file}`);
  }

  return {
    provider: "openai",
    apiKey: entry.api_key,
    baseUrl: entry.base_url,
    model: entry.model_id,
    temperature: entry.temperature,
    maxTokens: entry.max_tokens,
    extraBody: entry.extra_body,
  };
}

export async function listModelProfiles(configDir?: string): Promise<string[]> {
  const dir = await openaiModelDir(configDir);
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort();
}

export async function resolveModelConfig(opts: {
  profile?: string;
  mock?: boolean;
}): Promise<ModelConfig> {
  if (opts.mock || process.env.METIS_PROVIDER === "mock") {
    return { provider: "mock", model: "mock" };
  }

  if (process.env.METIS_API_KEY && process.env.METIS_BASE_URL) {
    return {
      provider: "openai",
      apiKey: process.env.METIS_API_KEY,
      baseUrl: process.env.METIS_BASE_URL,
      model: process.env.METIS_MODEL ?? "gpt-4o-mini",
    };
  }

  const profile =
    opts.profile ?? process.env.METIS_MODEL_PROFILE ?? "example";

  const loaded = await loadModelProfile(profile);
  return {
    provider: "openai",
    apiKey: loaded.apiKey,
    baseUrl: loaded.baseUrl,
    model: loaded.model,
  };
}
