# Contributing to loopgen

Thanks for helping make loop engineering safer and easier to adopt. The most valuable contribution is
usually a **new template** — a reusable, bounded loop for a real scenario. This guide gets you from
idea to PR in a few minutes.

## Setup

```bash
npm install
npm run build
npm test
```

Useful scripts: `npm run build`, `npm run typecheck`, `npm test`, and `npm run loopgen -- preview --demo`.

## Your first template

Templates live in [`src/core/templates.ts`](src/core/templates.ts) in the `TEMPLATE_RECIPES` array.
A template is explicit, bounded, and verifiable. Copy this recipe (it mirrors the existing
`lint-cleanup` template) and adjust it:

```ts
{
  id: "security-audit",                       // kebab-case, unique
  title: "Security audit",
  summary: "Find and fix low-risk security issues without changing behavior.",
  category: "quality",                        // maintenance | delivery | quality | knowledge | cross-functional
  audience: ["developer", "ops"],             // developer | qa | product | ops | data | solutions
  difficulty: "standard",                     // intro | standard | advanced
  expectedOutcome: "A narrow security fix with verification output and no behavior change.",
  demoAvailable: true,
  recommendedForDemo: false,
  recommended: false,
  goal: (scan) => `Audit ${scan.projectName} for low-risk security issues and fix the smallest one safely.`,
  trigger: (_scan, cadence) => ({
    type: "manual",
    cadence,
    sources: ["dependency advisories", "changed files"]
  }),
  contextSources: ["package manifest", "lockfile", "source files"],
  actions: [
    "Prefer well-understood, low-risk fixes over broad refactors.",
    "Never weaken a test or remove a security check to make the loop pass."
  ],
  verification: (scan) => pickCommands(scan, ["lint", "test", "build"])
}
```

Key rules so generated loops stay safe and inspectable:

- Keep `actions` short and concrete; the loop must make the **smallest** change that satisfies the goal.
- Use `pickCommands(scan, [...])` so verification uses the project's real inferred commands.
- Do not add new forbidden/secret paths per template — the shared `FORBIDDEN_PATHS` already cover them.

## Add a test

Add a case to [`tests/generator.test.ts`](tests/generator.test.ts) asserting your template produces the
expected playbook/state files (and adapter outputs if relevant). Then:

```bash
npm test
```

## Checklist before opening a PR

- [ ] Added the recipe to `TEMPLATE_RECIPES` in `src/core/templates.ts`.
- [ ] Added a test in `tests/generator.test.ts`.
- [ ] `npm run typecheck` and `npm test` pass.
- [ ] Updated the README template list if you added a new category or audience.

## Adding an adapter

Adapters live in `src/adapters/` and are registered in `src/core/adapters.ts` (`ADAPTER_DEFINITIONS`).
The `agents-md`, `cursor`, and `windsurf` adapters are small, self-contained examples to copy —
each renders `GeneratedFile[]` and is wired into `src/core/generator.ts`.

By contributing you agree your work is licensed under the project's [MIT License](LICENSE).
