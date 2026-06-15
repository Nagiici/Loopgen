import { promises as fs } from "node:fs";
import path from "node:path";
import type { GeneratedFile } from "./types.js";

export async function applyGeneratedFiles(projectRoot: string, files: GeneratedFile[]) {
  const written: string[] = [];
  for (const file of files) {
    const target = path.join(projectRoot, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
    written.push(file.path);
  }
  return written;
}
