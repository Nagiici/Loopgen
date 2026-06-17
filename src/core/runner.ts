import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendAuditEntry, hashEntry, readAuditLog } from "./audit.js";
import { checkForbiddenPaths } from "./forbidden.js";
import * as git from "./git.js";
import { loadLoopFile, selectLoop } from "./loop-file.js";
import { renderProofReport } from "./report.js";
import { runVerification } from "./verify.js";
import type { AuditEntry, AuditEntryInput, LoopSpec, RunOptions, RunResult } from "./types.js";

export async function runLoop(options: RunOptions): Promise<RunResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const mode = options.mode ?? "referee";
  if (mode === "driven") {
    throw new Error("Driven mode is not implemented yet (v2). Use --mode referee.");
  }

  if (!(await git.isGitRepo(projectRoot))) {
    throw new Error("loopgen run requires a git repository — referee mode diffs the working tree against a base ref.");
  }

  const loopFile = await loadLoopFile(projectRoot, options.loopsFile);
  const loop = selectLoop(loopFile, options.loopId);
  const base = options.base ?? "HEAD";

  const shaBefore = await git.headSha(projectRoot, base);
  const clean = await git.isClean(projectRoot);
  const changed = await git.changedFiles(projectRoot, base);
  const diffstat = await git.diffStat(projectRoot, base);
  const shaAfter = await git.headSha(projectRoot, "HEAD");

  const allChanged = [...changed.tracked, ...changed.untracked];
  const forbidden = checkForbiddenPaths(allChanged, loop.permissions.forbiddenPaths);

  const timeoutMs = Math.max(loop.stopCriteria.timeoutMinutes || 1, 1) * 60_000;
  const verification = await runVerification(loop.verification.commands, {
    cwd: projectRoot,
    timeoutMs,
    allowedCommands: loop.permissions.allowedCommands
  });

  const passed = verification.passed && forbidden.ok;

  const input: AuditEntryInput = {
    schemaVersion: "1",
    entryId: randomUUID(),
    timestamp: new Date().toISOString(),
    project: loopFile.project,
    loopId: loop.id,
    mode,
    actor: { user: safe(() => os.userInfo().username), host: safe(() => os.hostname()) },
    git: { base, shaBefore, shaAfter, clean },
    changedFiles: { tracked: changed.tracked, untracked: changed.untracked, diffstat },
    forbidden: { ok: forbidden.ok, violations: forbidden.violations },
    verification: {
      passed: verification.passed,
      commands: verification.results.map((result) => ({
        command: result.command,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs
      }))
    },
    iterations: 1,
    passed
  };

  let entry: AuditEntry;
  if (options.dryRun) {
    const existing = await readAuditLog(projectRoot);
    const prevHash = existing.length ? existing[existing.length - 1].hash : null;
    entry = { ...input, prevHash, hash: hashEntry(input, prevHash) };
  } else {
    entry = await appendAuditEntry(projectRoot, input);
  }

  let reportPath: string | undefined;
  if (!options.dryRun && options.writeReport !== false) {
    const stamp = entry.timestamp.replace(/[:.]/g, "-");
    reportPath = path.join(".loopgen", "reports", `${loop.id}-${stamp}.md`);
    const absolute = path.join(projectRoot, reportPath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, renderProofReport(loop, entry, verification), "utf8");
  }

  if (!options.dryRun) {
    await appendStateEntry(projectRoot, loop, entry);
  }

  return { loop, passed, entry, verification, forbidden, reportPath, dryRun: Boolean(options.dryRun) };
}

async function appendStateEntry(projectRoot: string, loop: LoopSpec, entry: AuditEntry): Promise<void> {
  const stateFile = loop.stateFile || path.join(".loopgen", "state", `${loop.id}.md`);
  const absolute = path.join(projectRoot, stateFile);
  const passedCount = entry.verification.commands.filter((command) => command.exitCode === 0 && !command.timedOut).length;
  const line = `- ${entry.timestamp} — ${entry.passed ? "PASS" : "FAIL"} — iter ${entry.iterations} — verification ${passedCount}/${entry.verification.commands.length} — forbidden ${entry.forbidden.ok ? "ok" : `${entry.forbidden.violations.length} violation(s)`} — audit ${entry.entryId}`;

  const existing = await fs.readFile(absolute, "utf8").catch(() => undefined);
  let next: string;
  if (existing && existing.includes("- No attempts yet.")) {
    next = existing.replace("- No attempts yet.", line);
  } else if (existing) {
    next = `${existing.trimEnd()}\n${line}\n`;
  } else {
    next = `# ${loop.title} state\n\nLoop id: ${loop.id}\n\n## Attempts\n\n${line}\n`;
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, next, "utf8");
}

function safe(getter: () => string): string | undefined {
  try {
    return getter();
  } catch {
    return undefined;
  }
}
