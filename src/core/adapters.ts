import type { AdapterConfig, AdapterConfigMap, AdapterDefinition, AdapterId, AdapterPreset } from "./types.js";

export const DEFAULT_ADAPTER_IDS: AdapterId[] = ["codex", "claude"];

export const ADAPTER_DEFINITIONS: AdapterDefinition[] = [
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    description: "Skills, automation prompts, checker TOML",
    outputPath: ".codex/",
    files: ["skills/*/SKILL.md", "automations/*.md", "agents/*-checker.toml"],
    capabilities: ["Automation prompt", "Project skill", "Checker agent"],
    prBehavior: "Can prepare a PR only when the loop allows PR creation.",
    safetyNotes: ["Dry-run through preview before files are applied.", "Forbidden paths are listed in each generated loop."],
    configurable: false
  },
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    description: "Skills, loop guides, checker notes",
    outputPath: ".claude/",
    files: ["skills/*/SKILL.md", "loops/*.md", "agents/*-checker.md"],
    capabilities: ["Claude skill", "Loop guide", "Checker notes"],
    prBehavior: "Records PR handling guidance; it does not create PRs by default.",
    safetyNotes: ["Requires the user's local Claude Code setup.", "State files record attempts and blockers."],
    configurable: false
  },
  {
    id: "ollama",
    name: "Ollama",
    vendor: "Local runtime",
    description: "Local model config and native Ollama chat runbooks",
    outputPath: ".loopgen/adapters/ollama/",
    files: ["config.json", "*.md"],
    capabilities: ["Local model runbook", "Native /api/chat curl", "Prompt template"],
    prBehavior: "Does not create PRs; generated runbooks guide local model usage.",
    safetyNotes: ["Uses a local endpoint by default.", "No API keys are written into generated files.", "loopgen does not execute the model automatically."],
    configurable: true
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    vendor: "Local or self-hosted runtime",
    description: "Runbooks for LM Studio, llama.cpp, vLLM, LocalAI, and similar servers",
    outputPath: ".loopgen/adapters/openai-compatible/",
    files: ["config.json", "*.md"],
    capabilities: ["OpenAI-style chat completions", "Preset base URLs", "Prompt template"],
    prBehavior: "Does not create PRs; generated runbooks guide local model usage.",
    safetyNotes: ["References API keys by environment variable name only.", "Works with local or private compatible servers.", "loopgen does not execute the model automatically."],
    configurable: true
  }
];

export const ADAPTER_IDS = ADAPTER_DEFINITIONS.map((adapter) => adapter.id);

export const ADAPTER_PRESETS: Record<AdapterPreset, { adapterId: AdapterId; label: string; baseUrl: string; description: string }> = {
  ollama: {
    adapterId: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434",
    description: "Native Ollama API server."
  },
  "lm-studio": {
    adapterId: "openai-compatible",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    description: "LM Studio local server with OpenAI-compatible endpoints."
  },
  "llama-cpp": {
    adapterId: "openai-compatible",
    label: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    description: "llama.cpp server with OpenAI-compatible endpoints."
  },
  "custom-openai-compatible": {
    adapterId: "openai-compatible",
    label: "Custom",
    baseUrl: "http://localhost:8000/v1",
    description: "Custom OpenAI-compatible chat completions server."
  }
};

export function isAdapterId(value: string): value is AdapterId {
  return ADAPTER_IDS.includes(value as AdapterId);
}

export function parseAdapterIds(value: string): AdapterId[] {
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean) as AdapterId[];
  for (const id of ids) {
    if (!isAdapterId(id)) {
      throw new Error(`Unknown adapter: ${id}`);
    }
  }
  return ids.length ? ids : DEFAULT_ADAPTER_IDS;
}

export function adapterDefinitionFor(id: AdapterId) {
  return ADAPTER_DEFINITIONS.find((adapter) => adapter.id === id);
}

export function defaultAdapterConfig(id: AdapterId): AdapterConfig {
  if (id === "ollama") {
    return {
      preset: "ollama",
      baseUrl: ADAPTER_PRESETS.ollama.baseUrl,
      model: ""
    };
  }
  if (id === "openai-compatible") {
    return {
      preset: "lm-studio",
      baseUrl: ADAPTER_PRESETS["lm-studio"].baseUrl,
      model: "",
      apiKeyEnv: ""
    };
  }
  return {};
}

export function normalizeAdapterConfigs(configs: AdapterConfigMap | undefined): AdapterConfigMap {
  const normalized: AdapterConfigMap = {};
  for (const adapter of ADAPTER_DEFINITIONS) {
    const defaults = defaultAdapterConfig(adapter.id);
    const provided = configs?.[adapter.id] ?? {};
    normalized[adapter.id] = {
      ...defaults,
      ...definedAdapterConfig(provided)
    };
  }
  return normalized;
}

function definedAdapterConfig(config: AdapterConfig): AdapterConfig {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as AdapterConfig;
}
