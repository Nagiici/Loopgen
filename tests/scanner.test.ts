import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { scanProject } from "../src/core/scanner.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("scanProject", () => {
  test("detects a pnpm TypeScript project with CI and scripts", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "api-service",
        scripts: {
          test: "vitest run",
          lint: "eslint .",
          build: "tsc -p tsconfig.json"
        }
      }),
      "pnpm-lock.yaml": "lockfileVersion: 9.0",
      "README.md": "# API service",
      ".github/workflows/ci.yml": "name: ci",
      "src/index.ts": "export const ok = true;",
      "tests/index.test.ts": "test('ok', () => {})"
    });

    const scan = await scanProject(root);

    expect(scan.projectName).toBe("api-service");
    expect(scan.primaryLanguage).toBe("TypeScript");
    expect(scan.packageManagers).toContain("pnpm");
    expect(scan.commands).toMatchObject({
      install: "pnpm install --frozen-lockfile",
      test: "pnpm test",
      lint: "pnpm lint",
      build: "pnpm build"
    });
    expect(scan.ci.workflowFiles).toEqual([".github/workflows/ci.yml"]);
    expect(scan.files.tests).toBe(1);
  });

  test("detects Python, Go, and Rust verification commands", async () => {
    const python = await tempProject({
      "requirements.txt": "pytest",
      "tests/test_app.py": "def test_ok(): assert True"
    });
    const go = await tempProject({
      "go.mod": "module example.com/app",
      "main.go": "package main"
    });
    const rust = await tempProject({
      "Cargo.toml": "[package]\nname = \"tool\"\nversion = \"0.1.0\"",
      "src/lib.rs": "pub fn ok() -> bool { true }"
    });

    await expect(scanProject(python)).resolves.toMatchObject({
      primaryLanguage: "Python",
      commands: { test: "python -m pytest" }
    });
    await expect(scanProject(go)).resolves.toMatchObject({
      primaryLanguage: "Go",
      commands: { test: "go test ./...", build: "go build ./..." }
    });
    await expect(scanProject(rust)).resolves.toMatchObject({
      primaryLanguage: "Rust",
      commands: { test: "cargo test", build: "cargo build" }
    });
  });
});

async function tempProject(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-test-"));
  tempRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return root;
}
