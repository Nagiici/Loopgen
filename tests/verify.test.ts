import os from "node:os";
import { describe, expect, test } from "vitest";
import { runVerification } from "../src/core/verify.js";

const cwd = os.tmpdir();

describe("runVerification", () => {
  test("passing command gates true and captures stdout", async () => {
    const result = await runVerification(['node -e "console.log(12345)"'], { cwd, timeoutMs: 10_000 });
    expect(result.passed).toBe(true);
    expect(result.results[0].exitCode).toBe(0);
    expect(result.results[0].stdoutExcerpt).toContain("12345");
  });

  test("failing command gates false", async () => {
    const result = await runVerification(['node -e "process.exit(1)"'], { cwd, timeoutMs: 10_000 });
    expect(result.passed).toBe(false);
    expect(result.results[0].exitCode).toBe(1);
  });

  test("timeout marks timedOut and fails the gate", async () => {
    const result = await runVerification(['node -e "setTimeout(function(){}, 99999)"'], { cwd, timeoutMs: 200 });
    expect(result.results[0].timedOut).toBe(true);
    expect(result.passed).toBe(false);
  });

  test("empty command list does not pass", async () => {
    const result = await runVerification([], { cwd, timeoutMs: 1000 });
    expect(result.passed).toBe(false);
  });

  test("warns when a command is not in allowedCommands", async () => {
    const result = await runVerification(['node -e "process.exit(0)"'], {
      cwd,
      timeoutMs: 10_000,
      allowedCommands: ["npm run test"]
    });
    expect(result.warnings.length).toBe(1);
  });
});
