import { describe, expect, test } from "vitest";
import { DEFAULT_ADAPTER_IDS, parseAdapterIds } from "../src/core/adapters.js";

describe("adapter registry", () => {
  test("accepts Codex, Claude, Ollama, and OpenAI-compatible ids", () => {
    expect(parseAdapterIds("codex,claude,ollama,openai-compatible")).toEqual([
      "codex",
      "claude",
      "ollama",
      "openai-compatible"
    ]);
  });

  test("falls back to default adapters for an empty CLI value", () => {
    expect(parseAdapterIds("")).toEqual(DEFAULT_ADAPTER_IDS);
  });

  test("rejects unknown adapter ids", () => {
    expect(() => parseAdapterIds("codex,unknown-runtime")).toThrow("Unknown adapter: unknown-runtime");
  });
});
