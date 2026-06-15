import type { LoopSpec, LoopTemplateId, ProjectScan, TemplateDefinition, WizardAnswers } from "./types.js";

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "ci-failure-repair",
    title: "CI failure repair",
    summary: "Diagnose and fix failing CI workflows and jobs.",
    recommended: true
  },
  {
    id: "test-repair",
    title: "Test repair",
    summary: "Find and fix failing tests and flaky test symptoms.",
    recommended: true
  },
  {
    id: "dependency-upgrade",
    title: "Dependency upgrade",
    summary: "Safely upgrade dependencies and resolve breakage.",
    recommended: false
  },
  {
    id: "pr-comment-handling",
    title: "PR comment handling",
    summary: "Triage and respond to actionable pull request comments.",
    recommended: false
  }
];

const FORBIDDEN_PATHS = [
  ".env",
  ".env.*",
  "secrets/**",
  "production/**",
  "**/*prod*secret*",
  "**/*credential*"
];

export function createLoopSpec(id: LoopTemplateId, scan: ProjectScan, answers: WizardAnswers): LoopSpec {
  const definition = TEMPLATE_DEFINITIONS.find((template) => template.id === id);
  if (!definition) {
    throw new Error(`Unknown loop template: ${id}`);
  }

  const verificationCommands = verificationFor(id, scan);
  const requiresHumanCommandDefinition = verificationCommands.length === 0;
  const commands = requiresHumanCommandDefinition
    ? ["echo \"TODO: configure a real verification command before running this loop\""]
    : verificationCommands;

  return {
    id,
    title: definition.title,
    goal: goalFor(id, scan),
    trigger: triggerFor(id, scan, answers.triggerCadence),
    contextSources: contextFor(id, scan),
    actions: actionsFor(id),
    verification: {
      commands,
      acceptanceCriteria: answers.acceptanceCriteria,
      makerChecker: true,
      requiresHumanCommandDefinition
    },
    stopCriteria: {
      maxIterations: answers.maxIterations,
      timeoutMinutes: 45,
      requireHumanInputOn: [
        "verification command is missing or ambiguous",
        "changes require production credentials",
        "more than 20 files would be modified",
        "the same failure repeats after maxIterations"
      ]
    },
    stateFile: `.loopgen/state/${id}.md`,
    permissions: {
      allowedCommands: answers.allowedCommands,
      forbiddenPaths: FORBIDDEN_PATHS,
      allowNetwork: id === "dependency-upgrade",
      allowPrCreation: answers.allowPrCreation
    },
    adapters: answers.adapters
  };
}

export function defaultAnswers(scan: ProjectScan, overrides: Partial<WizardAnswers> = {}): WizardAnswers {
  const inferredCommands = [
    scan.commands.install,
    scan.commands.test,
    scan.commands.lint,
    scan.commands.build,
    scan.commands.format
  ].filter(Boolean) as string[];

  const defaults: WizardAnswers = {
    selectedTemplates: ["ci-failure-repair", "test-repair", "dependency-upgrade", "pr-comment-handling"],
    adapters: ["codex", "claude"],
    triggerCadence: "manual",
    acceptanceCriteria: "All configured verification commands pass and the generated state file explains what changed.",
    allowPrCreation: false,
    allowedCommands: inferredCommands,
    maxIterations: 3
  };

  return {
    ...defaults,
    ...definedOverrides(overrides)
  };
}

function definedOverrides(overrides: Partial<WizardAnswers>): Partial<WizardAnswers> {
  return Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as Partial<WizardAnswers>;
}

function goalFor(id: LoopTemplateId, scan: ProjectScan) {
  const project = scan.projectName;
  const goals: Record<LoopTemplateId, string> = {
    "ci-failure-repair": `Restore failing CI jobs for ${project} with the smallest safe code or configuration change.`,
    "test-repair": `Diagnose failing tests in ${project}, fix the underlying issue, and verify the relevant suite.`,
    "dependency-upgrade": `Apply dependency updates for ${project} while preserving current behavior and verification coverage.`,
    "pr-comment-handling": `Triage actionable PR review comments for ${project}, implement accepted fixes, and leave non-actionable items documented.`
  };
  return goals[id];
}

function triggerFor(id: LoopTemplateId, scan: ProjectScan, cadence: string) {
  if (id === "ci-failure-repair") {
    return {
      type: "ci_failure",
      cadence,
      sources: scan.ci.workflowFiles.length > 0 ? scan.ci.workflowFiles : ["manual CI failure URL or log"]
    };
  }
  if (id === "pr-comment-handling") {
    return {
      type: "pull_request_review",
      cadence,
      sources: ["PR review comments", "unresolved review threads"]
    };
  }
  if (id === "dependency-upgrade") {
    return {
      type: "dependency_update",
      cadence,
      sources: ["package manifest", "lockfile", "release notes when available"]
    };
  }
  return {
    type: "test_failure",
    cadence,
    sources: ["test output", "changed files", "related test files"]
  };
}

function contextFor(id: LoopTemplateId, scan: ProjectScan) {
  const base = [...scan.contextSources];
  if (id === "test-repair") base.push("tests/**", "**/*.test.*", "**/*.spec.*");
  if (id === "dependency-upgrade") base.push("lockfiles", "dependency manifests");
  if (id === "pr-comment-handling") base.push("PR diff", "review comments");
  return [...new Set(base)];
}

function actionsFor(id: LoopTemplateId) {
  const shared = [
    "Create or reuse an isolated working branch/worktree before edits.",
    "Read the state file first and append a concise attempt log after every iteration.",
    "Make the smallest change that can satisfy the goal.",
    "Run verification before declaring success.",
    "Ask for human input instead of guessing when a stop criterion is met."
  ];

  const byTemplate: Record<LoopTemplateId, string[]> = {
    "ci-failure-repair": [
      "Collect the failing job name, failing command, and relevant log excerpt.",
      "Map the failure to a local verification command before editing."
    ],
    "test-repair": [
      "Reproduce the failing test locally when possible.",
      "Prefer fixing source behavior over weakening assertions."
    ],
    "dependency-upgrade": [
      "Update one dependency group at a time.",
      "Read breaking-change notes when verification fails after an upgrade."
    ],
    "pr-comment-handling": [
      "Classify review comments as actionable, answered, or blocked.",
      "Implement only actionable comments and record the response summary."
    ]
  };

  return [...byTemplate[id], ...shared];
}

function verificationFor(id: LoopTemplateId, scan: ProjectScan) {
  const commands = new Set<string>();
  if (id === "ci-failure-repair") {
    if (scan.commands.lint) commands.add(scan.commands.lint);
    if (scan.commands.test) commands.add(scan.commands.test);
    if (scan.commands.build) commands.add(scan.commands.build);
  }
  if (id === "test-repair") {
    if (scan.commands.test) commands.add(scan.commands.test);
  }
  if (id === "dependency-upgrade") {
    if (scan.commands.install) commands.add(scan.commands.install);
    if (scan.commands.test) commands.add(scan.commands.test);
    if (scan.commands.build) commands.add(scan.commands.build);
  }
  if (id === "pr-comment-handling") {
    if (scan.commands.lint) commands.add(scan.commands.lint);
    if (scan.commands.test) commands.add(scan.commands.test);
  }
  return [...commands];
}
