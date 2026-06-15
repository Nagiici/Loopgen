import type {
  CommandSet,
  LoopSpec,
  LoopTemplateId,
  ProjectScan,
  TemplateAudience,
  TemplateCategory,
  TemplateDefinition,
  TemplateDifficulty,
  WizardAnswers
} from "./types.js";

type CommandKey = Exclude<keyof CommandSet, "packageManager">;

interface TemplateRecipe extends TemplateDefinition {
  goal: (scan: ProjectScan) => string;
  trigger: (scan: ProjectScan, cadence: string) => LoopSpec["trigger"];
  contextSources: string[];
  actions: string[];
  verification: (scan: ProjectScan) => string[];
  allowNetwork?: boolean;
  timeoutMinutes?: number;
}

export const TEMPLATE_CATEGORIES: Array<{ id: TemplateCategory; label: string; summary: string }> = [
  { id: "maintenance", label: "Maintenance", summary: "Repair and keep project health steady." },
  { id: "delivery", label: "Delivery", summary: "Prepare releases and delivery evidence." },
  { id: "quality", label: "Quality", summary: "Reduce defects and improve confidence." },
  { id: "knowledge", label: "Knowledge", summary: "Turn project work into reusable context." },
  { id: "cross-functional", label: "Cross-functional", summary: "Help technical partners align on outcomes." }
];

export const TEMPLATE_AUDIENCES: Array<{ id: TemplateAudience; label: string }> = [
  { id: "developer", label: "Developer" },
  { id: "qa", label: "QA" },
  { id: "product", label: "Product" },
  { id: "ops", label: "Ops" },
  { id: "data", label: "Data" },
  { id: "solutions", label: "Solutions" }
];

const FORBIDDEN_PATHS = [
  ".env",
  ".env.*",
  "secrets/**",
  "production/**",
  "**/*prod*secret*",
  "**/*credential*"
];

const SHARED_ACTIONS = [
  "Create or reuse an isolated working branch/worktree before edits.",
  "Read the state file first and append a concise attempt log after every iteration.",
  "Make the smallest change that can satisfy the goal.",
  "Run verification before declaring success.",
  "Ask for human input instead of guessing when a stop criterion is met."
];

const TEMPLATE_RECIPES: TemplateRecipe[] = [
  {
    id: "ci-failure-repair",
    title: "CI failure repair",
    summary: "Diagnose and fix failing CI workflows and jobs.",
    category: "maintenance",
    audience: ["developer", "ops", "qa"],
    difficulty: "intro",
    expectedOutcome: "A narrow fix that restores the failing CI signal with verification output.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Restore failing CI jobs for ${scan.projectName} with the smallest safe code or configuration change.`,
    trigger: (scan, cadence) => ({
      type: "ci_failure",
      cadence,
      sources: scan.ci.workflowFiles.length > 0 ? scan.ci.workflowFiles : ["manual CI failure URL or log"]
    }),
    contextSources: ["CI failure log", "changed files"],
    actions: [
      "Collect the failing job name, failing command, and relevant log excerpt.",
      "Map the failure to a local verification command before editing."
    ],
    verification: (scan) => pickCommands(scan, ["lint", "test", "build"])
  },
  {
    id: "test-repair",
    title: "Test repair",
    summary: "Find and fix failing tests and flaky test symptoms.",
    category: "maintenance",
    audience: ["developer", "qa"],
    difficulty: "intro",
    expectedOutcome: "A reproduced failing test is fixed without weakening meaningful assertions.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Diagnose failing tests in ${scan.projectName}, fix the underlying issue, and verify the relevant suite.`,
    trigger: (_scan, cadence) => ({
      type: "test_failure",
      cadence,
      sources: ["test output", "changed files", "related test files"]
    }),
    contextSources: ["tests/**", "**/*.test.*", "**/*.spec.*"],
    actions: [
      "Reproduce the failing test locally when possible.",
      "Prefer fixing source behavior over weakening assertions."
    ],
    verification: (scan) => pickCommands(scan, ["test"])
  },
  {
    id: "dependency-upgrade",
    title: "Dependency upgrade",
    summary: "Safely upgrade dependencies and resolve breakage.",
    category: "maintenance",
    audience: ["developer", "ops"],
    difficulty: "standard",
    expectedOutcome: "A controlled dependency update with install and verification results recorded.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Apply dependency updates for ${scan.projectName} while preserving current behavior and verification coverage.`,
    trigger: (_scan, cadence) => ({
      type: "dependency_update",
      cadence,
      sources: ["package manifest", "lockfile", "release notes when available"]
    }),
    contextSources: ["lockfiles", "dependency manifests", "release notes"],
    actions: [
      "Update one dependency group at a time.",
      "Read breaking-change notes when verification fails after an upgrade."
    ],
    verification: (scan) => pickCommands(scan, ["install", "test", "build"]),
    allowNetwork: true
  },
  {
    id: "pr-comment-handling",
    title: "PR comment handling",
    summary: "Triage and respond to actionable pull request comments.",
    category: "maintenance",
    audience: ["developer", "qa", "product"],
    difficulty: "standard",
    expectedOutcome: "Actionable review comments are resolved and non-actionable items are documented.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Triage actionable PR review comments for ${scan.projectName}, implement accepted fixes, and leave non-actionable items documented.`,
    trigger: (_scan, cadence) => ({
      type: "pull_request_review",
      cadence,
      sources: ["PR review comments", "unresolved review threads"]
    }),
    contextSources: ["PR diff", "review comments"],
    actions: [
      "Classify review comments as actionable, answered, or blocked.",
      "Implement only actionable comments and record the response summary."
    ],
    verification: (scan) => pickCommands(scan, ["lint", "test"])
  },
  {
    id: "release-prep",
    title: "Release preparation",
    summary: "Prepare a release branch with checks, notes, and handoff status.",
    category: "delivery",
    audience: ["developer", "ops", "product"],
    difficulty: "standard",
    expectedOutcome: "A release-ready checklist with verified commands, risks, and handoff notes.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Prepare ${scan.projectName} for release with verified checks, clear risks, and concise handoff notes.`,
    trigger: (_scan, cadence) => ({
      type: "release_preparation",
      cadence,
      sources: ["planned version", "recent commits", "release checklist"]
    }),
    contextSources: ["CHANGELOG.md", "README.md", "package manifest", "release notes"],
    actions: [
      "Identify the intended release version or scope before editing.",
      "Collect verification results, unresolved risks, and release notes in one handoff."
    ],
    verification: (scan) => pickCommands(scan, ["lint", "test", "build"])
  },
  {
    id: "changelog-generation",
    title: "Changelog generation",
    summary: "Turn recent changes into a concise changelog draft.",
    category: "delivery",
    audience: ["developer", "product", "solutions"],
    difficulty: "intro",
    expectedOutcome: "A reviewable changelog entry grouped by user-visible impact and risk.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Draft a concise changelog for ${scan.projectName} from recent changes and project context.`,
    trigger: (_scan, cadence) => ({
      type: "release_notes",
      cadence,
      sources: ["git history", "merged PRs", "issue references"]
    }),
    contextSources: ["CHANGELOG.md", "README.md", "recent commits", "merged PRs"],
    actions: [
      "Group changes by user-visible behavior, internal maintenance, and known risks.",
      "Keep uncertain items marked for human confirmation instead of inventing release claims."
    ],
    verification: (scan) => pickCommands(scan, ["build", "test"])
  },
  {
    id: "rollback-check",
    title: "Rollback check",
    summary: "Assess whether a change can be safely rolled back.",
    category: "delivery",
    audience: ["developer", "ops", "qa"],
    difficulty: "advanced",
    expectedOutcome: "A rollback plan with touched areas, verification commands, and blockers.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Assess rollback readiness for ${scan.projectName} and record the safest path back.`,
    trigger: (_scan, cadence) => ({
      type: "rollback_readiness",
      cadence,
      sources: ["release diff", "incident notes", "deployment checklist"]
    }),
    contextSources: ["deployment docs", "release notes", "changed files"],
    actions: [
      "Identify stateful changes, migrations, configuration changes, and external dependencies.",
      "Record rollback blockers before suggesting any revert."
    ],
    verification: (scan) => pickCommands(scan, ["test", "build"])
  },
  {
    id: "version-upgrade-check",
    title: "Version upgrade check",
    summary: "Plan and verify runtime or framework version upgrades.",
    category: "delivery",
    audience: ["developer", "ops"],
    difficulty: "advanced",
    expectedOutcome: "A version upgrade plan with compatibility notes and verification evidence.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Check a runtime or framework version upgrade for ${scan.projectName} with compatibility evidence.`,
    trigger: (_scan, cadence) => ({
      type: "version_upgrade",
      cadence,
      sources: ["runtime version", "framework version", "upgrade guide"]
    }),
    contextSources: ["package manifest", "lockfiles", "runtime files", "upgrade guides"],
    actions: [
      "Identify the current version, target version, and official upgrade notes.",
      "Apply compatibility fixes in small batches and record any manual follow-up."
    ],
    verification: (scan) => pickCommands(scan, ["install", "test", "build"]),
    allowNetwork: true
  },
  {
    id: "type-error-reduction",
    title: "Type error reduction",
    summary: "Reduce type errors without hiding unsafe behavior.",
    category: "quality",
    audience: ["developer", "qa"],
    difficulty: "standard",
    expectedOutcome: "A smaller type-error set with fixes documented and unsafe casts avoided.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Reduce type errors in ${scan.projectName} while preserving runtime behavior.`,
    trigger: (_scan, cadence) => ({
      type: "typecheck_failure",
      cadence,
      sources: ["typecheck output", "compiler diagnostics"]
    }),
    contextSources: ["tsconfig*.json", "compiler output", "changed source files"],
    actions: [
      "Group type errors by root cause before editing.",
      "Prefer accurate types and source fixes over broad casts or disabled checks."
    ],
    verification: (scan) => pickCommands(scan, ["build", "test"])
  },
  {
    id: "lint-cleanup",
    title: "Lint cleanup",
    summary: "Fix lint violations while keeping behavior unchanged.",
    category: "quality",
    audience: ["developer", "qa"],
    difficulty: "intro",
    expectedOutcome: "A behavior-preserving lint cleanup with the lint command passing.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Clean up lint issues in ${scan.projectName} with behavior-preserving edits.`,
    trigger: (_scan, cadence) => ({
      type: "lint_failure",
      cadence,
      sources: ["lint output", "changed files"]
    }),
    contextSources: ["lint config", "source files", "formatter config"],
    actions: [
      "Separate auto-fixable style issues from behavior-sensitive warnings.",
      "Avoid broad formatting churn unless the formatter command is explicitly allowed."
    ],
    verification: (scan) => pickCommands(scan, ["lint", "test"])
  },
  {
    id: "coverage-gap-fill",
    title: "Coverage gap fill",
    summary: "Add focused tests around uncovered or risky behavior.",
    category: "quality",
    audience: ["developer", "qa"],
    difficulty: "standard",
    expectedOutcome: "Focused tests cover a known gap without brittle implementation coupling.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Add focused test coverage for a known gap in ${scan.projectName}.`,
    trigger: (_scan, cadence) => ({
      type: "coverage_gap",
      cadence,
      sources: ["coverage report", "changed files", "bug report"]
    }),
    contextSources: ["coverage reports", "tests/**", "related source files"],
    actions: [
      "Identify the behavior to protect before writing a test.",
      "Prefer user-observable behavior and regression cases over implementation snapshots."
    ],
    verification: (scan) => pickCommands(scan, ["test"])
  },
  {
    id: "dead-code-cleanup",
    title: "Dead code cleanup",
    summary: "Remove unused code with verification and a rollback trail.",
    category: "quality",
    audience: ["developer", "ops"],
    difficulty: "advanced",
    expectedOutcome: "Unused code is removed with affected surfaces and verification recorded.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Remove clearly unused code from ${scan.projectName} without changing supported behavior.`,
    trigger: (_scan, cadence) => ({
      type: "dead_code_cleanup",
      cadence,
      sources: ["static analysis", "search results", "ownership context"]
    }),
    contextSources: ["source files", "tests/**", "usage search results"],
    actions: [
      "Prove the code is unused through search, tests, or ownership context before deleting.",
      "Keep removals small enough to review and revert."
    ],
    verification: (scan) => pickCommands(scan, ["lint", "test", "build"])
  },
  {
    id: "readme-refresh",
    title: "README refresh",
    summary: "Update setup, commands, and project purpose for new contributors.",
    category: "knowledge",
    audience: ["developer", "product", "solutions"],
    difficulty: "intro",
    expectedOutcome: "A clearer README that reflects current commands and project behavior.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Refresh ${scan.projectName} documentation so a new technical contributor can get oriented quickly.`,
    trigger: (_scan, cadence) => ({
      type: "documentation_refresh",
      cadence,
      sources: ["README.md", "package scripts", "project scan"]
    }),
    contextSources: ["README.md", "package manifest", "docs/**"],
    actions: [
      "Compare documented commands against the project scan before editing.",
      "Keep setup steps concrete and mark unknown deployment or credential details as TODO."
    ],
    verification: (scan) => pickCommands(scan, ["build", "test"])
  },
  {
    id: "architecture-notes",
    title: "Architecture notes",
    summary: "Summarize how the project is structured and where key flows live.",
    category: "knowledge",
    audience: ["developer", "product", "solutions"],
    difficulty: "standard",
    expectedOutcome: "A concise architecture note with boundaries, entry points, and open questions.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Create or update architecture notes for ${scan.projectName} from actual project structure.`,
    trigger: (_scan, cadence) => ({
      type: "architecture_context",
      cadence,
      sources: ["project tree", "entrypoints", "configuration files"]
    }),
    contextSources: ["README.md", "src/**", "app/**", "docs/**"],
    actions: [
      "Identify entry points, major modules, and external integrations from source evidence.",
      "Separate confirmed facts from inferences and open questions."
    ],
    verification: (scan) => pickCommands(scan, ["build", "test"])
  },
  {
    id: "onboarding-guide",
    title: "Onboarding guide",
    summary: "Create a practical first-week guide for technical contributors.",
    category: "knowledge",
    audience: ["developer", "qa", "solutions"],
    difficulty: "intro",
    expectedOutcome: "A contributor guide with setup, first checks, and safe starter tasks.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Create a practical onboarding guide for technical contributors joining ${scan.projectName}.`,
    trigger: (_scan, cadence) => ({
      type: "onboarding_context",
      cadence,
      sources: ["README.md", "scripts", "tests", "project conventions"]
    }),
    contextSources: ["README.md", "CONTRIBUTING.md", "package manifest", "tests/**"],
    actions: [
      "List setup and verification commands only when they are inferred or confirmed.",
      "Include starter tasks that are low-risk and easy to validate."
    ],
    verification: (scan) => pickCommands(scan, ["test", "build"])
  },
  {
    id: "decision-record-capture",
    title: "Decision record capture",
    summary: "Capture an engineering decision with context, options, and consequences.",
    category: "knowledge",
    audience: ["developer", "product", "ops"],
    difficulty: "standard",
    expectedOutcome: "A decision record that separates context, tradeoffs, decision, and follow-ups.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Capture an engineering decision for ${scan.projectName} with clear tradeoffs and follow-up actions.`,
    trigger: (_scan, cadence) => ({
      type: "decision_record",
      cadence,
      sources: ["proposal notes", "PR discussion", "architecture context"]
    }),
    contextSources: ["docs/adr/**", "README.md", "PR discussion"],
    actions: [
      "Summarize the decision context and rejected options before writing the outcome.",
      "Record consequences, owners, and review date when they are known."
    ],
    verification: (scan) => pickCommands(scan, ["build", "test"])
  },
  {
    id: "requirements-clarification",
    title: "Requirements clarification",
    summary: "Turn an ambiguous request into testable technical acceptance criteria.",
    category: "cross-functional",
    audience: ["product", "developer", "qa", "solutions"],
    difficulty: "intro",
    expectedOutcome: "A clarified requirement with assumptions, open questions, and acceptance criteria.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Clarify an ambiguous requirement for ${scan.projectName} into testable implementation criteria.`,
    trigger: (_scan, cadence) => ({
      type: "requirements_clarification",
      cadence,
      sources: ["ticket", "user report", "product brief"]
    }),
    contextSources: ["README.md", "issue or ticket", "related source areas"],
    actions: [
      "Restate the user goal, affected audience, and measurable success criteria.",
      "List assumptions and blockers separately so implementation does not depend on guesses."
    ],
    verification: (scan) => pickCommands(scan, ["test", "build"])
  },
  {
    id: "qa-acceptance-checklist",
    title: "QA acceptance checklist",
    summary: "Generate a QA checklist from the change intent and project behavior.",
    category: "cross-functional",
    audience: ["qa", "product", "developer"],
    difficulty: "intro",
    expectedOutcome: "A scenario-based checklist covering happy path, edge cases, and regressions.",
    demoAvailable: true,
    recommendedForDemo: true,
    recommended: true,
    goal: (scan) => `Create a QA acceptance checklist for a change in ${scan.projectName}.`,
    trigger: (_scan, cadence) => ({
      type: "qa_acceptance",
      cadence,
      sources: ["ticket", "PR diff", "known user flows"]
    }),
    contextSources: ["README.md", "tests/**", "PR diff", "user flows"],
    actions: [
      "Map the change to user-visible scenarios before listing checks.",
      "Include edge cases, regression checks, and evidence expected for sign-off."
    ],
    verification: (scan) => pickCommands(scan, ["test"])
  },
  {
    id: "data-processing-check",
    title: "Data processing check",
    summary: "Review a data transformation for inputs, outputs, and validation gaps.",
    category: "cross-functional",
    audience: ["data", "developer", "qa"],
    difficulty: "standard",
    expectedOutcome: "A data-flow check with input assumptions, validation gaps, and verification notes.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Check a data processing flow in ${scan.projectName} for input assumptions and validation gaps.`,
    trigger: (_scan, cadence) => ({
      type: "data_processing_review",
      cadence,
      sources: ["data contract", "pipeline code", "sample input"]
    }),
    contextSources: ["data docs", "scripts/**", "src/**", "tests/**"],
    actions: [
      "Identify inputs, transformations, outputs, and validation points before editing.",
      "Record sample data limitations and avoid reading sensitive production data."
    ],
    verification: (scan) => pickCommands(scan, ["test", "build"])
  },
  {
    id: "customer-issue-retro",
    title: "Customer issue retro",
    summary: "Turn a customer issue into root cause, fix evidence, and prevention notes.",
    category: "cross-functional",
    audience: ["solutions", "product", "developer", "qa"],
    difficulty: "standard",
    expectedOutcome: "A customer-ready retro with root cause, verification evidence, and prevention steps.",
    demoAvailable: true,
    recommendedForDemo: false,
    recommended: false,
    goal: (scan) => `Analyze a customer issue for ${scan.projectName} and capture fix evidence plus prevention notes.`,
    trigger: (_scan, cadence) => ({
      type: "customer_issue_retro",
      cadence,
      sources: ["customer report", "support notes", "related logs"]
    }),
    contextSources: ["customer report", "support notes", "related source files", "tests/**"],
    actions: [
      "Separate observed symptoms, confirmed root cause, fix evidence, and follow-up prevention.",
      "Keep customer-facing language factual and avoid exposing internal secrets."
    ],
    verification: (scan) => pickCommands(scan, ["test", "build"])
  }
];

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = TEMPLATE_RECIPES.map(publicTemplateDefinition);

const TEMPLATE_BY_ID = new Map(TEMPLATE_RECIPES.map((template) => [template.id, template]));

export function getTemplateDefinition(id: LoopTemplateId): TemplateDefinition | undefined {
  const recipe = TEMPLATE_BY_ID.get(id);
  return recipe ? publicTemplateDefinition(recipe) : undefined;
}

export function templateIds(): LoopTemplateId[] {
  return TEMPLATE_RECIPES.map((template) => template.id);
}

export function createLoopSpec(id: LoopTemplateId, scan: ProjectScan, answers: WizardAnswers): LoopSpec {
  const recipe = TEMPLATE_BY_ID.get(id);
  if (!recipe) {
    throw new Error(`Unknown template: ${id}`);
  }

  const verificationCommands = recipe.verification(scan);
  const requiresHumanCommandDefinition = verificationCommands.length === 0;
  const commands = requiresHumanCommandDefinition
    ? ["echo \"TODO: configure a real verification command before running this loop\""]
    : verificationCommands;

  return {
    id,
    title: recipe.title,
    category: recipe.category,
    audience: recipe.audience,
    difficulty: recipe.difficulty,
    expectedOutcome: recipe.expectedOutcome,
    goal: recipe.goal(scan),
    trigger: recipe.trigger(scan, answers.triggerCadence),
    contextSources: contextFor(recipe, scan),
    actions: [...recipe.actions, ...SHARED_ACTIONS],
    verification: {
      commands,
      acceptanceCriteria: answers.acceptanceCriteria,
      makerChecker: true,
      requiresHumanCommandDefinition
    },
    stopCriteria: {
      maxIterations: answers.maxIterations,
      timeoutMinutes: recipe.timeoutMinutes ?? 45,
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
      allowNetwork: recipe.allowNetwork ?? false,
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
    selectedTemplates: templateIds(),
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

function publicTemplateDefinition(template: TemplateRecipe): TemplateDefinition {
  return {
    id: template.id,
    title: template.title,
    summary: template.summary,
    category: template.category,
    audience: template.audience,
    difficulty: template.difficulty,
    expectedOutcome: template.expectedOutcome,
    demoAvailable: template.demoAvailable,
    recommendedForDemo: template.recommendedForDemo,
    recommended: template.recommended
  };
}

function definedOverrides(overrides: Partial<WizardAnswers>): Partial<WizardAnswers> {
  return Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as Partial<WizardAnswers>;
}

function contextFor(recipe: TemplateRecipe, scan: ProjectScan) {
  return [...new Set([...scan.contextSources, ...recipe.contextSources])];
}

function pickCommands(scan: ProjectScan, keys: CommandKey[]) {
  const commands = new Set<string>();
  for (const key of keys) {
    const command = scan.commands[key];
    if (command) commands.add(command);
  }
  return [...commands];
}
