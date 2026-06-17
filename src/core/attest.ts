import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalize } from "./audit.js";
import type {
  AttestationSubject,
  AttestRequest,
  Attestor,
  AttestationRef,
  CiProvenance,
  LoopSpec,
  VerificationResult,
  VerifyRequest,
  VerifyResult
} from "./types.js";

const execFileAsync = promisify(execFile);

export const ATTESTATION_DIR = path.join(".loopgen", "attestations");
export const LOOPGEN_PREDICATE_TYPE = "https://github.com/Nagiici/Loopgen/run-attestation/v1";
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errMsg(error: unknown): string {
  if (error && typeof error === "object") {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim().split("\n").slice(-1)[0];
    if (error instanceof Error) return error.message;
  }
  return String(error);
}

function isMissingBinary(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}

// ---------- CI / OIDC environment detection ----------

export interface CiDetection {
  ci?: CiProvenance;
  // An ambient OIDC identity is available, so keyless signing can happen WITHOUT interactive auth.
  // Gating on this prevents `--attest` from hanging on a browser prompt in a local/headless run.
  canAttest: boolean;
}

export function detectCiProvenance(env: NodeJS.ProcessEnv = process.env): CiDetection {
  if (env.GITHUB_ACTIONS === "true") {
    const ci: CiProvenance = {
      provider: "github-actions",
      repo: env.GITHUB_REPOSITORY,
      ref: env.GITHUB_REF,
      commitSha: env.GITHUB_SHA,
      workflow: env.GITHUB_WORKFLOW,
      workflowRef: env.GITHUB_WORKFLOW_REF,
      runId: env.GITHUB_RUN_ID,
      runAttempt: env.GITHUB_RUN_ATTEMPT,
      runnerEnv: env.RUNNER_ENVIRONMENT,
      actor: env.GITHUB_ACTOR
    };
    const canAttest =
      Boolean(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) || Boolean(env.SIGSTORE_ID_TOKEN);
    return { ci, canAttest };
  }
  if (env.CI === "true") {
    const ci: CiProvenance = { provider: "other-ci", commitSha: env.GITHUB_SHA ?? env.CI_COMMIT_SHA };
    return { ci, canAttest: Boolean(env.SIGSTORE_ID_TOKEN) };
  }
  return { canAttest: Boolean(env.SIGSTORE_ID_TOKEN) };
}

// ---------- attestation subject (the digest set the signature binds to) ----------

export function buildAttestationSubject(
  git: { shaAfter: string | null; clean: boolean },
  loop: LoopSpec,
  verification: VerificationResult
): AttestationSubject {
  const loopSpecHash = sha256Hex(canonicalize(loop));
  const verificationDigest = sha256Hex(
    canonicalize(verification.results.map((r) => ({ command: r.command, exitCode: r.exitCode, timedOut: r.timedOut })))
  );
  return { commitSha: git.shaAfter, treeClean: git.clean, loopSpecHash, verificationDigest };
}

// ---------- default attestor: keyless Sigstore via cosign (best-effort, degrades to local) ----------

async function cosignAvailable(): Promise<boolean> {
  try {
    await execFileAsync("cosign", ["version"], { timeout: 15_000 });
    return true;
  } catch (error) {
    if (isMissingBinary(error)) return false;
    return true; // present but `version` exited non-zero for some other reason — still usable
  }
}

function predicatePathFor(projectRoot: string, entryId: string): string {
  return path.join(projectRoot, ATTESTATION_DIR, `${entryId}.predicate.json`);
}

function bundlePathFor(projectRoot: string, entryId: string): string {
  return path.join(projectRoot, ATTESTATION_DIR, `${entryId}.sigstore.json`);
}

// cosign verify-blob requires an identity; derive it for GitHub OIDC, else signal "local checks only".
function githubIdentityArgs(ci?: CiProvenance): string[] | undefined {
  if (ci?.provider !== "github-actions" || !ci.repo) return undefined;
  const identity = ci.workflowRef
    ? `https://github.com/${ci.workflowRef}`
    : `^https://github.com/${ci.repo}/`;
  const flag = ci.workflowRef ? "--certificate-identity" : "--certificate-identity-regexp";
  return [flag, identity, "--certificate-oidc-issuer", GITHUB_OIDC_ISSUER];
}

export function createDefaultAttestor(): Attestor {
  return {
    async produce(req: AttestRequest): Promise<AttestationRef> {
      if (!(await cosignAvailable())) return { method: "none" };
      const predicatePath = predicatePathFor(req.projectRoot, req.entryId);
      const bundlePath = bundlePathFor(req.projectRoot, req.entryId);
      await fs.mkdir(path.dirname(predicatePath), { recursive: true });
      const predicate = {
        predicateType: LOOPGEN_PREDICATE_TYPE,
        entryId: req.entryId,
        entryHash: req.entryHash, // binds the signature to the exact audit entry hash
        subject: req.subject,
        ci: req.ci
      };
      await fs.writeFile(predicatePath, `${JSON.stringify(predicate, null, 2)}\n`, "utf8");
      await execFileAsync("cosign", ["sign-blob", "--yes", "--bundle", bundlePath, predicatePath], {
        timeout: 120_000
      });
      return {
        method: "cosign-keyless",
        bundlePath: path.relative(req.projectRoot, bundlePath),
        predicateType: LOOPGEN_PREDICATE_TYPE
      };
    },

    async verify(req: VerifyRequest): Promise<VerifyResult> {
      const { ref } = req;
      if (ref.method !== "cosign-keyless" || !ref.bundlePath) {
        return { ok: false, reason: "no external attestation bundle recorded for this entry" };
      }
      const bundlePath = path.join(req.projectRoot, ref.bundlePath);
      const predicatePath = bundlePath.replace(/\.sigstore\.json$/, ".predicate.json");
      const predicateRaw = await fs.readFile(predicatePath, "utf8").catch(() => undefined);
      if (!predicateRaw) return { ok: false, reason: "attestation predicate file is missing" };
      const predicate = JSON.parse(predicateRaw) as { entryHash?: string; ci?: CiProvenance };

      // Local cross-checks: the signed payload must bind the live entry hash + the recorded CI identity.
      if (predicate.entryHash !== req.entryHash) {
        return { ok: false, reason: `signed entryHash ${predicate.entryHash} != audit entry hash ${req.entryHash}` };
      }
      if (req.ci?.repo && predicate.ci?.repo && req.ci.repo !== predicate.ci.repo) {
        return { ok: false, reason: "signed CI repo does not match the audit entry's CI repo" };
      }

      if (!(await cosignAvailable())) {
        return { ok: true, reason: "predicate cross-check passed; cosign not installed, signature not cryptographically verified" };
      }
      const identityArgs = githubIdentityArgs(predicate.ci ?? req.ci);
      if (!identityArgs) {
        return { ok: true, reason: "predicate cross-check passed; non-GitHub identity, cosign identity not constructed" };
      }
      try {
        await execFileAsync("cosign", ["verify-blob", "--bundle", bundlePath, ...identityArgs, predicatePath], {
          timeout: 120_000
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: `cosign verify-blob failed: ${errMsg(error)}` };
      }
    }
  };
}

// Re-derive the attestation reference for an entry from its deterministic sibling-bundle path.
// (The AttestationRef is out-of-band — not in the hashed entry — so verify reconstructs it by entryId.)
export async function loadAttestationRef(projectRoot: string, entryId: string): Promise<AttestationRef> {
  const bundlePath = bundlePathFor(projectRoot, entryId);
  const exists = await fs
    .stat(bundlePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) return { method: "none" };
  return { method: "cosign-keyless", bundlePath: path.relative(projectRoot, bundlePath), predicateType: LOOPGEN_PREDICATE_TYPE };
}

// ---------- top-level wrappers used by runner.ts / cli.ts ----------

// Produce an attestation. NEVER throws — a failed/unavailable signer must not fail a passing run; it
// just leaves the run at local-evidence grade (method: "none").
export async function produceAttestation(opts: AttestRequest & { attestor?: Attestor }): Promise<AttestationRef> {
  const attestor = opts.attestor ?? createDefaultAttestor();
  try {
    return await attestor.produce({
      projectRoot: opts.projectRoot,
      entryId: opts.entryId,
      entryHash: opts.entryHash,
      subject: opts.subject,
      ci: opts.ci
    });
  } catch {
    return { method: "none" };
  }
}

export async function verifyAttestation(opts: VerifyRequest & { attestor?: Attestor }): Promise<VerifyResult> {
  const attestor = opts.attestor ?? createDefaultAttestor();
  try {
    return await attestor.verify({ projectRoot: opts.projectRoot, entryHash: opts.entryHash, ci: opts.ci, ref: opts.ref });
  } catch (error) {
    return { ok: false, reason: errMsg(error) };
  }
}
