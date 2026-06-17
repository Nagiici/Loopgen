import { describe, expect, test } from "vitest";
import { parseModelTurn } from "../src/core/agent-loop.js";

describe("parseModelTurn", () => {
  test("parses a plain JSON turn", () => {
    const result = parseModelTurn('{"reasoning":"x","actions":[{"type":"finish","summary":"done"}]}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.actions[0].type).toBe("finish");
  });

  test("repairs fenced ```json blocks", () => {
    const result = parseModelTurn('```json\n{"actions":[{"type":"write_file","path":"a.ts","content":"x"}]}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.actions[0]).toMatchObject({ type: "write_file", path: "a.ts" });
  });

  test("extracts a braced object from surrounding prose", () => {
    const result = parseModelTurn('Sure, here you go: {"actions":[]} hope that helps!');
    expect(result.ok).toBe(true);
  });

  test("fails on non-JSON", () => {
    expect(parseModelTurn("not json at all").ok).toBe(false);
  });

  test("drops invalid actions but keeps valid ones", () => {
    const result = parseModelTurn('{"actions":[{"type":"bogus"},{"type":"finish","summary":"s"}]}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.actions).toHaveLength(1);
  });
});
