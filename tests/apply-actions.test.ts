import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { APPLY_LIMITS, applyActions } from "../src/core/apply-actions.js";
import type { DrivenAction, LoopSpec } from "../src/core/types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-apply-"));
  roots.push(root);
  return root;
}

function loop(forbiddenPaths = [".env", "secrets/**"], allowedCommands: string[] = ['node -e "process.exit(0)"']): LoopSpec {
  return {
    id: "t",
    title: "t",
    category: "maintenance",
    audience: ["developer"],
    difficulty: "intro",
    expectedOutcome: "",
    goal: "",
    trigger: { type: "manual", cadence: "manual", sources: [] },
    contextSources: [],
    actions: [],
    verification: { commands: [], acceptanceCriteria: "", makerChecker: true, requiresHumanCommandDefinition: false },
    stopCriteria: { maxIterations: 3, timeoutMinutes: 1, requireHumanInputOn: [] },
    stateFile: ".loopgen/state/t.md",
    permissions: { allowedCommands, forbiddenPaths, allowNetwork: false, allowPrCreation: false },
    adapters: ["agents-md"]
  };
}
const budget = () => ({ filesWritten: 0, bytesWritten: 0 });
const opts = { timeoutMs: 5000 };

describe("applyActions enforcement", () => {
  test("writes an allowed file", async () => {
    const root = await tempRoot();
    const actions: DrivenAction[] = [{ type: "write_file", path: "src/a.ts", content: "export const a = 1;" }];
    const batch = await applyActions(root, actions, loop(), budget(), opts);
    expect(batch.applied).toHaveLength(1);
    expect(batch.blocked).toHaveLength(0);
    expect(await fs.readFile(path.join(root, "src/a.ts"), "utf8")).toContain("a = 1");
  });

  test("blocks a forbidden-path write before it lands", async () => {
    const root = await tempRoot();
    const batch = await applyActions(root, [{ type: "write_file", path: ".env", content: "SECRET=1" }], loop(), budget(), opts);
    expect(batch.applied).toHaveLength(0);
    expect(batch.blocked[0]).toMatchObject({ reason: "forbidden-path", pattern: ".env" });
    await expect(fs.access(path.join(root, ".env"))).rejects.toThrow();
  });

  test("blocks path escapes (absolute and ..)", async () => {
    const root = await tempRoot();
    const abs = await applyActions(root, [{ type: "write_file", path: "/tmp/evil", content: "x" }], loop(), budget(), opts);
    const up = await applyActions(root, [{ type: "write_file", path: "../escape", content: "x" }], loop(), budget(), opts);
    expect(abs.blocked[0].reason).toBe("path-escape");
    expect(up.blocked[0].reason).toBe("path-escape");
  });

  test("blocks a command not in the allowlist", async () => {
    const root = await tempRoot();
    const batch = await applyActions(root, [{ type: "run_command", command: "rm -rf /" }], loop(), budget(), opts);
    expect(batch.applied).toHaveLength(0);
    expect(batch.blocked[0].reason).toBe("command-not-allowed");
  });

  test("runs an allowed command and captures its result", async () => {
    const root = await tempRoot();
    const batch = await applyActions(root, [{ type: "run_command", command: 'node -e "process.exit(0)"' }], loop(), budget(), opts);
    expect(batch.applied).toHaveLength(1);
    expect(batch.commandResults[0].exitCode).toBe(0);
  });

  test("blocks an oversized write", async () => {
    const root = await tempRoot();
    const big = "x".repeat(APPLY_LIMITS.maxBytesPerFile + 1);
    const batch = await applyActions(root, [{ type: "write_file", path: "big.txt", content: big }], loop(), budget(), opts);
    expect(batch.blocked[0].reason).toBe("limit-exceeded");
  });

  test("dry-run records would-apply but writes nothing", async () => {
    const root = await tempRoot();
    const batch = await applyActions(root, [{ type: "write_file", path: "a.txt", content: "x" }], loop(), budget(), { ...opts, dryRun: true });
    expect(batch.applied).toHaveLength(1);
    await expect(fs.access(path.join(root, "a.txt"))).rejects.toThrow();
  });
});
