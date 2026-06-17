import { promises as fs } from "node:fs";
import path from "node:path";
import { checkForbiddenPaths } from "./forbidden.js";
import { runVerification } from "./verify.js";
import type { AppliedAction, BlockedAction, CommandRunResult, DrivenAction, LoopSpec } from "./types.js";

export const APPLY_LIMITS = {
  maxFilesPerRun: 50,
  maxBytesPerFile: 512 * 1024,
  maxBytesPerRun: 2 * 1024 * 1024
};

export interface ApplyBudget {
  filesWritten: number;
  bytesWritten: number;
}

export interface AppliedBatch {
  applied: AppliedAction[];
  blocked: BlockedAction[];
  commandResults: CommandRunResult[];
}

export interface ApplyOptions {
  timeoutMs: number;
  dryRun?: boolean;
}

// Validate FIRST, mutate SECOND. Forbidden-path writes, path escapes, non-allowlisted commands, and
// over-budget writes are blocked before anything touches disk — prevention, not just detection.
export async function applyActions(
  projectRoot: string,
  actions: DrivenAction[],
  loop: LoopSpec,
  budget: ApplyBudget,
  options: ApplyOptions
): Promise<AppliedBatch> {
  const root = path.resolve(projectRoot);
  const applied: AppliedAction[] = [];
  const blocked: BlockedAction[] = [];
  const commandResults: CommandRunResult[] = [];

  for (const action of actions) {
    if (action.type === "finish") continue;

    if (action.type === "write_file" || action.type === "delete_file") {
      const rel = toRelative(root, action.path);
      if (rel === null) {
        blocked.push({ type: action.type, target: action.path, reason: "path-escape" });
        continue;
      }
      const forbidden = checkForbiddenPaths([rel], loop.permissions.forbiddenPaths);
      if (!forbidden.ok) {
        blocked.push({ type: action.type, target: rel, reason: "forbidden-path", pattern: forbidden.violations[0].pattern });
        continue;
      }
      if (action.type === "write_file") {
        const bytes = Buffer.byteLength(action.content, "utf8");
        if (
          bytes > APPLY_LIMITS.maxBytesPerFile ||
          budget.filesWritten >= APPLY_LIMITS.maxFilesPerRun ||
          budget.bytesWritten + bytes > APPLY_LIMITS.maxBytesPerRun
        ) {
          blocked.push({ type: action.type, target: rel, reason: "limit-exceeded" });
          continue;
        }
        if (!options.dryRun) {
          const absolute = path.join(root, rel);
          await fs.mkdir(path.dirname(absolute), { recursive: true });
          await fs.writeFile(absolute, action.content, "utf8");
        }
        budget.filesWritten += 1;
        budget.bytesWritten += bytes;
      } else if (!options.dryRun) {
        await fs.rm(path.join(root, rel), { force: true }).catch(() => undefined);
      }
      applied.push({ type: action.type, target: rel });
      continue;
    }

    // run_command — only exact matches of the loop's allowed commands may execute.
    if (!loop.permissions.allowedCommands.includes(action.command)) {
      blocked.push({ type: "run_command", target: action.command, reason: "command-not-allowed" });
      continue;
    }
    if (!options.dryRun) {
      const result = await runVerification([action.command], { cwd: root, timeoutMs: options.timeoutMs });
      commandResults.push(...result.results);
    }
    applied.push({ type: "run_command", target: action.command });
  }

  return { applied, blocked, commandResults };
}

function toRelative(root: string, candidate: string): string | null {
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  if (path.isAbsolute(candidate)) return null;
  if (candidate.split(/[\\/]/).includes("..")) return null;
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return path.relative(root, resolved).replace(/\\/g, "/");
}
