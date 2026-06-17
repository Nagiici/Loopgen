import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { readAuditLog, verifyAuditChain } from "../src/core/audit.js";
import { runLoop } from "../src/core/runner.js";

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
