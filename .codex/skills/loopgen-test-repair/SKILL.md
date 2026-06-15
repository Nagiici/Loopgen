---
name: loopgen-test-repair
description: Diagnose failing tests in loopgen, fix the underlying issue, and verify the relevant suite.
---

# Test repair

Use this skill when working on loopgen and the goal is:

Diagnose failing tests in loopgen, fix the underlying issue, and verify the relevant suite.

## Required context

Read these sources before editing:

- README.md
- package.json
- tests/**
- **/*.test.*
- **/*.spec.*

## Loop

1. Reproduce the failing test locally when possible.
2. Prefer fixing source behavior over weakening assertions.
3. Create or reuse an isolated working branch/worktree before edits.
4. Read the state file first and append a concise attempt log after every iteration.
5. Make the smallest change that can satisfy the goal.
6. Run verification before declaring success.
7. Ask for human input instead of guessing when a stop criterion is met.

## Verification

Run these commands before success:

- `npm run test`

Acceptance criteria: All configured verification commands pass and the generated state file explains what changed.

## Safety

- Maximum iterations: 3
- Timeout minutes: 45
- State file: `.loopgen/state/test-repair.md`
- Do not read or modify: `.env`, `.env.*`, `secrets/**`, `production/**`, `**/*prod*secret*`, `**/*credential*`
- PR creation allowed: no

