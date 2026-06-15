import { promises as fs } from "node:fs";
import path from "node:path";
import type { GeneratedFile } from "./types.js";

export async function createPreviewDiff(projectRoot: string, files: GeneratedFile[]): Promise<string> {
  const chunks: string[] = [];
  for (const file of files) {
    const absolute = path.join(projectRoot, file.path);
    const existing = await fs.readFile(absolute, "utf8").catch(() => undefined);
    if (existing === file.content) {
      continue;
    }
    chunks.push(renderFileDiff(file.path, existing, file.content));
  }
  return chunks.join("\n");
}

export function renderFileDiff(filePath: string, before: string | undefined, after: string): string {
  const beforeLines = before?.split("\n") ?? [];
  const afterLines = after.split("\n");
  const oldLabel = before === undefined ? "/dev/null" : `a/${filePath}`;
  const lines = [`--- ${oldLabel}`, `+++ b/${filePath}`];

  if (before === undefined) {
    lines.push(`@@ -0,0 +1,${afterLines.length} @@`);
    lines.push(...afterLines.map((line) => `+${line}`));
    return lines.join("\n");
  }

  lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
  lines.push(...beforeLines.map((line) => `-${line}`));
  lines.push(...afterLines.map((line) => `+${line}`));
  return lines.join("\n");
}
