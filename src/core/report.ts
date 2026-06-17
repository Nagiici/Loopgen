import type { AttestationRef, AuditEntry, IterationLog, LoopSpec, VerificationResult } from "./types.js";

export function renderProofReport(
  loop: LoopSpec,
  entry: AuditEntry,
  verification: VerificationResult,
  iterationLogs?: IterationLog[],
  attestation?: AttestationRef
): string {
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
Trust: ${trustLine(entry, attestation)}

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
${entry.driven && iterationLogs ? `\n${renderIterationHistory(iterationLogs)}` : ""}
---

${scopeFooter(entry, attestation)}
`;
}

function renderIterationHistory(iterationLogs: IterationLog[]): string {
  const blocks = iterationLogs.map((log) => {
    const applied = log.applied.length ? log.applied.map((action) => `${action.type} \`${action.target}\``).join(", ") : "(none)";
    const blocked = log.blocked.length
      ? log.blocked.map((block) => `${block.type} \`${block.target}\` — **blocked** (${block.reason}${block.pattern ? ` \`${block.pattern}\`` : ""})`).join("\n  - ")
      : "(none)";
    const verify = log.parseError
      ? `parse error: ${log.parseError}`
      : log.verification
        ? log.verification.passed
          ? "verification passed"
          : "verification failed"
        : "no verification";
    return `### Iteration ${log.iteration}

${log.reasoning ? `> ${log.reasoning}\n` : ""}- Applied: ${applied}
- Blocked: ${blocked}
- ${verify}`;
  });
  return `## Iteration history\n\n${blocks.join("\n\n")}\n`;
}

function scopeFooter(entry: AuditEntry, attestation?: AttestationRef): string {
  if (entry.driven) {
    return `> Scope: **bounded + enforced**. loopgen drove a local model (${entry.driven.model.adapter} · ${entry.driven.model.modelName}), blocked forbidden writes and non-allowlisted commands **at apply time**, bounded iterations, and verified each one (stop reason: ${entry.driven.stopReason}). The model still proposes actions — this is enforcement, not a sandbox.${trustFooter(entry, attestation)}`;
  }
  return `> Scope: this is **detection, not prevention**. loopgen ran the verification commands above and diffed the working tree after the work session; it does not sandbox the agent or block reads.${trustFooter(entry, attestation)}`;
}

// Evidence (local) vs proof (CI-attested) — stated precisely so the report never over-claims.
function isSigned(entry: AuditEntry, attestation?: AttestationRef): boolean {
  return entry.provenance?.tier === "attested" && Boolean(attestation && attestation.method !== "none");
}

function trustLine(entry: AuditEntry, attestation?: AttestationRef): string {
  if (isSigned(entry, attestation)) {
    return "**attested** (CI) — audit hash signed against Sigstore/Rekor; verify with `loopgen audit verify --attestation`";
  }
  if (entry.provenance?.tier === "attested") {
    return "attested (CI) requested, but no signer was available — **local evidence only**";
  }
  return "**local** — tamper-evident evidence (re-run in CI for a verifiable signed attestation)";
}

function trustFooter(entry: AuditEntry, attestation?: AttestationRef): string {
  if (isSigned(entry, attestation)) {
    return ` This run is **CI-attested**: the audit entry hash is signed against the Sigstore/Rekor public transparency log and bound to commit \`${entry.git.shaAfter ?? "(none)"}\` — **verifiable proof** (\`loopgen audit verify --attestation\`).`;
  }
  return ` The audit entry is hash-chained in \`.loopgen/audit.jsonl\` — **tamper-evident local evidence**, not signed proof. Re-run in CI for a verifiable signed attestation.`;
}
