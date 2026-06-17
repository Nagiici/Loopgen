#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { Command } from "commander";
import { applyGeneratedFiles } from "./core/fs-plan.js";
import { demoProjectRoot, generateLoopProject } from "./core/generator.js";
import { scanProject } from "./core/scanner.js";
import { TEMPLATE_DEFINITIONS } from "./core/templates.js";
import { startLoopgenServer } from "./server.js";
import { DEFAULT_ADAPTER_IDS, parseAdapterIds } from "./core/adapters.js";
import { runLoop } from "./core/runner.js";
import { readAuditLog, verifyAuditChain } from "./core/audit.js";
import { buildSummary, collectAuditFiles, evaluatePolicy } from "./core/governance.js";
import { renderGovernanceHtml, renderGovernanceMarkdown } from "./core/governance-report.js";
import { promises as fsp } from "node:fs";
import type { AdapterConfigMap, AdapterId, AuditPolicy, ExperienceMode, GenerationOptions, GovernanceSummary, LoopTemplateId, RunMode } from "./core/types.js";

const PROJECT_MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json"
];

function looksLikeProject(dir: string): boolean {
  return PROJECT_MANIFESTS.some((file) => existsSync(path.join(dir, file)));
}

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("loopgen")
  .description("Run your AI's coding loop and prove its work actually passed — real verification, a tamper-evident audit, and a CI gate.")
  .version(version);

program
  .command("init")
  .argument("[project]", "project directory", ".")
  .option("-p, --port <port>", "port for the local wizard", "8787")
  .option("--host <host>", "host for the local wizard", "127.0.0.1")
  .option("--no-open", "do not open the browser automatically")
  .description("Start the local Web wizard.")
  .action(async (project: string, options: { port: string; host: string; open: boolean }) => {
    const projectRoot = path.resolve(project);
    const isProject = looksLikeProject(projectRoot);
    const { url } = await startLoopgenServer({
      projectRoot,
      host: options.host,
      port: Number(options.port)
    });
    const openUrl = isProject ? `${url}/?project=${encodeURIComponent(projectRoot)}` : url;
    console.log(`loopgen wizard running at ${url}`);
    if (isProject) {
      console.log(`Project: ${projectRoot}`);
    } else {
      console.log("No project manifest detected here — opening the built-in demo so you can explore safely.");
      console.log("Run `loopgen init <path-to-your-project>` to scan a real project.");
    }
    if (options.open) {
      openBrowser(openUrl);
    }
  });

program
  .command("scan")
  .argument("[project]", "project directory", ".")
  .option("--json", "print the full scan as JSON")
  .option("--demo", "scan the built-in demo project")
  .description("Scan a project and infer loop inputs.")
  .action(async (project: string, options: { json?: boolean; demo?: boolean }) => {
    const scan = await scanProject(options.demo ? demoProjectRoot() : path.resolve(project));
    if (options.json) {
      console.log(JSON.stringify(scan, null, 2));
      return;
    }
    console.log(`${scan.projectName} (${scan.primaryLanguage})`);
    console.log(`Root: ${scan.root}`);
    console.log(`Package managers: ${scan.packageManagers.join(", ") || "none detected"}`);
    console.log(`Commands: ${formatCommands(scan.commands)}`);
    console.log(`CI: ${scan.ci.workflowFiles.join(", ") || "none detected"}`);
    for (const warning of scan.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  });

program
  .command("create")
  .argument("[template]", "template id or 'all'", "all")
  .argument("[project]", "project directory", ".")
  .option("--adapters <items>", "comma-separated adapters", DEFAULT_ADAPTER_IDS.join(","))
  .option("--ollama-model <model>", "model name for the Ollama adapter")
  .option("--ollama-base-url <url>", "base URL for the Ollama adapter")
  .option("--openai-compatible-model <model>", "model name for the OpenAI-compatible adapter")
  .option("--openai-compatible-base-url <url>", "base URL for the OpenAI-compatible adapter")
  .option("--openai-compatible-api-key-env <name>", "environment variable name for an OpenAI-compatible API key")
  .option("--json", "print generated file metadata as JSON")
  .option("--demo", "use the built-in demo project")
  .description("Create loop configuration in memory and print a summary.")
  .action(async (template: string, project: string, options: AdapterCliOptions & { json?: boolean; demo?: boolean }) => {
    const result = await generateLoopProject(
      buildGenerationOptions(project, template, options.adapters, options.demo ? "demo" : "project", buildAdapterConfigs(options))
    );
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printGenerationSummary(result);
  });

program
  .command("preview")
  .argument("[project]", "project directory", ".")
  .option("--templates <items>", "comma-separated loop templates", "all")
  .option("--adapters <items>", "comma-separated adapters", DEFAULT_ADAPTER_IDS.join(","))
  .option("--ollama-model <model>", "model name for the Ollama adapter")
  .option("--ollama-base-url <url>", "base URL for the Ollama adapter")
  .option("--openai-compatible-model <model>", "model name for the OpenAI-compatible adapter")
  .option("--openai-compatible-base-url <url>", "base URL for the OpenAI-compatible adapter")
  .option("--openai-compatible-api-key-env <name>", "environment variable name for an OpenAI-compatible API key")
  .option("--demo", "use the built-in demo project")
  .description("Preview the files loopgen would write.")
  .action(async (project: string, options: AdapterCliOptions & { templates: string; demo?: boolean }) => {
    const result = await generateLoopProject(buildGenerationOptions(project, options.templates, options.adapters, options.demo ? "demo" : "project", buildAdapterConfigs(options)));
    printGenerationSummary(result);
    console.log("\nDiff preview:\n");
    console.log(result.diff || "No changes.");
  });

program
  .command("apply")
  .argument("[project]", "project directory", ".")
  .option("--templates <items>", "comma-separated loop templates", "all")
  .option("--adapters <items>", "comma-separated adapters", DEFAULT_ADAPTER_IDS.join(","))
  .option("--ollama-model <model>", "model name for the Ollama adapter")
  .option("--ollama-base-url <url>", "base URL for the Ollama adapter")
  .option("--openai-compatible-model <model>", "model name for the OpenAI-compatible adapter")
  .option("--openai-compatible-base-url <url>", "base URL for the OpenAI-compatible adapter")
  .option("--openai-compatible-api-key-env <name>", "environment variable name for an OpenAI-compatible API key")
  .option("-y, --yes", "apply without an interactive confirmation")
  .description("Write generated loop files after confirmation.")
  .action(async (project: string, options: AdapterCliOptions & { templates: string; yes?: boolean }) => {
    const result = await generateLoopProject(buildGenerationOptions(project, options.templates, options.adapters, "project", buildAdapterConfigs(options)));
    printGenerationSummary(result);
    console.log("\nDiff preview:\n");
    console.log(result.diff || "No changes.");
    if (!options.yes && !(await confirm("Apply these files?"))) {
      console.log("Canceled.");
      return;
    }
    const written = await applyGeneratedFiles(result.scan.root, result.files);
    console.log(`Wrote ${written.length} files.`);
  });

program
  .command("run")
  .argument("[loop]", "loop id from .loopgen/loopgen.loop.yaml")
  .argument("[project]", "project directory", ".")
  .option("--mode <mode>", "referee | driven", "referee")
  .option("--base <ref>", "git ref to diff the working tree against", "HEAD")
  .option("--loops-file <path>", "path to the loop file")
  .option("--json", "print the run result as JSON")
  .option("--dry-run", "run checks without writing audit, report, or state")
  .option("--no-report", "do not write the markdown proof report")
  .option("--adapter <id>", "driven mode: ollama | openai-compatible")
  .option("--max-iterations <n>", "driven mode: override the loop's max iterations")
  .option("--allow-dirty", "driven mode: allow running with a dirty working tree")
  .option("--ollama-model <model>", "driven mode: Ollama model name")
  .option("--ollama-base-url <url>", "driven mode: Ollama base URL")
  .option("--openai-compatible-model <model>", "driven mode: OpenAI-compatible model name")
  .option("--openai-compatible-base-url <url>", "driven mode: OpenAI-compatible base URL")
  .option("--openai-compatible-api-key-env <name>", "driven mode: env var name for the API key")
  .description("Run a loop's verification against the working tree and write a tamper-evident proof.")
  .action(
    async (
      loop: string | undefined,
      project: string,
      options: {
        mode?: string;
        base?: string;
        loopsFile?: string;
        json?: boolean;
        dryRun?: boolean;
        report?: boolean;
        adapter?: string;
        maxIterations?: string;
        allowDirty?: boolean;
        ollamaModel?: string;
        ollamaBaseUrl?: string;
        openaiCompatibleModel?: string;
        openaiCompatibleBaseUrl?: string;
        openaiCompatibleApiKeyEnv?: string;
      }
    ) => {
      const result = await runLoop({
        projectRoot: path.resolve(project),
        loopId: loop,
        mode: (options.mode as RunMode) ?? "referee",
        base: options.base,
        loopsFile: options.loopsFile,
        dryRun: options.dryRun,
        writeReport: options.report,
        allowDirty: options.allowDirty,
        adapter: options.adapter === "openai-compatible" ? "openai-compatible" : options.adapter === "ollama" ? "ollama" : undefined,
        maxIterations: options.maxIterations ? Number(options.maxIterations) : undefined,
        ollamaModel: options.ollamaModel,
        ollamaBaseUrl: options.ollamaBaseUrl,
        openaiCompatibleModel: options.openaiCompatibleModel,
        openaiCompatibleBaseUrl: options.openaiCompatibleBaseUrl,
        openaiCompatibleApiKeyEnv: options.openaiCompatibleApiKeyEnv
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printRunResult(result);
      }
      process.exitCode = result.passed ? 0 : 1;
    }
  );

const audit = program.command("audit").description("Inspect, aggregate, and gate on loopgen audit logs (governance).");

audit
  .command("verify")
  .argument("[project]", "project directory", ".")
  .description("Verify the audit hash chain is intact (tamper check).")
  .action(async (project: string) => {
    const entries = await readAuditLog(path.resolve(project));
    const chain = verifyAuditChain(entries);
    if (chain.valid) {
      console.log(`Audit chain valid (${entries.length} entries).`);
    } else {
      console.log(`Audit chain BROKEN at entry ${chain.brokenAt}.`);
      process.exitCode = 1;
    }
  });

audit
  .command("summary")
  .argument("[project]", "project directory", ".")
  .option("--json", "print the summary as JSON")
  .description("Summarize one repo's audit log (pass rate, by loop, violations).")
  .action(async (project: string, options: { json?: boolean }) => {
    const root = path.resolve(project);
    const { summary } = await buildSummary([{ label: ".", filePath: path.join(root, ".loopgen", "audit.jsonl") }]);
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else printSummary(summary);
  });

audit
  .command("aggregate")
  .argument("<paths...>", "audit.jsonl files or directories to scan")
  .option("--json", "print the rollup as JSON")
  .option("--report <file>", "write a markdown governance report")
  .option("--html <file>", "write a self-contained HTML governance dashboard")
  .description("Aggregate many devs'/repos' audit logs into one team governance rollup.")
  .action(async (paths: string[], options: { json?: boolean; report?: string; html?: string }) => {
    const files = await collectAuditFiles(paths);
    if (!files.length) {
      console.error("No audit.jsonl files found in the given paths.");
      process.exitCode = 1;
      return;
    }
    const { summary } = await buildSummary(files.map((file) => ({ label: relLabel(file), filePath: file })));
    if (options.report) {
      await fsp.writeFile(options.report, renderGovernanceMarkdown(summary), "utf8");
      console.log(`Wrote ${options.report}`);
    }
    if (options.html) {
      await fsp.writeFile(options.html, renderGovernanceHtml(summary), "utf8");
      console.log(`Wrote ${options.html}`);
    }
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else printSummary(summary);
  });

audit
  .command("check")
  .argument("[project]", "project directory", ".")
  .option("--require <loops>", "comma-separated loop ids that must have a passing run")
  .option("--since <iso>", "only consider runs at/after this ISO timestamp")
  .option("--require-no-violations", "fail if any run modified forbidden paths")
  .option("--require-chain", "fail if the audit chain is broken")
  .description("Gate CI/merge on the audit log; exits 1 if the policy is not satisfied.")
  .action(
    async (
      project: string,
      options: { require?: string; since?: string; requireNoViolations?: boolean; requireChain?: boolean }
    ) => {
      const entries = await readAuditLog(path.resolve(project));
      const policy: AuditPolicy = {
        requireLoops: options.require ? options.require.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
        since: options.since,
        requireNoViolations: options.requireNoViolations,
        requireChainValid: options.requireChain
      };
      const result = evaluatePolicy(entries, policy);
      if (result.ok) {
        console.log(`Policy satisfied (${result.checked} run(s) checked).`);
      } else {
        console.log("Policy FAILED:");
        for (const failure of result.failures) console.log(`  - ${failure}`);
        process.exitCode = 1;
      }
    }
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

interface AdapterCliOptions {
  adapters: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  openaiCompatibleModel?: string;
  openaiCompatibleBaseUrl?: string;
  openaiCompatibleApiKeyEnv?: string;
}

function buildGenerationOptions(
  project: string,
  templates: string,
  adapters: string,
  experienceMode: ExperienceMode = "project",
  adapterConfigs?: AdapterConfigMap
): GenerationOptions {
  return {
    projectRoot: path.resolve(project),
    experienceMode,
    selectedTemplates: parseTemplates(templates),
    adapters: parseAdapters(adapters),
    adapterConfigs
  };
}

function parseTemplates(value: string): LoopTemplateId[] | undefined {
  if (value === "all") return undefined;
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean) as LoopTemplateId[];
  const valid = new Set(TEMPLATE_DEFINITIONS.map((template) => template.id));
  for (const id of ids) {
    if (!valid.has(id)) {
      throw new Error(`Unknown template: ${id}`);
    }
  }
  return ids;
}

function parseAdapters(value: string): AdapterId[] {
  return parseAdapterIds(value);
}

function buildAdapterConfigs(options: AdapterCliOptions): AdapterConfigMap {
  return {
    ollama: {
      preset: "ollama",
      model: options.ollamaModel,
      baseUrl: options.ollamaBaseUrl
    },
    "openai-compatible": {
      preset: options.openaiCompatibleBaseUrl ? "custom-openai-compatible" : "lm-studio",
      model: options.openaiCompatibleModel,
      baseUrl: options.openaiCompatibleBaseUrl,
      apiKeyEnv: options.openaiCompatibleApiKeyEnv
    }
  };
}

function printGenerationSummary(result: Awaited<ReturnType<typeof generateLoopProject>>) {
  console.log(`Project: ${result.scan.projectName}`);
  console.log(`Loops: ${result.loops.map((loop) => loop.id).join(", ")}`);
  console.log(`Files: ${result.files.length}`);
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

function printRunResult(result: Awaited<ReturnType<typeof runLoop>>) {
  console.log(`${result.passed ? "PASS" : "FAIL"} — loop ${result.loop.id} (${result.entry.mode}${result.dryRun ? ", dry-run" : ""})`);
  if (result.entry.driven) {
    const blocked = result.entry.driven.attempts.reduce((sum, attempt) => sum + attempt.blocked.length, 0);
    console.log(`  driven: ${result.entry.iterations} iteration(s), stop=${result.entry.driven.stopReason}, blocked=${blocked}`);
  }
  for (const command of result.verification.results) {
    const mark = command.timedOut ? "timeout" : command.exitCode === 0 ? "ok" : `exit ${command.exitCode}`;
    console.log(`  verify: ${command.command} — ${mark}`);
  }
  if (!result.verification.results.length) {
    console.log("  verify: no verification commands configured for this loop");
  }
  for (const violation of result.forbidden.violations) {
    console.log(`  forbidden: ${violation.file} (matched ${violation.pattern})`);
  }
  const changed = result.entry.changedFiles.tracked.length + result.entry.changedFiles.untracked.length;
  console.log(`  files changed: ${changed}`);
  if (result.reportPath) console.log(`  report: ${result.reportPath}`);
  if (!result.dryRun) console.log(`  audit: .loopgen/audit.jsonl (${result.entry.hash.slice(0, 12)}…)`);
}

function printSummary(summary: GovernanceSummary) {
  console.log(`Runs: ${summary.total} (${summary.passed} pass / ${summary.failed} fail) — ${Math.round(summary.passRate * 100)}%`);
  console.log(`Modes: referee ${summary.byMode.referee}, driven ${summary.byMode.driven}`);
  console.log(`Chain: ${summary.chain.valid ? "valid" : `BROKEN at ${summary.chain.brokenAt}`}`);
  console.log(`Forbidden violations: ${summary.forbiddenViolationRuns} run(s); blocked attempts (prevented): ${summary.blockedAttempts}`);
  for (const [loop, stat] of Object.entries(summary.byLoop).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${loop}: ${stat.passed}/${stat.total} passed`);
  }
  if (summary.sources.length > 1) {
    console.log(`Sources: ${summary.sources.length} (${summary.sources.filter((source) => source.chainValid).length} with a valid chain)`);
  }
}

function relLabel(file: string): string {
  return path.relative(process.cwd(), file) || file;
}

function formatCommands(commands: object) {
  const entries = Object.entries(commands).filter(([, command]) => command);
  return entries.length ? entries.map(([name, command]) => `${name}=${command}`).join(", ") : "none inferred";
}

async function confirm(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function openBrowser(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}
