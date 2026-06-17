import { promises as fs } from "node:fs";
import path from "node:path";
import { readAuditFile, verifyAuditChain } from "./audit.js";
import type { AuditEntry, AuditPolicy, GovernanceSummary, PolicyResult } from "./types.js";

export interface AuditSource {
  label: string;
  filePath: string;
}

// Resolve CLI inputs (files or directories) into a deduped list of audit.jsonl paths.
export async function collectAuditFiles(inputs: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const input of inputs) {
    const stat = await fs.stat(input).catch(() => undefined);
    if (!stat) continue;
    if (stat.isFile()) {
      found.push(path.resolve(input));
    } else if (stat.isDirectory()) {
      await walk(path.resolve(input), found, 0);
    }
  }
  return [...new Set(found)];
}

async function walk(dir: string, found: string[], depth: number): Promise<void> {
  if (depth > 6) return;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, found, depth + 1);
    } else if (entry.name === "audit.jsonl") {
      found.push(full);
    }
  }
}

export async function buildSummary(sources: AuditSource[]): Promise<{ summary: GovernanceSummary; entries: AuditEntry[] }> {
  const all: AuditEntry[] = [];
  const sourceMeta: GovernanceSummary["sources"] = [];
  let allChainsValid = true;
  let brokenAt: number | undefined;

  for (const source of sources) {
    const entries = await readAuditFile(source.filePath);
    const chain = verifyAuditChain(entries);
    if (!chain.valid) {
      allChainsValid = false;
      if (brokenAt === undefined) brokenAt = chain.brokenAt;
    }
    sourceMeta.push({ label: source.label, entries: entries.length, chainValid: chain.valid });
    all.push(...entries);
  }

  return { summary: summarizeEntries(all, sourceMeta, { valid: allChainsValid, brokenAt }), entries: all };
}

function summarizeEntries(
  entries: AuditEntry[],
  sources: GovernanceSummary["sources"],
  chain: GovernanceSummary["chain"]
): GovernanceSummary {
  const byLoop: GovernanceSummary["byLoop"] = {};
  const byActor: GovernanceSummary["byActor"] = {};
  const byMode = { referee: 0, driven: 0 };
  let passed = 0;
  let blockedAttempts = 0;
  let forbiddenViolationRuns = 0;
  let firstAt: string | undefined;
  let lastAt: string | undefined;

  for (const entry of entries) {
    if (entry.passed) passed += 1;
    if (entry.mode === "driven") byMode.driven += 1;
    else byMode.referee += 1;

    byLoop[entry.loopId] ??= { total: 0, passed: 0 };
    byLoop[entry.loopId].total += 1;
    if (entry.passed) byLoop[entry.loopId].passed += 1;

    const actor = entry.actor.user ?? "unknown";
    byActor[actor] ??= { total: 0, passed: 0 };
    byActor[actor].total += 1;
    if (entry.passed) byActor[actor].passed += 1;

    if (!entry.forbidden.ok) forbiddenViolationRuns += 1;
    if (entry.driven) {
      for (const attempt of entry.driven.attempts) blockedAttempts += attempt.blocked.length;
    }
    if (!firstAt || entry.timestamp < firstAt) firstAt = entry.timestamp;
    if (!lastAt || entry.timestamp > lastAt) lastAt = entry.timestamp;
  }

  const total = entries.length;
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    byLoop,
    byMode,
    byActor,
    blockedAttempts,
    forbiddenViolationRuns,
    firstAt,
    lastAt,
    chain,
    sources
  };
}

// Evaluate a team policy against a repo's audit entries — the CI / merge gate.
export function evaluatePolicy(entries: AuditEntry[], policy: AuditPolicy): PolicyResult {
  const failures: string[] = [];
  const scoped = policy.since ? entries.filter((entry) => entry.timestamp >= policy.since!) : entries;

  if (policy.requireChainValid) {
    const chain = verifyAuditChain(entries);
    if (!chain.valid) failures.push(`audit chain is broken at entry ${chain.brokenAt}`);
  }
  if (policy.requireNoViolations) {
    const violations = scoped.filter((entry) => !entry.forbidden.ok);
    if (violations.length) failures.push(`${violations.length} run(s) modified forbidden paths`);
  }
  for (const loopId of policy.requireLoops ?? []) {
    const ok = scoped.some((entry) => entry.loopId === loopId && entry.passed);
    if (!ok) failures.push(`no passing run found for required loop "${loopId}"`);
  }

  return { ok: failures.length === 0, failures, checked: scoped.length };
}
