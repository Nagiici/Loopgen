---
name: loopgen-ci-failure-repair
description: Restore failing CI jobs for loopgen with the smallest safe code or configuration change.
---

# CI failure repair

This skill runs a bounded loop-engineering workflow for loopgen.

## Goal

Restore failing CI jobs for loopgen with the smallest safe code or configuration change.

## Context

- README.md
- package.json

## Steps

1. Collect the failing job name, failing command, and relevant log excerpt.
2. Map the failure to a local verification command before editing.
3. Create or reuse an isolated working branch/worktree before edits.
4. Read the state file first and append a concise attempt log after every iteration.
5. Make the smallest change that can satisfy the goal.
6. Run verification before declaring success.
7. Ask for human input instead of guessing when a stop criterion is met.

## Verify

- `npm run test`
- `npm run build`

Acceptance criteria: All configured verification commands pass and the generated state file explains what changed.

## Stop conditions

- verification command is missing or ambiguous
- changes require production credentials
- more than 20 files would be modified
- the same failure repeats after maxIterations

State file: `.loopgen/state/ci-failure-repair.md`
Maximum iterations: 3

