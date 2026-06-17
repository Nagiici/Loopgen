import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { appendAuditEntry, readAuditLog, verifyAuditChain } from "../src/core/audit.js";
import type { AuditEntryInput } from "../src/core/types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-audit-"));
  roots.push(root);
  return root;
}

function input(loopId: string): AuditEntryInput {
  return {
    schemaVersion: "1",
    entryId: `id-${loopId}`,
    timestamp: "2026-06-17T00:00:00.000Z",
    project: "demo",
    loopId,
    mode: "referee",
    actor: {},
    git: { base: "HEAD", shaBefore: null, shaAfter: null, clean: true },
    changedFiles: { tracked: [], untracked: [], diffstat: "" },
    forbidden: { ok: true, violations: [] },
    verification: { passed: true, commands: [] },
    iterations: 1,
    passed: true
  };
}

describe("audit log", () => {
  test("entries form a valid hash chain", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a"));
    await appendAuditEntry(root, input("b"));
    await appendAuditEntry(root, input("c"));
    const entries = await readAuditLog(root);
    expect(entries).toHaveLength(3);
    expect(entries[0].prevHash).toBeNull();
    expect(entries[1].prevHash).toBe(entries[0].hash);
    expect(entries[2].prevHash).toBe(entries[1].hash);
    expect(verifyAuditChain(entries).valid).toBe(true);
  });

  test("tampering with an entry breaks the chain", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a"));
    await appendAuditEntry(root, input("b"));
    const entries = await readAuditLog(root);
    entries[0].passed = false; // mutate without recomputing the hash
    const result = verifyAuditChain(entries);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});
