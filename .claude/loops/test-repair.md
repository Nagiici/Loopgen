# Claude Code loop guide: Test repair

Project: loopgen
Loop id: test-repair

Use the `loopgen-test-repair` skill. Keep maker and checker work separate:

1. Maker reads context, edits, and runs verification.
2. Checker reviews the diff, command output, and state entry.
3. Maker only continues when checker feedback is actionable and within the iteration limit.

Allowed commands:
- npm ci
- npm run test
- npm run build

Forbidden paths:
- .env
- .env.*
- secrets/**
- production/**
- **/*prod*secret*
- **/*credential*

PR creation: not allowed by this loop
