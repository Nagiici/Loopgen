import { afterEach, describe, expect, test, vi } from "vitest";
import { createModelClient } from "../src/core/model-client.js";

afterEach(() => vi.unstubAllGlobals());

describe("model client", () => {
  test("ollama posts to /api/chat with format:json and reads message.content", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        captured = { url, body: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ message: { content: '{"actions":[]}' } }) } as unknown as Response;
      })
    );
    const client = createModelClient({ adapterId: "ollama", baseUrl: "http://localhost:11434", model: "llama3", timeoutMs: 5000 });
    const out = await client.chat([{ role: "user", content: "hi" }]);
    expect(captured?.url).toBe("http://localhost:11434/api/chat");
    expect(captured?.body.format).toBe("json");
    expect(captured?.body.model).toBe("llama3");
    expect(out).toContain("actions");
  });

  test("openai-compatible posts /chat/completions with response_format and Bearer from env", async () => {
    process.env.LG_TEST_KEY = "secret-value";
    let headers: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        headers = init.headers;
        return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) } as unknown as Response;
      })
    );
    const client = createModelClient({
      adapterId: "openai-compatible",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen",
      apiKeyEnv: "LG_TEST_KEY",
      timeoutMs: 5000
    });
    await client.chat([{ role: "user", content: "hi" }]);
    expect(headers?.Authorization).toBe("Bearer secret-value");
    delete process.env.LG_TEST_KEY;
  });

  test("friendly error when the endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed ECONNREFUSED");
      })
    );
    const client = createModelClient({ adapterId: "ollama", baseUrl: "http://localhost:11434", model: "m", timeoutMs: 5000 });
    await expect(client.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/Could not reach the local model/);
  });
});
