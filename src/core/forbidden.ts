import type { ForbiddenPathResult, ForbiddenPathViolation } from "./types.js";

// Translate the loop's glob-ish forbidden patterns (e.g. ".env", ".env.*", "secrets/**",
// "**/*credential*") into anchored RegExps. No glob dependency is needed for these patterns.
export function globToRegExp(pattern: string): RegExp {
  let regex = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        regex += ".*"; // ** crosses path separators
        index += 1;
      } else {
        regex += "[^/]*"; // * stays within a path segment
      }
    } else if (char === "?") {
      regex += "[^/]";
    } else {
      regex += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${regex}$`);
}

export function checkForbiddenPaths(changed: string[], forbiddenPaths: string[]): ForbiddenPathResult {
  const matchers = forbiddenPaths.map((pattern) => ({ pattern, regex: globToRegExp(pattern) }));
  const violations: ForbiddenPathViolation[] = [];
  for (const file of changed) {
    const normalized = file.replace(/\\/g, "/");
    for (const matcher of matchers) {
      if (matcher.regex.test(normalized)) {
        violations.push({ file: normalized, pattern: matcher.pattern });
        break;
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
