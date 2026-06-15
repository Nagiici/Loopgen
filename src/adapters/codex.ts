import type { GeneratedFile, LoopSpec, ProjectScan } from "../core/types.js";

export function generateCodexFiles(scan: ProjectScan, loops: LoopSpec[]): GeneratedFile[] {
  return loops.flatMap((loop) => [
    {
      path: `.codex/skills/loopgen-${loop.id}/SKILL.md`,
      content: codexSkill(scan, loop)
    },
    {
      path: `.codex/automations/${loop.id}.md`,
      content: codexAutomationPrompt(scan, loop)
    },
    {
      path: `.codex/agents/loopgen-${loop.id}-checker.toml`,
      content: checkerAgent(loop)
    }
  ]);
}

function codexSkill(scan: ProjectScan, loop: LoopSpec) {
  return `---
name: loopgen-${loop.id}
description: ${loop.goal}
---

# ${loop.title}

Use this skill when working on ${scan.projectName} and the goal is:

${loop.goal}

## Required context

Read these sources before editing:

${loop.contextSources.map((source) => `- ${source}`).join("\n")}

## Loop

${loop.actions.map((action, index) => `${index + 1}. ${action}`).join("\n")}

## Verification

Run these commands before success:

${loop.verification.commands.map((command) => `- \`${command}\``).join("\n")}

Acceptance criteria: ${loop.verification.acceptanceCriteria}

## Safety

- Maximum iterations: ${loop.stopCriteria.maxIterations}
- Timeout minutes: ${loop.stopCriteria.timeoutMinutes}
- State file: \`${loop.stateFile}\`
- Do not read or modify: ${loop.permissions.forbiddenPaths.map((item) => `\`${item}\``).join(", ")}
- PR creation allowed: ${loop.permissions.allowPrCreation ? "yes" : "no"}
${loop.verification.requiresHumanCommandDefinition ? "- This loop is in draft mode until the TODO verification command is replaced.\n" : ""}
`;
}

function codexAutomationPrompt(scan: ProjectScan, loop: LoopSpec) {
  return `# Codex automation prompt: ${loop.title}

Project: ${scan.projectName}
Loop id: ${loop.id}
Skill: loopgen-${loop.id}
State file: ${loop.stateFile}

Goal:
${loop.goal}

Trigger:
- Type: ${loop.trigger.type}
- Cadence: ${loop.trigger.cadence}
- Sources: ${loop.trigger.sources.join(", ")}

Instructions:
1. Start from a clean branch or isolated worktree.
2. Read the state file and required context.
3. Perform one small maker iteration.
4. Run verification commands.
5. Use the checker agent instructions in \`.codex/agents/loopgen-${loop.id}-checker.toml\` before declaring success.
6. Append the result, commands run, and remaining risks to the state file.

Allowed commands:
${loop.permissions.allowedCommands.map((command) => `- ${command}`).join("\n") || "- No commands inferred. Configure commands before running."}

Stop and ask for human input when:
${loop.stopCriteria.requireHumanInputOn.map((condition) => `- ${condition}`).join("\n")}
`;
}

function checkerAgent(loop: LoopSpec) {
  return `name = "loopgen-${loop.id}-checker"
description = "Checks whether a loopgen maker iteration satisfied the goal without broad or unsafe changes."
instructions = """
Review the maker changes for loop ${loop.id}.
Confirm the diff is small, the verification commands were run, and the state file was updated.
Reject the iteration if it touches forbidden paths, weakens tests without justification, omits verification, or exceeds the stop criteria.
"""
`;
}
