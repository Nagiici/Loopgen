import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { LoopFile, LoopSpec } from "./types.js";

export const DEFAULT_LOOPS_FILE = ".loopgen/loopgen.loop.yaml";

export async function loadLoopFile(projectRoot: string, loopsFile = DEFAULT_LOOPS_FILE): Promise<LoopFile> {
  const filePath = path.join(projectRoot, loopsFile);
  const raw = await fs.readFile(filePath, "utf8").catch(() => {
    throw new Error(`No loop file at ${loopsFile}. Run \`loopgen apply\` first to generate it.`);
  });
  const parsed = parse(raw) as Partial<LoopFile> | undefined;
  if (!parsed || !Array.isArray(parsed.loops)) {
    throw new Error(`Malformed loop file at ${loopsFile}: missing a "loops" array.`);
  }
  parsed.loops.forEach((loop, index) => assertLoopSpec(loop, index));
  return {
    version: typeof parsed.version === "string" ? parsed.version : "unknown",
    project: typeof parsed.project === "string" ? parsed.project : path.basename(projectRoot),
    loops: parsed.loops
  };
}

export function selectLoop(loopFile: LoopFile, id?: string): LoopSpec {
  if (id) {
    const found = loopFile.loops.find((loop) => loop.id === id);
    if (!found) {
      throw new Error(`Unknown loop "${id}". Available: ${loopFile.loops.map((loop) => loop.id).join(", ") || "(none)"}`);
    }
    return found;
  }
  if (loopFile.loops.length === 1) return loopFile.loops[0];
  throw new Error(
    `Multiple loops found — specify one. Available: ${loopFile.loops.map((loop) => loop.id).join(", ")}`
  );
}

// YAML is untrusted at runtime: assert the fields the runner depends on.
function assertLoopSpec(loop: unknown, index: number): asserts loop is LoopSpec {
  const where = `loops[${index}]`;
  if (!loop || typeof loop !== "object") throw new Error(`${where} is not an object.`);
  const value = loop as Record<string, unknown>;
  if (typeof value.id !== "string") throw new Error(`${where}.id must be a string.`);
  const verification = value.verification as Record<string, unknown> | undefined;
  if (!verification || !Array.isArray(verification.commands)) {
    throw new Error(`${where}.verification.commands must be an array.`);
  }
  const stopCriteria = value.stopCriteria as Record<string, unknown> | undefined;
  if (!stopCriteria || typeof stopCriteria.timeoutMinutes !== "number") {
    throw new Error(`${where}.stopCriteria.timeoutMinutes must be a number.`);
  }
  const permissions = value.permissions as Record<string, unknown> | undefined;
  if (!permissions || !Array.isArray(permissions.forbiddenPaths)) {
    throw new Error(`${where}.permissions.forbiddenPaths must be an array.`);
  }
}
