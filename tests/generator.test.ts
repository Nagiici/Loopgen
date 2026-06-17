import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { demoProjectRoot, generateLoopProject } from "../src/core/generator.js";
import { TEMPLATE_DEFINITIONS } from "../src/core/templates.js";

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
    expect(paths).toContain(".loopgen/playbooks/test-repair.md");
    expect(paths).toContain(".codex/skills/loopgen-test-repair/SKILL.md");
    expect(paths).toContain(".codex/agents/loopgen-ci-failure-repair-checker.toml");
    expect(paths).toContain(".claude/skills/loopgen-dependency-upgrade/SKILL.md");
    expect(paths).toContain(".claude/loops/pr-comment-handling.md");
    expect(result.diff).toContain("+++ b/.loopgen/loopgen.loop.yaml");
    expect(result.diff).toContain("+++ b/.loopgen/playbooks/test-repair.md");
    expect(result.diff).toContain("makerChecker: true");
  });

  test("generates portable AGENTS.md, Cursor, and Windsurf outputs", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "portable-app",
        scripts: {
          test: "vitest run",
          lint: "eslint .",
          build: "vite build"
        }
      }),
      "package-lock.json": "{}",
      "README.md": "# portable-app",
      "src/main.ts": "export const ok = true;",
      "src/main.test.ts": "test('ok', () => {})"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: ["test-repair", "ci-failure-repair"],
      adapters: ["agents-md", "cursor", "windsurf"]
    });

    const paths = result.files.map((file) => file.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain(".cursor/rules/loopgen-test-repair.mdc");
    expect(paths).toContain(".cursor/rules/loopgen-ci-failure-repair.mdc");
    expect(paths).toContain(".windsurfrules");

    const agents = result.files.find((file) => file.path === "AGENTS.md")?.content ?? "";
    expect(agents).toContain("# AGENTS.md");
    expect(agents).toContain("test-repair");
    expect(agents).toContain("npm run test");
    expect(agents).toContain("Do not read or modify");

    const cursor = result.files.find((file) => file.path === ".cursor/rules/loopgen-test-repair.mdc")?.content ?? "";
    expect(cursor).toContain("alwaysApply:");
    expect(cursor).toContain("Maximum iterations: 3");

    // The cross-tool adapters carry no secrets and emit no Codex/Claude files.
    expect(agents).not.toContain("DATABASE_URL");
    expect(paths.some((filePath) => filePath.startsWith(".codex/"))).toBe(false);
  });

  test("demo mode previews recommended loops without requiring a project path", async () => {
    const result = await generateLoopProject({
      experienceMode: "demo",
      adapters: ["codex"]
    });

    expect(result.experienceMode).toBe("demo");
    expect(result.scan.projectName).toBe("loopgen-demo-webapp");
    expect(result.scan.root).toBe(demoProjectRoot());
    expect(result.loops.length).toBeGreaterThan(1);
    expect(result.loops.every((loop) => loop.expectedOutcome.length > 0)).toBe(true);
    expect(result.loops.map((loop) => loop.id)).toContain("requirements-clarification");
    expect(result.files.map((file) => file.path)).toContain(".loopgen/playbooks/requirements-clarification.md");
  });

  test("every scenario template generates playbook, state, Codex, and Claude outputs", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "template-library",
        scripts: {
          test: "vitest run",
          lint: "eslint .",
          build: "vite build"
        }
      }),
      "package-lock.json": "{}",
      "README.md": "# template-library",
      "src/main.ts": "export const ok = true;",
      "src/main.test.ts": "test('ok', () => {})"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: TEMPLATE_DEFINITIONS.map((template) => template.id),
      adapters: ["codex", "claude"]
    });

    const paths = new Set(result.files.map((file) => file.path));
    expect(result.loops).toHaveLength(TEMPLATE_DEFINITIONS.length);
    for (const template of TEMPLATE_DEFINITIONS) {
      expect(paths.has(`.loopgen/playbooks/${template.id}.md`)).toBe(true);
      expect(paths.has(`.loopgen/state/${template.id}.md`)).toBe(true);
      expect(paths.has(`.codex/skills/loopgen-${template.id}/SKILL.md`)).toBe(true);
      expect(paths.has(`.claude/skills/loopgen-${template.id}/SKILL.md`)).toBe(true);
    }
  });

  test("generates Ollama adapter config and per-loop runbook", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "ollama-ready",
        scripts: { test: "vitest run" }
      }),
      "package-lock.json": "{}",
      "README.md": "# ollama-ready",
      "src/main.test.ts": "test('ok', () => {})"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: ["test-repair"],
      adapters: ["ollama"],
      adapterConfigs: {
        ollama: {
          model: "llama3.1",
          baseUrl: "http://localhost:11434"
        }
      }
    });

    const paths = result.files.map((file) => file.path);
    const config = result.files.find((file) => file.path === ".loopgen/adapters/ollama/config.json")?.content ?? "";
    const runbook = result.files.find((file) => file.path === ".loopgen/adapters/ollama/test-repair.md")?.content ?? "";

    expect(paths).toContain(".loopgen/adapters/ollama/config.json");
    expect(paths).toContain(".loopgen/adapters/ollama/test-repair.md");
    expect(config).toContain("\"adapter\": \"ollama\"");
    expect(config).toContain("\"model\": \"llama3.1\"");
    expect(runbook).toContain("/api/chat");
    expect(runbook).toContain("\"stream\": false");
    expect(paths.some((filePath) => filePath.startsWith(".codex/"))).toBe(false);
  });

  test("generates OpenAI-compatible adapter config and runbook without storing secrets", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "local-api",
        scripts: { test: "vitest run" }
      }),
      "package-lock.json": "{}",
      "README.md": "# local-api",
      "src/main.test.ts": "test('ok', () => {})"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: ["test-repair"],
      adapters: ["openai-compatible"],
      adapterConfigs: {
        "openai-compatible": {
          preset: "llama-cpp",
          model: "qwen2.5-coder",
          baseUrl: "http://localhost:8080/v1",
          apiKeyEnv: "LOCAL_LLM_API_KEY"
        }
      }
    });

    const config = result.files.find((file) => file.path === ".loopgen/adapters/openai-compatible/config.json")?.content ?? "";
    const runbook = result.files.find((file) => file.path === ".loopgen/adapters/openai-compatible/test-repair.md")?.content ?? "";

    expect(config).toContain("\"adapter\": \"openai-compatible\"");
    expect(config).toContain("\"apiKeyEnv\": \"LOCAL_LLM_API_KEY\"");
    expect(config).not.toContain("sk-");
    expect(runbook).toContain("/chat/completions");
    expect(runbook).toContain("Authorization: Bearer $LOCAL_LLM_API_KEY");
  });

  test("missing local model names produce warnings and TODO text", async () => {
    const root = await tempProject({
      "package.json": JSON.stringify({
        name: "missing-model",
        scripts: { test: "vitest run" }
      }),
      "package-lock.json": "{}",
      "README.md": "# missing-model",
      "src/main.test.ts": "test('ok', () => {})"
    });

    const result = await generateLoopProject({
      projectRoot: root,
      selectedTemplates: ["test-repair"],
      adapters: ["ollama"]
    });

    const config = result.files.find((file) => file.path === ".loopgen/adapters/ollama/config.json")?.content ?? "";
    const runbook = result.files.find((file) => file.path === ".loopgen/adapters/ollama/test-repair.md")?.content ?? "";

    expect(result.warnings.join("\n")).toContain("ollama needs a model name");
    expect(config).toContain("TODO_MODEL");
    expect(runbook).toContain("## TODO");
    expect(runbook).toContain("ollama needs a model name");
  });

  test("audience and category filters choose matching demo recommendations by default", async () => {
    const result = await generateLoopProject({
      experienceMode: "demo",
      audienceFilter: "qa",
      categoryFilter: "cross-functional",
      adapters: ["codex"]
    });

    expect(result.loops.map((loop) => loop.id)).toContain("qa-acceptance-checklist");
    expect(result.loops.every((loop) => loop.category === "cross-functional" && loop.audience.includes("qa"))).toBe(true);
    expect(result.files.map((file) => file.path)).toContain(".loopgen/playbooks/qa-acceptance-checklist.md");
  });

  test("demo preview generation does not write loopgen files into the demo fixture", async () => {
    const root = demoProjectRoot();
    await fs.rm(path.join(root, ".loopgen"), { recursive: true, force: true });
    await fs.rm(path.join(root, ".codex"), { recursive: true, force: true });

    await generateLoopProject({
      experienceMode: "demo",
      adapters: ["codex"]
    });

    await expect(fs.access(path.join(root, ".loopgen"))).rejects.toThrow();
    await expect(fs.access(path.join(root, ".codex"))).rejects.toThrow();
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
