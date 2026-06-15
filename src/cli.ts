#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { Command } from "commander";
import { applyGeneratedFiles } from "./core/fs-plan.js";
import { demoProjectRoot, generateLoopProject } from "./core/generator.js";
import { scanProject } from "./core/scanner.js";
import { TEMPLATE_DEFINITIONS } from "./core/templates.js";
import { startLoopgenServer } from "./server.js";
import type { AdapterId, ExperienceMode, GenerationOptions, LoopTemplateId } from "./core/types.js";

const program = new Command();

program
  .name("loopgen")
  .description("Local-first loop engineering generator for Codex and Claude.")
  .version("0.1.0");

program
  .command("init")
  .argument("[project]", "project directory", ".")
  .option("-p, --port <port>", "port for the local wizard", "8787")
  .option("--host <host>", "host for the local wizard", "127.0.0.1")
  .option("--no-open", "do not open the browser automatically")
  .description("Start the local Web wizard.")
  .action(async (project: string, options: { port: string; host: string; open: boolean }) => {
    const projectRoot = path.resolve(project);
    const { url } = await startLoopgenServer({
      projectRoot,
      host: options.host,
      port: Number(options.port)
    });
    console.log(`loopgen wizard running at ${url}`);
    console.log(`Project: ${projectRoot}`);
    if (options.open) {
      openBrowser(url);
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
  .option("--adapters <items>", "comma-separated adapters", "codex,claude")
  .option("--json", "print generated file metadata as JSON")
  .option("--demo", "use the built-in demo project")
  .description("Create loop configuration in memory and print a summary.")
  .action(async (template: string, project: string, options: { adapters: string; json?: boolean; demo?: boolean }) => {
    const result = await generateLoopProject(buildGenerationOptions(project, template, options.adapters, options.demo ? "demo" : "project"));
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
  .option("--adapters <items>", "comma-separated adapters", "codex,claude")
  .option("--demo", "use the built-in demo project")
  .description("Preview the files loopgen would write.")
  .action(async (project: string, options: { templates: string; adapters: string; demo?: boolean }) => {
    const result = await generateLoopProject(buildGenerationOptions(project, options.templates, options.adapters, options.demo ? "demo" : "project"));
    printGenerationSummary(result);
    console.log("\nDiff preview:\n");
    console.log(result.diff || "No changes.");
  });

program
  .command("apply")
  .argument("[project]", "project directory", ".")
  .option("--templates <items>", "comma-separated loop templates", "all")
  .option("--adapters <items>", "comma-separated adapters", "codex,claude")
  .option("-y, --yes", "apply without an interactive confirmation")
  .description("Write generated loop files after confirmation.")
  .action(async (project: string, options: { templates: string; adapters: string; yes?: boolean }) => {
    const result = await generateLoopProject(buildGenerationOptions(project, options.templates, options.adapters));
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

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function buildGenerationOptions(project: string, templates: string, adapters: string, experienceMode: ExperienceMode = "project"): GenerationOptions {
  return {
    projectRoot: path.resolve(project),
    experienceMode,
    selectedTemplates: parseTemplates(templates),
    adapters: parseAdapters(adapters)
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
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean) as AdapterId[];
  for (const id of ids) {
    if (id !== "codex" && id !== "claude") {
      throw new Error(`Unknown adapter: ${id}`);
    }
  }
  return ids.length ? ids : ["codex", "claude"];
}

function printGenerationSummary(result: Awaited<ReturnType<typeof generateLoopProject>>) {
  console.log(`Project: ${result.scan.projectName}`);
  console.log(`Loops: ${result.loops.map((loop) => loop.id).join(", ")}`);
  console.log(`Files: ${result.files.length}`);
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
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
