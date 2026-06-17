import { applyActions, type ApplyBudget } from "./apply-actions.js";
import { runVerification } from "./verify.js";
import type {
  BlockedAction,
  ChatMessage,
  DrivenAction,
  DrivenStopReason,
  IterationLog,
  LoopSpec,
  ModelClient,
  ModelTurn,
  VerificationResult
} from "./types.js";

export interface DrivenLoopOptions {
  projectRoot: string;
  loop: LoopSpec;
  modelClient: ModelClient;
  maxIterations: number;
  timeoutMs: number; // per-command timeout
  deadline: number; // wall-clock epoch ms
  dryRun?: boolean;
}

export interface DrivenLoopResult {
  passed: boolean;
  stopReason: DrivenStopReason;
  iterations: IterationLog[];
  lastVerification?: VerificationResult;
}

interface Feedback {
  verification?: VerificationResult;
  blocked: BlockedAction[];
  parseError?: string;
}

export async function runDrivenLoop(options: DrivenLoopOptions): Promise<DrivenLoopResult> {
  const { projectRoot, loop, modelClient, timeoutMs, deadline } = options;
  const system = buildSystemPrompt();
  const budget: ApplyBudget = { filesWritten: 0, bytesWritten: 0 };
  const logs: IterationLog[] = [];
  let lastVerification: VerificationResult | undefined;
  let prevSignature: string | undefined;
  let feedback: Feedback = { blocked: [] };

  const iterCap = options.dryRun ? 1 : Math.max(options.maxIterations, 1);

  for (let iteration = 1; iteration <= iterCap; iteration += 1) {
    if (Date.now() > deadline) {
      return { passed: false, stopReason: "timeout", iterations: logs, lastVerification };
    }

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: buildUserPrompt(loop, iteration, feedback) }
    ];
    const raw = await modelClient.chat(messages);
    const log: IterationLog = { iteration, reasoning: "", applied: [], blocked: [] };

    const parsed = parseModelTurn(raw);
    if (!parsed.ok) {
      log.parseError = parsed.reason;
      logs.push(log);
      feedback = { blocked: [], parseError: parsed.reason };
      lastVerification = undefined;
      continue;
    }

    const turn = parsed.turn;
    log.reasoning = turn.reasoning;
    const hasFinish = turn.actions.some((action) => action.type === "finish");

    const batch = await applyActions(projectRoot, turn.actions, loop, budget, { timeoutMs, dryRun: options.dryRun });
    log.applied = batch.applied;
    log.blocked = batch.blocked;

    if (options.dryRun) {
      logs.push(log);
      return { passed: false, stopReason: "finish", iterations: logs, lastVerification };
    }

    const verification = await runVerification(loop.verification.commands, {
      cwd: projectRoot,
      timeoutMs,
      allowedCommands: loop.permissions.allowedCommands
    });
    log.verification = verification;
    logs.push(log);
    lastVerification = verification;
    feedback = { verification, blocked: batch.blocked };

    if (verification.passed) {
      return { passed: true, stopReason: "verified", iterations: logs, lastVerification };
    }
    if (hasFinish) {
      return { passed: verification.passed, stopReason: "finish", iterations: logs, lastVerification };
    }
    const signature = JSON.stringify({ actions: turn.actions, codes: verification.results.map((result) => result.exitCode) });
    if (signature === prevSignature) {
      return { passed: false, stopReason: "repeated-failure", iterations: logs, lastVerification };
    }
    prevSignature = signature;
  }

  return { passed: lastVerification?.passed ?? false, stopReason: "max-iterations", iterations: logs, lastVerification };
}

export function parseModelTurn(raw: string): { ok: true; turn: ModelTurn } | { ok: false; reason: string } {
  const candidates = [raw, stripFences(raw), extractBraced(raw)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const turn = coerceTurn(JSON.parse(candidate));
      if (turn) return { ok: true, turn };
    } catch {
      // try the next candidate
    }
  }
  return { ok: false, reason: "Response was not valid JSON with an actions array." };
}

function coerceTurn(value: unknown): ModelTurn | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.actions)) return null;
  const actions: DrivenAction[] = [];
  for (const raw of object.actions) {
    const action = coerceAction(raw);
    if (action) actions.push(action);
  }
  return { reasoning: typeof object.reasoning === "string" ? object.reasoning : "", actions };
}

function coerceAction(value: unknown): DrivenAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Record<string, unknown>;
  if (action.type === "write_file" && typeof action.path === "string" && typeof action.content === "string") {
    return { type: "write_file", path: action.path, content: action.content };
  }
  if (action.type === "delete_file" && typeof action.path === "string") {
    return { type: "delete_file", path: action.path };
  }
  if (action.type === "run_command" && typeof action.command === "string") {
    return { type: "run_command", command: action.command };
  }
  if (action.type === "finish") {
    return { type: "finish", summary: typeof action.summary === "string" ? action.summary : "" };
  }
  return null;
}

function stripFences(raw: string): string | undefined {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : undefined;
}

function extractBraced(raw: string): string | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  return raw.slice(start, end + 1);
}

function buildSystemPrompt(): string {
  return `You are loopgen's bounded maker. You work on a software repository through a strict protocol.

Reply with ONLY a single JSON object, no prose outside it:
{
  "reasoning": "one short sentence",
  "actions": [
    { "type": "write_file", "path": "relative/path.ext", "content": "full new file contents" },
    { "type": "delete_file", "path": "relative/path.ext" },
    { "type": "run_command", "command": "an allowed command" },
    { "type": "finish", "summary": "why you are done" }
  ]
}

Hard rules:
- Paths must be RELATIVE and inside the repository. Never use absolute paths or "..".
- Never write to forbidden paths. Only run commands from the allowed list.
- write_file replaces the entire file with "content". Make the smallest change that satisfies the goal.
- Emit a "finish" action when verification should pass or you cannot make progress.`;
}

function buildUserPrompt(loop: LoopSpec, iteration: number, feedback: Feedback): string {
  const lines: string[] = [];
  lines.push(`Iteration ${iteration}.`);
  lines.push(`\nGoal:\n${loop.goal}`);
  lines.push(`\nAcceptance criteria: ${loop.verification.acceptanceCriteria}`);
  if (loop.contextSources.length) lines.push(`\nContext sources:\n${loop.contextSources.map((source) => `- ${source}`).join("\n")}`);
  lines.push(`\nVerification commands (these define success):\n${loop.verification.commands.map((command) => `- ${command}`).join("\n") || "- (none)"}`);
  lines.push(`\nForbidden paths (writes here are BLOCKED): ${loop.permissions.forbiddenPaths.join(", ") || "(none)"}`);
  lines.push(`Allowed commands: ${loop.permissions.allowedCommands.join(", ") || "(none — do not use run_command)"}`);

  if (feedback.parseError) {
    lines.push(`\nYour previous response was invalid (${feedback.parseError}). Reply with ONLY the JSON object.`);
  }
  if (feedback.verification) {
    const failed = feedback.verification.results.filter((result) => result.exitCode !== 0 || result.timedOut);
    lines.push(`\nPrevious verification: ${feedback.verification.passed ? "PASSED" : "FAILED"}.`);
    for (const result of failed) {
      lines.push(`Command \`${result.command}\` exited ${result.timedOut ? "TIMEOUT" : result.exitCode}:\n${truncate(result.stdoutExcerpt || result.stderrExcerpt, 1500)}`);
    }
  }
  if (feedback.blocked.length) {
    lines.push(`\nBlocked last turn (do not retry): ${feedback.blocked.map((block) => `${block.type} ${block.target} (${block.reason})`).join("; ")}`);
  }
  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
