import { describe, expect, test } from "vitest";
import { checkForbiddenPaths, globToRegExp } from "../src/core/forbidden.js";

const FORBIDDEN = [".env", ".env.*", "secrets/**", "production/**", "**/*prod*secret*", "**/*credential*"];

describe("globToRegExp", () => {
  test("matches the loopgen forbidden patterns", () => {
    expect(globToRegExp(".env").test(".env")).toBe(true);
    expect(globToRegExp(".env.*").test(".env.local")).toBe(true);
    expect(globToRegExp("secrets/**").test("secrets/api/key.pem")).toBe(true);
    expect(globToRegExp("**/*credential*").test("app/aws-credentials.json")).toBe(true);
  });

  test("does not over-match benign paths", () => {
    expect(globToRegExp(".env").test("src/env.ts")).toBe(false);
    expect(globToRegExp(".env.*").test(".env")).toBe(false);
    expect(globToRegExp("secrets/**").test("src/secretsanta.ts")).toBe(false);
  });
});

describe("checkForbiddenPaths", () => {
  test("clean change set", () => {
    const result = checkForbiddenPaths(["src/app.ts", "README.md"], FORBIDDEN);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("flags a changed .env with the matching pattern", () => {
    const result = checkForbiddenPaths(["src/app.ts", ".env"], FORBIDDEN);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toEqual({ file: ".env", pattern: ".env" });
  });

  test("normalizes backslashes (Windows paths)", () => {
    const result = checkForbiddenPaths(["secrets\\key.pem"], FORBIDDEN);
    expect(result.ok).toBe(false);
    expect(result.violations[0].pattern).toBe("secrets/**");
  });
});
