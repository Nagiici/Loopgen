import type { AdapterConfig, AdapterId, GeneratedFile, LoopSpec, ProjectScan } from "../core/types.js";

interface LocalModelAdapterOptions {
  adapterId: Extract<AdapterId, "ollama" | "openai-compatible">;
  config: AdapterConfig;
}

export function generateLocalModelFiles(scan: ProjectScan, loops: LoopSpec[], options: LocalModelAdapterOptions): GeneratedFile[] {
  const config = normalizeLocalConfig(options.adapterId, options.config);
  return [
    {
      path: `.loopgen/adapters/${options.adapterId}/config.json`,
      content: JSON.stringify(renderConfig(scan.projectName, options.adapterId, config), null, 2) + "\n"
    },
    ...loops.map((loop) => ({
      path: `.loopgen/adapters/${options.adapterId}/${loop.id}.md`,
      content: renderRunbook(scan, loop, options.adapterId, config)
    }))
  ];
}

export function localModelWarnings(adapterId: AdapterId, config: AdapterConfig | undefined) {
  if (adapterId !== "ollama" && adapterId !== "openai-compatible") return [];
  const warnings: string[] = [];
  if (!config?.model?.trim() || config.model === "TODO_MODEL") {
    warnings.push(`${adapterId} needs a model name before the generated runbook can call the local runtime.`);
  }
  if (!config?.baseUrl?.trim()) {
    warnings.push(`${adapterId} needs a base URL before the generated runbook can call the local runtime.`);
  }
  return warnings;
}

function normalizeLocalConfig(adapterId: LocalModelAdapterOptions["adapterId"], config: AdapterConfig): Required<Pick<AdapterConfig, "baseUrl" | "model">> & AdapterConfig {
  if (adapterId === "ollama") {
    return {
      preset: config.preset ?? "ollama",
      baseUrl: config.baseUrl?.trim() || "http://localhost:11434",
      model: config.model?.trim() || "TODO_MODEL"
    };
  }
  return {
    preset: config.preset ?? "lm-studio",
    baseUrl: config.baseUrl?.trim() || "http://localhost:1234/v1",
    model: config.model?.trim() || "TODO_MODEL",
    apiKeyEnv: config.apiKeyEnv?.trim() ?? ""
  };
}

function renderConfig(projectName: string, adapterId: LocalModelAdapterOptions["adapterId"], config: AdapterConfig) {
  return {
    version: "0.1",
    project: projectName,
    adapter: adapterId,
    preset: config.preset,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyEnv: adapterId === "openai-compatible" ? config.apiKeyEnv || undefined : undefined,
    executesAutomatically: false,
    warnings: localModelWarnings(adapterId, config),
    notes: [
      "loopgen generates local model runbooks only; it does not execute the model.",
      "Do not write API keys or secrets into this file."
    ]
  };
}

function renderRunbook(scan: ProjectScan, loop: LoopSpec, adapterId: LocalModelAdapterOptions["adapterId"], config: AdapterConfig) {
  return `# ${loop.title} local model runbook

Project: ${scan.projectName}
Loop id: ${loop.id}
Adapter: ${adapterId}
Preset: ${config.preset ?? "custom"}
Base URL: ${config.baseUrl}
Model: ${config.model}

> loopgen generated this runbook for a local/open-source model runtime. It does not execute the model automatically.

## Goal

${loop.goal}

Expected outcome: ${loop.expectedOutcome}

## Context to provide

${loop.contextSources.map((source) => `- ${source}`).join("\n")}

## Prompt template

\`\`\`text
You are running a bounded loop engineering workflow for ${scan.projectName}.

Goal:
${loop.goal}

Expected outcome:
${loop.expectedOutcome}

Context sources to inspect or summarize:
${loop.contextSources.map((source) => `- ${source}`).join("\n")}

Loop steps:
${loop.actions.map((action, index) => `${index + 1}. ${action}`).join("\n")}

Verification commands:
${loop.verification.commands.map((command) => `- ${command}`).join("\n")}

State file:
${loop.stateFile}

Stop and ask for human input when:
${loop.stopCriteria.requireHumanInputOn.map((condition) => `- ${condition}`).join("\n")}

Return a concise plan for the next maker iteration, the files likely involved, verification to run, and state-file notes to append.
\`\`\`

## Curl example

${adapterId === "ollama" ? ollamaCurlExample(config, loop) : openAiCompatibleCurlExample(config, loop)}

## Verification

Run these commands before declaring success:

${loop.verification.commands.map((command) => `- \`${command}\``).join("\n")}

Acceptance criteria: ${loop.verification.acceptanceCriteria}

## Safety

- State file: \`${loop.stateFile}\`
- Maximum iterations: ${loop.stopCriteria.maxIterations}
- Timeout minutes: ${loop.stopCriteria.timeoutMinutes}
- Network allowed: ${loop.permissions.allowNetwork ? "yes" : "no"}
- PR creation allowed: ${loop.permissions.allowPrCreation ? "yes" : "no"}
- Do not read or modify: ${loop.permissions.forbiddenPaths.map((item) => `\`${item}\``).join(", ")}

${localModelWarnings(adapterId, config).length ? `## TODO\n\n${localModelWarnings(adapterId, config).map((warning) => `- ${warning}`).join("\n")}\n` : ""}
`;
}

function ollamaCurlExample(config: AdapterConfig, loop: LoopSpec) {
  return `\`\`\`bash
curl ${config.baseUrl}/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${config.model}",
    "stream": false,
    "messages": [
      {
        "role": "system",
        "content": "You are a careful loop engineering assistant. Keep changes bounded, verify before success, and update the loop state file."
      },
      {
        "role": "user",
        "content": "Run the next maker iteration for loop ${loop.id}. Use the prompt template in this runbook."
      }
    ]
  }'
\`\`\``;
}

function openAiCompatibleCurlExample(config: AdapterConfig, loop: LoopSpec) {
  const authLine = config.apiKeyEnv ? `  -H "Authorization: Bearer $${config.apiKeyEnv}" \\\n` : "";
  return `\`\`\`bash
curl ${config.baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
${authLine}  -d '{
    "model": "${config.model}",
    "messages": [
      {
        "role": "system",
        "content": "You are a careful loop engineering assistant. Keep changes bounded, verify before success, and update the loop state file."
      },
      {
        "role": "user",
        "content": "Run the next maker iteration for loop ${loop.id}. Use the prompt template in this runbook."
      }
    ]
  }'
\`\`\``;
}
