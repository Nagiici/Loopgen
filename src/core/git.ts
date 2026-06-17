import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    return { stdout, code: 0 };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: unknown }).code;
      const stdout = String((error as { stdout?: unknown }).stdout ?? "");
      if (typeof code === "number") return { stdout, code };
    }
    throw error;
  }
}

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    const { stdout, code } = await git(root, ["rev-parse", "--is-inside-work-tree"]);
    return code === 0 && stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function headSha(root: string, ref = "HEAD"): Promise<string | null> {
  const { stdout, code } = await git(root, ["rev-parse", ref]);
  if (code !== 0) return null;
  const sha = stdout.trim();
  return sha.length ? sha : null;
}

export async function isClean(root: string): Promise<boolean> {
  const { stdout } = await git(root, ["status", "--porcelain"]);
  return stdout.trim().length === 0;
}

export interface ChangedFiles {
  tracked: string[];
  untracked: string[];
}

export async function changedFiles(root: string, base: string): Promise<ChangedFiles> {
  const hasCommits = (await headSha(root)) !== null;
  const tracked = hasCommits
    ? splitLines((await git(root, ["diff", "--name-only", base])).stdout)
    : splitLines((await git(root, ["ls-files"])).stdout);
  const untracked = splitLines((await git(root, ["ls-files", "--others", "--exclude-standard"])).stdout);
  return { tracked, untracked };
}

export async function diffStat(root: string, base: string): Promise<string> {
  if ((await headSha(root)) === null) return "(no commits yet — diff against empty tree)";
  const { stdout } = await git(root, ["diff", "--stat", base]);
  return stdout.trimEnd();
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
