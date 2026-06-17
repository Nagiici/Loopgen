import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AuditEntry, AuditEntryInput } from "./types.js";

export const AUDIT_FILE = ".loopgen/audit.jsonl";

// Deterministic JSON: object keys sorted recursively so the hash is stable across runs/machines.
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashEntry(input: AuditEntryInput, prevHash: string | null): string {
  return createHash("sha256").update(canonicalize({ ...input, prevHash })).digest("hex");
}

async function readRaw(projectRoot: string): Promise<string | undefined> {
  return fs.readFile(path.join(projectRoot, AUDIT_FILE), "utf8").catch(() => undefined);
}

export async function readAuditLog(projectRoot: string): Promise<AuditEntry[]> {
  const raw = await readRaw(projectRoot);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEntry);
}

export async function appendAuditEntry(projectRoot: string, input: AuditEntryInput): Promise<AuditEntry> {
  const existing = await readAuditLog(projectRoot);
  const prevHash = existing.length ? existing[existing.length - 1].hash : null;
  const entry: AuditEntry = { ...input, prevHash, hash: hashEntry(input, prevHash) };
  const filePath = path.join(projectRoot, AUDIT_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function verifyAuditChain(entries: AuditEntry[]): { valid: boolean; brokenAt?: number } {
  let prevHash: string | null = null;
  for (let index = 0; index < entries.length; index += 1) {
    const { hash, prevHash: storedPrev, ...input } = entries[index];
    if (storedPrev !== prevHash) return { valid: false, brokenAt: index };
    if (hashEntry(input as AuditEntryInput, storedPrev) !== hash) return { valid: false, brokenAt: index };
    prevHash = hash;
  }
  return { valid: true };
}
