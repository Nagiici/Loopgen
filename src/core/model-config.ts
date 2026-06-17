import { promises as fs } from "node:fs";
import path from "node:path";
import { ADAPTER_PRESETS } from "./adapters.js";
import type { ModelClientConfig, RunOptions } from "./types.js";

const MODEL_TIMEOUT_MS = 180_000;

type LocalAdapterId = "ollama" | "openai-compatible";

interface FileConfig {
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
}

// Precedence: CLI flags ▸ .loopgen/adapters/<id>/config.json ▸ defaults.
export async function resolveModelConfig(projectRoot: string, options: RunOptions): Promise<ModelClientConfig> {
  const adapterId: LocalAdapterId = options.adapter ?? "ollama";
  const fileConfig = await readAdapterConfig(projectRoot, adapterId);

  if (adapterId === "ollama") {
    const baseUrl = options.ollamaBaseUrl?.trim() || fileConfig?.baseUrl?.trim() || ADAPTER_PRESETS.ollama.baseUrl;
    const model = options.ollamaModel?.trim() || fileConfig?.model?.trim() || "";
    assertModel(adapterId, model);
    return { adapterId, baseUrl, model, timeoutMs: MODEL_TIMEOUT_MS };
  }

  const baseUrl =
    options.openaiCompatibleBaseUrl?.trim() || fileConfig?.baseUrl?.trim() || ADAPTER_PRESETS["lm-studio"].baseUrl;
  const model = options.openaiCompatibleModel?.trim() || fileConfig?.model?.trim() || "";
  const apiKeyEnv = options.openaiCompatibleApiKeyEnv?.trim() || fileConfig?.apiKeyEnv?.trim() || undefined;
  assertModel(adapterId, model);
  return { adapterId, baseUrl, model, apiKeyEnv, timeoutMs: MODEL_TIMEOUT_MS };
}

async function readAdapterConfig(projectRoot: string, adapterId: LocalAdapterId): Promise<FileConfig | undefined> {
  const filePath = path.join(projectRoot, ".loopgen", "adapters", adapterId, "config.json");
  const raw = await fs.readFile(filePath, "utf8").catch(() => undefined);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as FileConfig;
    return { baseUrl: parsed.baseUrl, model: parsed.model, apiKeyEnv: parsed.apiKeyEnv };
  } catch {
    return undefined;
  }
}

function assertModel(adapterId: LocalAdapterId, model: string): void {
  if (!model || model === "TODO_MODEL") {
    const flag = adapterId === "ollama" ? "--ollama-model" : "--openai-compatible-model";
    throw new Error(`No model configured for ${adapterId}. Pass ${flag} <name> or set it in .loopgen/adapters/${adapterId}/config.json.`);
  }
}
