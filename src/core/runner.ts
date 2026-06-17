import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDrivenLoop } from "./agent-loop.js";
import { appendAuditEntry, hashEntry, readAuditLog } from "./audit.js";
import { checkForbiddenPaths } from "./forbidden.js";
import * as git from "./git.js";
import { loadLoopFile, selectLoop } from "./loop-file.js";
import { createModelClient } from "./model-client.js";
import { resolveModelConfig } from "./model-config.js";
import { renderProofReport } from "./report.js";
import { runVerification } from "./verify.js";
import type {
  AuditEntry,
  AuditEntryInput,
  ForbiddenPathResult,
  IterationLog,
  IterationSummary,
  LoopFile,
  LoopSpec,
  RunOptions,
  RunResult,
  VerificationResult
} from "./types.js";

export async function runLoop(options: RunOptions): Promise<RunResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const mode = options.mode ?? "referee";

  if (!(await git.isGitRepo(projectRoot))) {
    throw new Error("loopgen run requires a git repository — it diffs the working tree against a base ref.");
  }

  const loopFile = await loadLoopFile(projectRoot, options.loopsFile);
  const loop = selectLoop(loopFile, options.loopId);

  return mode === "driven"
    ? runDriven(projectRoot, loop, loopFile, options)
    : runReferee(projectRoot, loop, loopFile, options);
}

async function runReferee(projectRoot: string, loop: LoopSpec, loopFile: LoopFile, options: RunOptions): Promise<RunResult> {
  const base = options.base ?? "HEAD";
  const shaBefore = await git.headSha(projectRoot, base);
  const clean = await git.isClean(projectRoot);
  const changed = await git.changedFiles(projectRoot, base);
  const diffstat = await git.diffStat(projectRoot, base);
  const shaAfter = await git.headSha(projectRoot, "HEAD");

  const allChanged = [...changed.tracked, ...changed.untracked];
  const forbidden = checkForbiddenPaths(allChanged, loop.permissions.forbiddenPaths);
  const timeoutMs = commandTimeoutMs(loop);
  const verification = await runVerification(loop.verification.commands, {
    cwd: projectRoot,
    timeoutMs,
    allowedCommands: loop.permissions.allowedCommands
  });
  const passed = verification.passed && forbidden.ok;

  const input = baseEntry(loopFile, loop, "referee", { base, shaBefore, shaAfter, clean }, changed, diffstat, forbidden, verification, 1, passed);
  return finalize(projectRoot, loop, input, verification, forbidden, options);
}

async function runDriven(projectRoot: string, loop: LoopSpec, loopFile: LoopFile, options: RunOptions): Promise<RunResult> {
  if (!options.dryRun && !options.allowDirty) {
    const dirty = await git.dirtyPathsOutsideLoopgen(projectRoot);
    if (dirty.length) {
      throw new Error("Working tree is dirty. Driven mode edits files — commit/stash first, or pass --allow-dirty.");
    }
  }

  const modelClient = options.modelClient ?? createModelClient(await resolveModelConfig(projectRoot, options));
  const modelMeta = options.modelClient
    ? { adapter: "injected", modelName: "injected", baseUrl: "test" }
    : await modelMetaFromConfig(projectRoot, options);

  const base = options.base ?? "HEAD";
  const shaBefore = await git.headSha(projectRoot, base);
  const clean = await git.isClean(projectRoot);
  const timeoutMs = commandTimeoutMs(loop);
  const maxIterations = options.maxIterations ?? loop.stopCriteria.maxIterations;

  const driven = await runDrivenLoop({
    projectRoot,
    loop,
    modelClient,
    maxIterations,
    timeoutMs,
    deadline: Date.now() + timeoutMs,
    dryRun: options.dryRun
  });

  const changed = await git.changedFiles(projectRoot, base);
  const diffstat = await git.diffStat(projectRoot, base);
  const shaAfter = await git.headSha(projectRoot, "HEAD");
  const forbidden = checkForbiddenPaths([...changed.tracked, ...changed.untracked], loop.permissions.forbiddenPaths);
  const verification = driven.lastVerification ?? { passed: false, results: [], warnings: [] };
  const passed = driven.passed && forbidden.ok;

  const input = baseEntry(
    loopFile,
    loop,
    "driven",
    { base, shaBefore, shaAfter, clean },
    changed,
    diffstat,
    forbidden,
    verification,
    driven.iterations.length,
    passed
  );
  input.driven = { stopReason: driven.stopReason, model: modelMeta, attempts: summarizeIterations(driven.iterations) };

  return finalize(projectRoot, loop, input, verification, forbidden, options, driven.iterations);
}

function baseEntry(
  loopFile: LoopFile,
  loop: LoopSpec,
  mode: "referee" | "driven",
  gitInfo: { base: string; shaBefore: string | null; shaAfter: string | null; clean: boolean },
  changed: git.ChangedFiles,
  diffstat: string,
  forbidden: ForbiddenPathResult,
  verification: VerificationResult,
  iterations: number,
  passed: boolean
): AuditEntryInput {
  return {
    schemaVersion: "1",
    entryId: randomUUID(),
    timestamp: new Date().toISOString(),
    project: loopFile.project,
    loopId: loop.id,
    mode,
    actor: { user: safe(() => os.userInfo().username), host: safe(() => os.hostname()) },
    git: gitInfo,
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
    iterations,
    passed
  };
}

async function finalize(
  projectRoot: string,
  loop: LoopSpec,
  input: AuditEntryInput,
  verification: VerificationResult,
  forbidden: ForbiddenPathResult,
  options: RunOptions,
  iterationLogs?: IterationLog[]
): Promise<RunResult> {
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
    await fs.writeFile(absolute, renderProofReport(loop, entry, verification, iterationLogs), "utf8");
  }

  if (!options.dryRun) {
    await appendStateEntry(projectRoot, loop, entry);
  }

  return {
    loop,
    passed: entry.passed,
    entry,
    verification,
    forbidden,
    reportPath,
    dryRun: Boolean(options.dryRun),
    iterationLogs
  };
}

function summarizeIterations(logs: IterationLog[]): IterationSummary[] {
  return logs.map((log) => ({
    iteration: log.iteration,
    actions: {
      write: log.applied.filter((action) => action.type === "write_file").length,
      delete: log.applied.filter((action) => action.type === "delete_file").length,
      run: log.applied.filter((action) => action.type === "run_command").length,
      finish: 0
    },
    blocked: log.blocked.map((block) => ({ type: block.type, reason: block.reason, pattern: block.pattern })),
    verificationPassed: log.verification?.passed ?? false,
    parseError: log.parseError
  }));
}

async function modelMetaFromConfig(projectRoot: string, options: RunOptions): Promise<{ adapter: string; modelName: string; baseUrl: string }> {
  const config = await resolveModelConfig(projectRoot, options);
  return { adapter: config.adapterId, modelName: config.model, baseUrl: config.baseUrl };
}

function commandTimeoutMs(loop: LoopSpec): number {
  return Math.max(loop.stopCriteria.timeoutMinutes || 1, 1) * 60_000;
}

async function appendStateEntry(projectRoot: string, loop: LoopSpec, entry: AuditEntry): Promise<void> {
  const stateFile = loop.stateFile || path.join(".loopgen", "state", `${loop.id}.md`);
  const absolute = path.join(projectRoot, stateFile);
  const passedCount = entry.verification.commands.filter((command) => command.exitCode === 0 && !command.timedOut).length;
  const line = `- ${entry.timestamp} — ${entry.passed ? "PASS" : "FAIL"} — ${entry.mode} — iter ${entry.iterations} — verification ${passedCount}/${entry.verification.commands.length} — forbidden ${entry.forbidden.ok ? "ok" : `${entry.forbidden.violations.length} violation(s)`} — audit ${entry.entryId}`;

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
