import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyGeneratedFiles } from "./core/fs-plan.js";
import { generateLoopProject } from "./core/generator.js";
import { scanProject } from "./core/scanner.js";
import type { AdapterId, GenerationOptions, LoopTemplateId } from "./core/types.js";

export interface ServerOptions {
  projectRoot: string;
  port: number;
  host: string;
  webDir?: string;
}

export async function startLoopgenServer(options: ServerOptions) {
  const webDir = options.webDir ?? defaultWebDir();
  const server = createServer(async (request, response) => {
    try {
      if (!request.url) {
        send(response, 404, "Not found");
        return;
      }

      const url = new URL(request.url, `http://${options.host}:${options.port}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url, options.projectRoot);
        return;
      }

      await serveStatic(response, webDir, url.pathname);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  return {
    server,
    url: `http://${options.host}:${options.port}`
  };
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL, defaultRoot: string) {
  if (request.method === "GET" && url.pathname === "/api/scan") {
    const root = url.searchParams.get("path") || defaultRoot;
    sendJson(response, 200, await scanProject(root));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/preview") {
    const body = await readJsonBody(request);
    const result = await generateLoopProject(toGenerationOptions(body, defaultRoot));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/apply") {
    const body = await readJsonBody(request);
    if (body.confirm !== true) {
      sendJson(response, 400, { error: "Apply requires confirm: true." });
      return;
    }
    const result = await generateLoopProject(toGenerationOptions(body, defaultRoot));
    const written = await applyGeneratedFiles(result.scan.root, result.files);
    sendJson(response, 200, { written, warnings: result.warnings });
    return;
  }

  sendJson(response, 404, { error: "Unknown API route." });
}

function toGenerationOptions(body: Record<string, unknown>, defaultRoot: string): GenerationOptions {
  return {
    projectRoot: typeof body.projectRoot === "string" && body.projectRoot.length > 0 ? body.projectRoot : defaultRoot,
    selectedTemplates: stringArray(body.selectedTemplates) as LoopTemplateId[],
    adapters: stringArray(body.adapters) as AdapterId[],
    triggerCadence: typeof body.triggerCadence === "string" ? body.triggerCadence : undefined,
    acceptanceCriteria: typeof body.acceptanceCriteria === "string" ? body.acceptanceCriteria : undefined,
    allowPrCreation: Boolean(body.allowPrCreation),
    allowedCommands: stringArray(body.allowedCommands),
    maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : undefined
  };
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

async function serveStatic(response: ServerResponse, webDir: string, requestPath: string) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(webDir, normalizedPath);
  const safePath = path.resolve(filePath);
  const safeRoot = path.resolve(webDir);

  if (!safePath.startsWith(safeRoot)) {
    send(response, 403, "Forbidden");
    return;
  }

  let content = await fs.readFile(safePath).catch(() => undefined);
  let finalPath = safePath;
  if (!content) {
    finalPath = path.join(webDir, "index.html");
    content = await fs.readFile(finalPath).catch(() => undefined);
  }

  if (!content) {
    send(response, 503, "Web assets are missing. Run `npm run build` first.");
    return;
  }

  response.writeHead(200, { "Content-Type": contentType(finalPath) });
  response.end(content);
}

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function send(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function defaultWebDir() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "dist-web");
}
