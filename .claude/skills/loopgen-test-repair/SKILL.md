---
name: loopgen-test-repair
description: Diagnose failing tests in loopgen, fix the underlying issue, and verify the relevant suite.
---

# Test repair

This skill runs a bounded loop-engineering workflow for loopgen.

## Goal

Diagnose failing tests in loopgen, fix the underlying issue, and verify the relevant suite.

## Context

- README.md
- package.json
- tests/**
- **/*.test.*
- **/*.spec.*

## Steps

1. Reproduce the failing test locally when possible.
2. Prefer fixing source behavior over weakening assertions.
3. Create or reuse an isolated working branch/worktree before edits.
4. Read the state file first and append a concise attempt log after every iteration.
5. Make the smallest change that can satisfy the goal.
6. Run verification before declaring success.
7. Ask for human input instead of guessing when a stop criterion is met.

## Verify

- `npm run test`

Acceptance criteria: All configured verification commands pass and the generated state file explains what changed.

## Stop conditions

- verification command is missing or ambiguous
- changes require production credentials
- more than 20 files would be modified
- the same failure repeats after maxIterations

State file: `.loopgen/state/test-repair.md`
Maximum iterations: 3

