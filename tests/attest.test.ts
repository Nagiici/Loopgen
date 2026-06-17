import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  buildAttestationSubject,
  createDefaultAttestor,
  detectCiProvenance,
  loadAttestationRef,
  produceAttestation,
  verifyAttestation
} from "../src/core/attest.js";
import type { Attestor, LoopSpec, VerificationResult } from "../src/core/types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loopgen-attest-"));
  roots.push(root);
  return root;
}

const loop = { id: "test-repair", verification: { commands: ["npm test"] } } as unknown as LoopSpec;
function verification(exitCode: number): VerificationResult {
  return {
    passed: exitCode === 0,
    warnings: [],
    results: [{ command: "npm test", exitCode, signal: null, timedOut: false, durationMs: 10, stdoutExcerpt: "", stderrExcerpt: "" }]
  };
}

describe("detectCiProvenance", () => {
  test("reads GitHub Actions claims and can attest only when the OIDC token endpoint is present", () => {
    const base = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "deadbeef", GITHUB_WORKFLOW_REF: "o/r/.github/workflows/ci.yml@refs/heads/main" } as NodeJS.ProcessEnv;
    const withoutOidc = detectCiProvenance(base);
    expect(withoutOidc.ci?.provider).toBe("github-actions");
    expect(withoutOidc.ci?.repo).toBe("o/r");
    expect(withoutOidc.ci?.commitSha).toBe("deadbeef");
    expect(withoutOidc.canAttest).toBe(false);

    const withOidc = detectCiProvenance({ ...base, ACTIONS_ID_TOKEN_REQUEST_URL: "u", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "t" } as NodeJS.ProcessEnv);
    expect(withOidc.canAttest).toBe(true);
  });

  test("generic CI and no-CI environments", () => {
    expect(detectCiProvenance({ CI: "true" } as NodeJS.ProcessEnv).ci?.provider).toBe("other-ci");
    expect(detectCiProvenance({ CI: "true" } as NodeJS.ProcessEnv).canAttest).toBe(false);
    const none = detectCiProvenance({} as NodeJS.ProcessEnv);
    expect(none.ci).toBeUndefined();
    expect(none.canAttest).toBe(false);
  });
});

describe("buildAttestationSubject", () => {
  test("is deterministic for the same loop + verification", () => {
    const a = buildAttestationSubject({ shaAfter: "abc", clean: true }, loop, verification(0));
    const b = buildAttestationSubject({ shaAfter: "abc", clean: true }, loop, verification(0));
    expect(a).toEqual(b);
    expect(a.commitSha).toBe("abc");
    expect(a.treeClean).toBe(true);
  });

  test("verificationDigest changes when an exit code changes", () => {
    const pass = buildAttestationSubject({ shaAfter: "abc", clean: true }, loop, verification(0));
    const fail = buildAttestationSubject({ shaAfter: "abc", clean: true }, loop, verification(1));
    expect(pass.verificationDigest).not.toBe(fail.verificationDigest);
    expect(pass.loopSpecHash).toBe(fail.loopSpecHash); // same loop spec
  });
});

describe("produce/verify via the injected Attestor seam (network- and binary-free)", () => {
  const fakeAttestor: Attestor = {
    async produce(req) {
      const dir = path.join(req.projectRoot, ".loopgen", "attestations");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${req.entryId}.sigstore.json`), JSON.stringify({ fake: true, entryHash: req.entryHash }));
      return { method: "cosign-keyless", bundlePath: path.join(".loopgen", "attestations", `${req.entryId}.sigstore.json`) };
    },
    async verify(req) {
      return req.ref.method === "none" ? { ok: false, reason: "no bundle" } : { ok: true };
    }
  };

  test("produceAttestation writes the sibling bundle and returns a ref", async () => {
    const root = await tempRoot();
    const ref = await produceAttestation({
      projectRoot: root,
      entryId: "abc",
      entryHash: "hash123",
      subject: buildAttestationSubject({ shaAfter: "abc", clean: true }, loop, verification(0)),
      attestor: fakeAttestor
    });
    expect(ref.method).toBe("cosign-keyless");
    const bundle = path.join(root, ".loopgen", "attestations", "abc.sigstore.json");
    await expect(fs.stat(bundle)).resolves.toBeDefined();
    expect((await loadAttestationRef(root, "abc")).method).toBe("cosign-keyless");
  });

  test("produceAttestation never throws — a failing signer degrades to method 'none'", async () => {
    const root = await tempRoot();
    const throwing: Attestor = {
      async produce() {
        throw new Error("signer exploded");
      },
      async verify() {
        return { ok: false };
      }
    };
    const ref = await produceAttestation({ projectRoot: root, entryId: "x", entryHash: "h", subject: buildAttestationSubject({ shaAfter: null, clean: true }, loop, verification(0)), attestor: throwing });
    expect(ref.method).toBe("none");
  });

  test("verifyAttestation passes through the injected verifier", async () => {
    const root = await tempRoot();
    const ok = await verifyAttestation({ projectRoot: root, entryHash: "h", ref: { method: "cosign-keyless", bundlePath: "b" }, attestor: fakeAttestor });
    expect(ok.ok).toBe(true);
    const missing = await verifyAttestation({ projectRoot: root, entryHash: "h", ref: { method: "none" }, attestor: fakeAttestor });
    expect(missing.ok).toBe(false);
  });
});

describe("default attestor cross-checks (short-circuit before any external binary)", () => {
  test("rejects a predicate whose signed entryHash does not match the live entry hash", async () => {
    const root = await tempRoot();
    const dir = path.join(root, ".loopgen", "attestations");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "id1.predicate.json"), JSON.stringify({ entryHash: "AAA", ci: { repo: "o/r" } }));
    await fs.writeFile(path.join(dir, "id1.sigstore.json"), "{}"); // bundle presence only
    const ref = await loadAttestationRef(root, "id1");
    const attestor = createDefaultAttestor();
    const mismatch = await attestor.verify({ projectRoot: root, entryHash: "BBB", ref });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reason).toMatch(/entryHash/);
  });

  test("loadAttestationRef returns method 'none' when no bundle exists", async () => {
    const root = await tempRoot();
    expect((await loadAttestationRef(root, "missing")).method).toBe("none");
  });
});
