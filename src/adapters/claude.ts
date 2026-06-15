import type { GeneratedFile, LoopSpec, ProjectScan } from "../core/types.js";

export function generateClaudeFiles(scan: ProjectScan, loops: LoopSpec[]): GeneratedFile[] {
  return loops.flatMap((loop) => [
    {
      path: `.claude/skills/loopgen-${loop.id}/SKILL.md`,
      content: claudeSkill(scan, loop)
    },
    {
      path: `.claude/loops/${loop.id}.md`,
      content: claudeLoopGuide(scan, loop)
    },
    {
      path: `.claude/agents/loopgen-${loop.id}-checker.md`,
      content: claudeChecker(loop)
    }
  ]);
}

function claudeSkill(scan: ProjectScan, loop: LoopSpec) {
  return `---
name: loopgen-${loop.id}
description: ${loop.goal}
---

# ${loop.title}

This skill runs a bounded loop-engineering workflow for ${scan.projectName}.

## Goal

${loop.goal}

## Context

${loop.contextSources.map((source) => `- ${source}`).join("\n")}

## Steps

${loop.actions.map((action, index) => `${index + 1}. ${action}`).join("\n")}

## Verify

${loop.verification.commands.map((command) => `- \`${command}\``).join("\n")}

Acceptance criteria: ${loop.verification.acceptanceCriteria}

## Stop conditions

${loop.stopCriteria.requireHumanInputOn.map((condition) => `- ${condition}`).join("\n")}

State file: \`${loop.stateFile}\`
Maximum iterations: ${loop.stopCriteria.maxIterations}
${loop.verification.requiresHumanCommandDefinition ? "\nThis loop is a draft until the TODO verification command is replaced.\n" : ""}
`;
}

function claudeLoopGuide(scan: ProjectScan, loop: LoopSpec) {
  return `# Claude Code loop guide: ${loop.title}

Project: ${scan.projectName}
Loop id: ${loop.id}

Use the \`loopgen-${loop.id}\` skill. Keep maker and checker work separate:

1. Maker reads context, edits, and runs verification.
2. Checker reviews the diff, command output, and state entry.
3. Maker only continues when checker feedback is actionable and within the iteration limit.

Allowed commands:
${loop.permissions.allowedCommands.map((command) => `- ${command}`).join("\n") || "- No commands inferred. Configure commands before running."}

Forbidden paths:
${loop.permissions.forbiddenPaths.map((item) => `- ${item}`).join("\n")}

PR creation: ${loop.permissions.allowPrCreation ? "allowed after verification" : "not allowed by this loop"}
`;
}

function claudeChecker(loop: LoopSpec) {
  return `# Checker instructions for ${loop.title}

Approve only when:

- The change directly supports \`${loop.id}\`.
- Verification commands were run or a blocker is documented.
- The state file \`${loop.stateFile}\` includes the attempt, result, and next step.
- No forbidden path was read or modified.
- The loop stayed within ${loop.stopCriteria.maxIterations} iterations.

Reject when tests are weakened, generated files are committed without need, or the implementation expands beyond the loop goal.
`;
}
