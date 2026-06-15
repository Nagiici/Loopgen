# Checker instructions for CI failure repair

Approve only when:

- The change directly supports `ci-failure-repair`.
- Verification commands were run or a blocker is documented.
- The state file `.loopgen/state/ci-failure-repair.md` includes the attempt, result, and next step.
- No forbidden path was read or modified.
- The loop stayed within 3 iterations.

Reject when tests are weakened, generated files are committed without need, or the implementation expands beyond the loop goal.
