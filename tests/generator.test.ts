import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { generateLoopProject } from "../src/core/generator.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("generateLoopProject", () => {
  test("generates stable Codex and Claude files for every maintenance template", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "web-app",
        scripts: {
          test: "vitest run",
          lint: "eslint .",
          build: "vite build"
        }
      }),
      "package-lock.json": "{}",
      "README.md": "# web-app",
      ".github/workflows/ci.yml": "name: ci",
      "src/main.ts": "export const ok = true;",
      "src/main.test.ts": "test('ok', () => {})"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: [
        "ci-failure-repair",
        "test-repair",
        "dependency-upgrade",
        "pr-comment-handling"
      ],
      adapters: ["codex", "claude"]
    });

    const paths = result.files.map((file) => file.path);
    expect(result.loops).toHaveLength(4);
    expect(paths).toContain(".loopgen/loopgen.loop.yaml");
    expect(paths).toContain(".codex/skills/loopgen-test-repair/SKILL.md");
    expect(paths).toContain(".codex/agents/loopgen-ci-failure-repair-checker.toml");
    expect(paths).toContain(".claude/skills/loopgen-dependency-upgrade/SKILL.md");
    expect(paths).toContain(".claude/loops/pr-comment-handling.md");
    expect(result.diff).toContain("+++ b/.loopgen/loopgen.loop.yaml");
    expect(result.diff).toContain("makerChecker: true");
  });

  test("preview generation does not write files to the target project", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "preview-only",
        scripts: { test: "vitest run" }
      }),
      "package-lock.json": "{}",
      "src/app.test.ts": "test('ok', () => {})"
    });

    await generateLoopProject({
      projectRoot: root,
      selectedTemplates: ["test-repair"],
      adapters: ["codex"]
    });

    await expect(fs.access(path.join(root, ".loopgen"))).rejects.toThrow();
    await expect(fs.access(path.join(root, ".codex"))).rejects.toThrow();
  });

  test("uses safe draft defaults when no verification command is inferred", async () => {
    const root = await tempProject({
      "README.md": "# unknown project",
      "notes.txt": "No package manager yet"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: ["test-repair"],
      adapters: ["codex"]
    });

    const loop = result.loops[0];
    const allContent = result.files.map((file) => file.content).join("\n");

    expect(loop.verification.requiresHumanCommandDefinition).toBe(true);
    expect(loop.verification.commands[0]).toContain("TODO: configure");
    expect(loop.stopCriteria.maxIterations).toBe(3);
    expect(loop.permissions.forbiddenPaths).toContain(".env");
    expect(allContent).not.toContain("DATABASE_URL");
    expect(result.warnings.join("\n")).toContain("needs a real verification command");
  });
});

async function tempProject(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-gen-"));
  tempRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return root;
}
