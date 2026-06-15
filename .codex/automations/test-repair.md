# Codex automation prompt: Test repair

Project: loopgen
Loop id: test-repair
Skill: loopgen-test-repair
State file: .loopgen/state/test-repair.md

Goal:
Diagnose failing tests in loopgen, fix the underlying issue, and verify the relevant suite.

Trigger:
- Type: test_failure
- Cadence: manual
- Sources: test output, changed files, related test files

Instructions:
1. Start from a clean branch or isolated worktree.
2. Read the state file and required context.
3. Perform one small maker iteration.
4. Run verification commands.
5. Use the checker agent instructions in `.codex/agents/loopgen-test-repair-checker.toml` before declaring success.
6. Append the result, commands run, and remaining risks to the state file.

Allowed commands:
- npm ci
- npm run test
- npm run build

Stop and ask for human input when:
- verification command is missing or ambiguous
- changes require production credentials
- more than 20 files would be modified
- the same failure repeats after maxIterations
