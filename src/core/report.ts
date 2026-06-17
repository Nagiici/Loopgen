import type { AuditEntry, LoopSpec, VerificationResult } from "./types.js";

export function renderProofReport(loop: LoopSpec, entry: AuditEntry, verification: VerificationResult): string {
  const banner = entry.passed ? "✅ PASS" : "❌ FAIL";
  const changed = [...entry.changedFiles.tracked, ...entry.changedFiles.untracked];

  const commandBlocks = verification.results
    .map((result) => {
      const status = result.timedOut ? "TIMED OUT" : result.exitCode === 0 ? "pass (exit 0)" : `fail (exit ${result.exitCode})`;
      const out = [result.stdoutExcerpt, result.stderrExcerpt].filter(Boolean).join("\n");
      return `#### \`${result.command}\` — ${status} (${result.durationMs} ms)

\`\`\`
${out || "(no output)"}
\`\`\``;
    })
    .join("\n\n");

  const forbiddenSection = entry.forbidden.ok
    ? "No forbidden paths were changed."
    : entry.forbidden.violations.map((violation) => `- \`${violation.file}\` matched forbidden pattern \`${violation.pattern}\``).join("\n");

  return `# Proof report — ${loop.title} ${banner}

Loop: \`${entry.loopId}\` · Mode: ${entry.mode} · Iterations: ${entry.iterations}
Generated: ${entry.timestamp}
By: ${entry.actor.user ?? "unknown"}@${entry.actor.host ?? "unknown"}
Audit entry: \`${entry.hash}\`

## Goal

${loop.goal}

## Git

- Base: \`${entry.git.base}\`
- Before: \`${entry.git.shaBefore ?? "(no commits)"}\`
- After: \`${entry.git.shaAfter ?? "(no commits)"}\`
- Working tree clean at start: ${entry.git.clean ? "yes" : "no"}

## Files changed (${changed.length})

${changed.length ? changed.map((file) => `- \`${file}\``).join("\n") : "- (none)"}

\`\`\`
${entry.changedFiles.diffstat || "(no diffstat)"}
\`\`\`

## Verification — ${verification.passed ? "passed" : "failed"}

${commandBlocks || "_No verification commands were configured for this loop._"}
${verification.warnings.length ? `\n> Warnings:\n${verification.warnings.map((warning) => `> - ${warning}`).join("\n")}\n` : ""}
## Forbidden paths — ${entry.forbidden.ok ? "clean" : "VIOLATION"}

${forbiddenSection}

---

> Scope: this is **detection, not prevention**. loopgen ran the verification commands above and diffed the
> working tree after the work session; it does not sandbox the agent or block reads. The audit entry is
> hash-chained in \`.loopgen/audit.jsonl\` (tamper-evident against in-place edits).
`;
}
