import { promises as fs } from "node:fs";
import path from "node:path";
import type { CommandSet, ProjectScan } from "./types.js";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-web",
  "build",
  "coverage",
  ".cache",
  ".next",
  "target",
  "__pycache__"
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".rb",
  ".php",
  ".cs"
]);

const CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".toml", ".ini"]);

export async function scanProject(projectRoot: string): Promise<ProjectScan> {
  const root = path.resolve(projectRoot);
  const warnings: string[] = [];
  await assertDirectory(root);

  const packageJson = await readJson<Record<string, unknown>>(path.join(root, "package.json"));
  const scripts = readPackageScripts(packageJson);
  const packageManagers = await detectPackageManagers(root);
  const languages = await detectLanguages(root);
  const workflowFiles = await findWorkflowFiles(root);
  const files = await countProjectFiles(root);
  const contextSources = await detectContextSources(root, workflowFiles);
  const commands = inferCommands(root, scripts, packageManagers);

  if (!commands.test && !commands.lint && !commands.build) {
    warnings.push("No verification command was inferred. Generated loops will stay in draft mode until one is configured.");
  }

  return {
    root,
    projectName: packageJson?.name ? String(packageJson.name) : path.basename(root),
    detectedAt: new Date().toISOString(),
    languages,
    primaryLanguage: languages[0] ?? "Unknown",
    packageManagers,
    commands,
    scripts,
    ci: {
      providers: workflowFiles.length > 0 ? ["github-actions"] : [],
      workflowFiles: workflowFiles.map((file) => path.relative(root, file))
    },
    files,
    contextSources,
    warnings
  };
}

async function assertDirectory(root: string) {
  const stat = await fs.stat(root).catch(() => undefined);
  if (!stat?.isDirectory()) {
    throw new Error(`Project path is not a directory: ${root}`);
  }
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function readPackageScripts(packageJson: Record<string, unknown> | undefined): Record<string, string> {
  if (!packageJson || typeof packageJson.scripts !== "object" || !packageJson.scripts) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(packageJson.scripts as Record<string, unknown>).filter(([, value]) => typeof value === "string")
  ) as Record<string, string>;
}

async function detectPackageManagers(root: string): Promise<string[]> {
  const checks: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["poetry.lock", "poetry"],
    ["uv.lock", "uv"],
    ["go.mod", "go"],
    ["Cargo.toml", "cargo"]
  ];

  const found: string[] = [];
  for (const [file, manager] of checks) {
    if (await exists(path.join(root, file))) {
      found.push(manager);
    }
  }

  if ((await exists(path.join(root, "package.json"))) && !found.some((manager) => ["pnpm", "npm", "yarn", "bun"].includes(manager))) {
    found.push("npm");
  }

  if ((await exists(path.join(root, "pyproject.toml"))) && !found.includes("poetry") && !found.includes("uv")) {
    found.push("python");
  }

  if ((await exists(path.join(root, "requirements.txt"))) && !found.includes("python")) {
    found.push("python");
  }

  return found;
}

async function detectLanguages(root: string): Promise<string[]> {
  const counts = new Map<string, number>();
  await walk(root, async (file) => {
    const ext = path.extname(file);
    const language = languageForExtension(ext);
    if (language) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language]) => language);
}

function languageForExtension(ext: string): string | undefined {
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#"
  };
  return map[ext];
}

async function findWorkflowFiles(root: string): Promise<string[]> {
  const workflowsDir = path.join(root, ".github", "workflows");
  const files: string[] = [];

  if (await exists(workflowsDir)) {
    await walk(workflowsDir, async (file) => {
      if ([".yml", ".yaml"].includes(path.extname(file))) {
        files.push(file);
      }
    });
  }

  if (await exists(path.join(root, ".gitlab-ci.yml"))) {
    files.push(path.join(root, ".gitlab-ci.yml"));
  }

  return files.sort();
}

async function countProjectFiles(root: string) {
  const counts = {
    total: 0,
    source: 0,
    tests: 0,
    configs: 0
  };

  await walk(root, async (file) => {
    counts.total += 1;
    const ext = path.extname(file);
    const normalized = path.relative(root, file).split(path.sep).join("/");
    if (SOURCE_EXTENSIONS.has(ext)) {
      counts.source += 1;
    }
    if (/(\btests?\b|\.test\.|\.spec\.|__tests__)/i.test(normalized)) {
      counts.tests += 1;
    }
    if (CONFIG_EXTENSIONS.has(ext) || /(^|\/)(Makefile|Dockerfile|compose\.ya?ml)$/i.test(normalized)) {
      counts.configs += 1;
    }
  });

  return counts;
}

async function detectContextSources(root: string, workflowFiles: string[]): Promise<string[]> {
  const candidates = [
    "README.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "Makefile",
    ...workflowFiles.map((file) => path.relative(root, file))
  ];

  const found: string[] = [];
  for (const candidate of candidates) {
    if (await exists(path.join(root, candidate))) {
      found.push(candidate);
    }
  }
  return found;
}

function inferCommands(root: string, scripts: Record<string, string>, managers: string[]): CommandSet {
  const commands: CommandSet = {};
  const nodeManager = managers.find((manager) => ["pnpm", "npm", "yarn", "bun"].includes(manager));

  if (nodeManager) {
    commands.packageManager = nodeManager;
    commands.install = installCommandFor(nodeManager);
    if (scripts.test) commands.test = runScriptCommand(nodeManager, "test");
    if (scripts.lint) commands.lint = runScriptCommand(nodeManager, "lint");
    if (scripts.build) commands.build = runScriptCommand(nodeManager, "build");
    if (scripts.format) commands.format = runScriptCommand(nodeManager, "format");
    return commands;
  }

  if (managers.includes("go")) {
    commands.packageManager = "go";
    commands.test = "go test ./...";
    commands.build = "go build ./...";
    return commands;
  }

  if (managers.includes("cargo")) {
    commands.packageManager = "cargo";
    commands.test = "cargo test";
    commands.build = "cargo build";
    return commands;
  }

  if (managers.includes("poetry")) {
    commands.packageManager = "poetry";
    commands.install = "poetry install";
    commands.test = "poetry run pytest";
    return commands;
  }

  if (managers.includes("uv")) {
    commands.packageManager = "uv";
    commands.install = "uv sync";
    commands.test = "uv run pytest";
    return commands;
  }

  if (managers.includes("python")) {
    commands.packageManager = "python";
    commands.install = "python -m pip install -r requirements.txt";
    commands.test = "python -m pytest";
  }

  if (commands.install && !fileLikelyExists(root, "requirements.txt")) {
    delete commands.install;
  }

  return commands;
}

function installCommandFor(manager: string) {
  if (manager === "pnpm") return "pnpm install --frozen-lockfile";
  if (manager === "yarn") return "yarn install --frozen-lockfile";
  if (manager === "bun") return "bun install --frozen-lockfile";
  return "npm ci";
}

function runScriptCommand(manager: string, script: string) {
  if (manager === "npm") return `npm run ${script}`;
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `pnpm ${script}`;
}

function fileLikelyExists(root: string, file: string) {
  return root.length > 0 && file.length > 0;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(root: string, onFile: (filePath: string) => Promise<void> | void) {
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github" && entry.name !== ".gitlab-ci.yml") {
        if (entry.name !== ".github") continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          queue.push(fullPath);
        }
      } else if (entry.isFile()) {
        await onFile(fullPath);
      }
    }
  }
}
