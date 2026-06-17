import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { appendAuditEntry, readAuditFile } from "../src/core/audit.js";
import { buildSummary, collectAuditFiles, evaluatePolicy } from "../src/core/governance.js";
import { renderGovernanceHtml, renderGovernanceMarkdown } from "../src/core/governance-report.js";
import type { AuditEntryInput } from "../src/core/types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-gov-"));
  roots.push(root);
  return root;
}
const auditPath = (root: string) => path.join(root, ".loopgen", "audit.jsonl");
let counter = 0;

function input(
  loopId: string,
  passed: boolean,
  opts: { actor?: string; mode?: "referee" | "driven"; forbiddenOk?: boolean; ts?: string; tier?: "local" | "attested" } = {}
): AuditEntryInput {
  const ok = opts.forbiddenOk ?? true;
  return {
    schemaVersion: "1",
    entryId: `e${counter++}`,
    timestamp: opts.ts ?? "2026-06-17T00:00:00.000Z",
    project: "demo",
    loopId,
    mode: opts.mode ?? "referee",
    actor: { user: opts.actor ?? "alice" },
    git: { base: "HEAD", shaBefore: null, shaAfter: null, clean: true },
    changedFiles: { tracked: [], untracked: [], diffstat: "" },
    forbidden: { ok, violations: ok ? [] : [{ file: ".env", pattern: ".env" }] },
    verification: { passed, commands: [] },
    iterations: 1,
    passed,
    ...(opts.tier ? { provenance: { tier: opts.tier } } : {})
  };
}

describe("governance", () => {
  test("summary counts pass rate, modes, by-loop, chain", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", true));
    await appendAuditEntry(root, input("a", false));
    await appendAuditEntry(root, input("b", true, { mode: "driven" }));
    const { summary } = await buildSummary([{ label: ".", filePath: auditPath(root) }]);
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.byMode.driven).toBe(1);
    expect(summary.byLoop.a).toEqual({ total: 2, passed: 1 });
    expect(summary.chain.valid).toBe(true);
  });

  test("counts forbidden violations and driven blocked attempts", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", false, { forbiddenOk: false }));
    const driven = input("b", false, { mode: "driven" });
    driven.driven = {
      stopReason: "max-iterations",
      model: { adapter: "ollama", modelName: "m", baseUrl: "x" },
      attempts: [{ iteration: 1, actions: { write: 0, delete: 0, run: 0, finish: 0 }, blocked: [{ type: "write_file", reason: "forbidden-path", pattern: ".env" }], verificationPassed: false }]
    };
    await appendAuditEntry(root, driven);
    const { summary } = await buildSummary([{ label: ".", filePath: auditPath(root) }]);
    expect(summary.forbiddenViolationRuns).toBe(1);
    expect(summary.blockedAttempts).toBe(1);
  });

  test("aggregates across multiple sources; collectAuditFiles finds dir logs", async () => {
    const r1 = await tempRoot();
    const r2 = await tempRoot();
    await appendAuditEntry(r1, input("a", true));
    await appendAuditEntry(r2, input("a", true));
    await appendAuditEntry(r2, input("a", false));
    const files = await collectAuditFiles([r1, r2]);
    expect(files).toHaveLength(2);
    const { summary } = await buildSummary(files.map((file) => ({ label: file, filePath: file })));
    expect(summary.total).toBe(3);
    expect(summary.sources).toHaveLength(2);
    expect(summary.sources.every((source) => source.chainValid)).toBe(true);
  });

  test("policy gate: required loops, violations, chain", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("ci-failure-repair", true));
    await appendAuditEntry(root, input("test-repair", false, { forbiddenOk: false }));
    const entries = await readAuditFile(auditPath(root));
    expect(evaluatePolicy(entries, { requireLoops: ["ci-failure-repair"] }).ok).toBe(true);
    expect(evaluatePolicy(entries, { requireLoops: ["test-repair"] }).ok).toBe(false);
    expect(evaluatePolicy(entries, { requireNoViolations: true }).ok).toBe(false);
    expect(evaluatePolicy(entries, { requireChainValid: true }).ok).toBe(true);
  });

  test("policy --since scopes the window", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", true, { ts: "2026-01-01T00:00:00.000Z" }));
    const entries = await readAuditFile(auditPath(root));
    expect(evaluatePolicy(entries, { requireLoops: ["a"], since: "2026-06-01T00:00:00.000Z" }).ok).toBe(false);
    expect(evaluatePolicy(entries, { requireLoops: ["a"], since: "2025-01-01T00:00:00.000Z" }).ok).toBe(true);
  });

  test("detects a tampered (broken) chain", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", true));
    await appendAuditEntry(root, input("a", true));
    const file = auditPath(root);
    const lines = (await fs.readFile(file, "utf8")).trim().split("\n");
    const first = JSON.parse(lines[0]);
    first.passed = false; // tamper without recomputing the hash
    lines[0] = JSON.stringify(first);
    await fs.writeFile(file, `${lines.join("\n")}\n`);
    const { summary } = await buildSummary([{ label: ".", filePath: file }]);
    expect(summary.chain.valid).toBe(false);
    const entries = await readAuditFile(file);
    expect(evaluatePolicy(entries, { requireChainValid: true }).ok).toBe(false);
  });

  test("byTier counts trust tiers and requireAttested gates on the in-band claim", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", true, { tier: "attested" }));
    await appendAuditEntry(root, input("a", true)); // local (no provenance)
    const { summary } = await buildSummary([{ label: ".", filePath: auditPath(root) }]);
    expect(summary.byTier).toEqual({ local: 1, attested: 1 });
    const entries = await readAuditFile(auditPath(root));
    // one run is only local self-attestation → the gate fails
    expect(evaluatePolicy(entries, { requireAttested: true }).ok).toBe(false);
  });

  test("requireAttested passes when every run is CI-attested", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", true, { tier: "attested" }));
    await appendAuditEntry(root, input("b", true, { tier: "attested" }));
    const entries = await readAuditFile(auditPath(root));
    expect(evaluatePolicy(entries, { requireAttested: true }).ok).toBe(true);
  });

  test("renderers produce markdown and self-contained HTML", async () => {
    const root = await tempRoot();
    await appendAuditEntry(root, input("a", true));
    const { summary } = await buildSummary([{ label: ".", filePath: auditPath(root) }]);
    const md = renderGovernanceMarkdown(summary);
    const html = renderGovernanceHtml(summary);
    expect(md).toContain("governance report");
    expect(md).toContain("By loop");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("loopgen governance");
  });
});
