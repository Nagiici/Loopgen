# Codex automation prompt: CI failure repair

Project: loopgen
Loop id: ci-failure-repair
Skill: loopgen-ci-failure-repair
State file: .loopgen/state/ci-failure-repair.md

Goal:
Restore failing CI jobs for loopgen with the smallest safe code or configuration change.

Trigger:
- Type: ci_failure
- Cadence: manual
- Sources: manual CI failure URL or log

Instructions:
1. Start from a clean branch or isolated worktree.
2. Read the state file and required context.
3. Perform one small maker iteration.
4. Run verification commands.
5. Use the checker agent instructions in `.codex/agents/loopgen-ci-failure-repair-checker.toml` before declaring success.
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
