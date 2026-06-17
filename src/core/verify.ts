import { spawn } from "node:child_process";
import type { CommandRunResult, VerificationResult } from "./types.js";

const EXCERPT_CAP = 64 * 1024;
const KILL_GRACE_MS = 2000;

export interface VerifyOptions {
  cwd: string;
  timeoutMs: number;
  allowedCommands?: string[];
}

export async function runVerification(commands: string[], options: VerifyOptions): Promise<VerificationResult> {
  const results: CommandRunResult[] = [];
  const warnings: string[] = [];
  const allow = options.allowedCommands?.length ? options.allowedCommands : undefined;

  for (const command of commands) {
    if (allow && !allow.includes(command)) {
      warnings.push(`Verification command is not in the loop's allowed commands: ${command}`);
    }
    results.push(await runOne(command, options));
  }

  const passed = results.length > 0 && results.every((result) => result.exitCode === 0 && !result.timedOut);
  return { passed, results, warnings };
}

function runOne(command: string, options: VerifyOptions): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    // detached on POSIX so the shell and its children share a process group we can kill together —
    // otherwise killing the shell leaves grandchildren holding the stdio pipes open and `close` never fires.
    const posix = process.platform !== "win32";
    const child = spawn(command, { cwd: options.cwd, shell: true, detached: posix });
    const killTree = (signal: NodeJS.Signals) => {
      if (child.pid == null) return;
      try {
        if (posix) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // process group already gone
      }
    };
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const capture = (buffer: Buffer, target: "out" | "err") => {
      const text = buffer.toString("utf8");
      if (target === "out") stdout = capExcerpt(stdout + text);
      else stderr = capExcerpt(stderr + text);
    };
    child.stdout?.on("data", (buffer: Buffer) => capture(buffer, "out"));
    child.stderr?.on("data", (buffer: Buffer) => capture(buffer, "err"));

    const timer = setTimeout(() => {
      timedOut = true;
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), KILL_GRACE_MS).unref();
    }, options.timeoutMs);

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: timedOut ? null : exitCode,
        signal: signal ?? null,
        timedOut,
        durationMs: Date.now() - start,
        stdoutExcerpt: stdout.trimEnd(),
        stderrExcerpt: stderr.trimEnd()
      });
    };

    child.on("error", (error) => {
      stderr = capExcerpt(stderr + `\n[spawn error] ${error instanceof Error ? error.message : String(error)}`);
      finish(127, null);
    });
    child.on("close", (code, signal) => finish(code, signal));
  });
}

function capExcerpt(value: string): string {
  if (value.length <= EXCERPT_CAP) return value;
  return value.slice(value.length - EXCERPT_CAP);
}
