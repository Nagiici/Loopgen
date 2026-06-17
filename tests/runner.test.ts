import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { readAuditLog, verifyAuditChain } from "../src/core/audit.js";
import { runLoop } from "../src/core/runner.js";
import type { ModelClient } from "../src/core/types.js";

function fakeModel(responses: string[]): ModelClient {
  let index = 0;
  return { chat: async () => responses[Math.min(index++, responses.length - 1)] };
}
const writeThenFinish = (file: string, content = "ok") =>
  JSON.stringify({ reasoning: "fix it", actions: [{ type: "write_file", path: file, content }, { type: "finish", summary: "done" }] });

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function gitRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-run-"));
  roots.push(root);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "t@t.dev"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "loopgen test"], { cwd: root });
  await fs.writeFile(path.join(root, "README.md"), "# base\n");
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-q", "-m", "base"], { cwd: root });
  return root;
}

function loopYaml(commands: string[], forbiddenPaths: string[] = [".env", ".env.*", "secrets/**"]): string {
  return stringify({
    version: "0.1",
    project: "demo",
    loops: [
      {
        id: "test-repair",
        title: "Test repair",
        category: "maintenance",
        audience: ["developer"],
        difficulty: "intro",
        expectedOutcome: "ok",
        goal: "verify the change",
        trigger: { type: "manual", cadence: "manual", sources: [] },
        contextSources: [],
        actions: [],
        verification: { commands, acceptanceCriteria: "tests pass", makerChecker: true, requiresHumanCommandDefinition: false },
        stopCriteria: { maxIterations: 3, timeoutMinutes: 1, requireHumanInputOn: [] },
        stateFile: ".loopgen/state/test-repair.md",
        permissions: { allowedCommands: [], forbiddenPaths, allowNetwork: false, allowPrCreation: false },
        adapters: ["agents-md"]
      }
    ]
  });
}

async function writeLoopFile(root: string, yaml: string): Promise<void> {
  await fs.mkdir(path.join(root, ".loopgen"), { recursive: true });
  await fs.writeFile(path.join(root, ".loopgen", "loopgen.loop.yaml"), yaml);
}

describe("runLoop (referee mode)", () => {
  test("passing verification → pass; writes audit, report, and state", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml(['node -e "process.exit(0)"']));
    await fs.writeFile(path.join(root, "change.txt"), "edited\n");
    const result = await runLoop({ projectRoot: root });
    expect(result.passed).toBe(true);
    expect(result.reportPath).toBeDefined();

    const audit = await readAuditLog(root);
    expect(audit).toHaveLength(1);
    expect(verifyAuditChain(audit).valid).toBe(true);

    const reportPath = path.join(root, result.reportPath!);
    expect((await fs.readFile(reportPath, "utf8")).length).toBeGreaterThan(0);

    const state = await fs.readFile(path.join(root, ".loopgen/state/test-repair.md"), "utf8");
    expect(state).toContain("PASS");
    expect(state).not.toContain("No attempts yet");
  });

  test("failing verification → fail", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml(['node -e "process.exit(1)"']));
    const result = await runLoop({ projectRoot: root });
    expect(result.passed).toBe(false);
    expect(result.verification.passed).toBe(false);
  });

  test("forbidden-path change fails even when verification passes", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml(['node -e "process.exit(0)"']));
    await fs.writeFile(path.join(root, ".env"), "SECRET=1\n");
    const result = await runLoop({ projectRoot: root });
    expect(result.verification.passed).toBe(true);
    expect(result.forbidden.ok).toBe(false);
    expect(result.passed).toBe(false);
  });

  test("--dry-run writes no audit log", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml(['node -e "process.exit(0)"']));
    await runLoop({ projectRoot: root, dryRun: true });
    await expect(fs.access(path.join(root, ".loopgen/audit.jsonl"))).rejects.toThrow();
  });

  test("audit hash chain spans multiple runs", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml(['node -e "process.exit(0)"']));
    await runLoop({ projectRoot: root });
    await runLoop({ projectRoot: root });
    const audit = await readAuditLog(root);
    expect(audit).toHaveLength(2);
    expect(verifyAuditChain(audit).valid).toBe(true);
  });

  test("non-git directory throws a clear error", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-nogit-"));
    roots.push(root);
    await writeLoopFile(root, loopYaml(['node -e "process.exit(0)"']));
    await expect(runLoop({ projectRoot: root })).rejects.toThrow(/git repository/);
  });
});

const EXISTS = (file: string) => `node -e "process.exit(require('fs').existsSync('${file}')?0:1)"`;

describe("runLoop (driven mode)", () => {
  test("model writes a file → verification passes → passed, audit appended", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    const result = await runLoop({ projectRoot: root, mode: "driven", modelClient: fakeModel([writeThenFinish("fix.txt")]) });
    expect(result.passed).toBe(true);
    expect(result.entry.mode).toBe("driven");
    expect(["verified", "finish"]).toContain(result.entry.driven?.stopReason);
    expect(result.entry.iterations).toBe(1);
    const audit = await readAuditLog(root);
    expect(audit).toHaveLength(1);
    expect(verifyAuditChain(audit).valid).toBe(true);
  });

  test("model proposes a forbidden .env write → blocked, file absent", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    const env = JSON.stringify({ reasoning: "sneak", actions: [{ type: "write_file", path: ".env", content: "SECRET=1" }] });
    const result = await runLoop({ projectRoot: root, mode: "driven", maxIterations: 2, modelClient: fakeModel([env, env]) });
    expect(result.passed).toBe(false);
    await expect(fs.access(path.join(root, ".env"))).rejects.toThrow();
    const blocked = result.entry.driven?.attempts.flatMap((attempt) => attempt.blocked) ?? [];
    expect(blocked.some((block) => block.reason === "forbidden-path")).toBe(true);
  });

  test("never fixes → stops at max iterations", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    const responses = [writeThenNoFinish("a.txt"), writeThenNoFinish("b.txt"), writeThenNoFinish("c.txt")];
    const result = await runLoop({ projectRoot: root, mode: "driven", maxIterations: 3, modelClient: fakeModel(responses) });
    expect(result.passed).toBe(false);
    expect(result.entry.iterations).toBe(3);
    expect(result.entry.driven?.stopReason).toBe("max-iterations");
  });

  test("repeated identical failure stops early", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    const same = writeThenNoFinish("same.txt");
    const result = await runLoop({ projectRoot: root, mode: "driven", maxIterations: 5, modelClient: fakeModel([same, same, same]) });
    expect(result.entry.driven?.stopReason).toBe("repeated-failure");
    expect(result.entry.iterations).toBe(2);
  });

  test("malformed JSON burns an iteration then recovers", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    const result = await runLoop({
      projectRoot: root,
      mode: "driven",
      maxIterations: 3,
      modelClient: fakeModel(["not json at all", writeThenFinish("fix.txt")])
    });
    expect(result.passed).toBe(true);
    expect(result.entry.iterations).toBe(2);
    expect(result.entry.driven?.attempts[0].parseError).toBeDefined();
  });

  test("--dry-run writes nothing", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    await runLoop({ projectRoot: root, mode: "driven", dryRun: true, modelClient: fakeModel([writeThenFinish("fix.txt")]) });
    await expect(fs.access(path.join(root, "fix.txt"))).rejects.toThrow();
    await expect(fs.access(path.join(root, ".loopgen/audit.jsonl"))).rejects.toThrow();
  });

  test("dirty tree is rejected without --allow-dirty", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml([EXISTS("fix.txt")]));
    await fs.writeFile(path.join(root, "README.md"), "# changed, uncommitted\n");
    await expect(
      runLoop({ projectRoot: root, mode: "driven", modelClient: fakeModel([writeThenFinish("fix.txt")]) })
    ).rejects.toThrow(/dirty/);
  });

  test("referee + driven runs share one valid audit chain", async () => {
    const root = await gitRepo();
    await writeLoopFile(root, loopYaml(['node -e "process.exit(0)"']));
    await runLoop({ projectRoot: root });
    await runLoop({ projectRoot: root, mode: "driven", modelClient: fakeModel([writeThenFinish("fix.txt")]) });
    const audit = await readAuditLog(root);
    expect(audit).toHaveLength(2);
    expect(audit[0].mode).toBe("referee");
    expect(audit[1].mode).toBe("driven");
    expect(verifyAuditChain(audit).valid).toBe(true);
  });
});

function writeThenNoFinish(file: string): string {
  return JSON.stringify({ reasoning: "try", actions: [{ type: "write_file", path: file, content: "noop" }] });
}
