---
name: loopgen-ci-failure-repair
description: Restore failing CI jobs for loopgen with the smallest safe code or configuration change.
---

# CI failure repair

Use this skill when working on loopgen and the goal is:

Restore failing CI jobs for loopgen with the smallest safe code or configuration change.

## Required context

Read these sources before editing:

- README.md
- package.json

## Loop

1. Collect the failing job name, failing command, and relevant log excerpt.
2. Map the failure to a local verification command before editing.
3. Create or reuse an isolated working branch/worktree before edits.
4. Read the state file first and append a concise attempt log after every iteration.
5. Make the smallest change that can satisfy the goal.
6. Run verification before declaring success.
7. Ask for human input instead of guessing when a stop criterion is met.

## Verification

Run these commands before success:

- `npm run test`
- `npm run build`

Acceptance criteria: All configured verification commands pass and the generated state file explains what changed.

## Safety

- Maximum iterations: 3
- Timeout minutes: 45
- State file: `.loopgen/state/ci-failure-repair.md`
- Do not read or modify: `.env`, `.env.*`, `secrets/**`, `production/**`, `**/*prod*secret*`, `**/*credential*`
- PR creation allowed: no

