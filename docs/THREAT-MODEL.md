# loopgen threat model — evidence vs. proof

loopgen records what an AI-assisted change actually did: it runs your real verification commands, checks
forbidden paths, and writes a hash-chained audit ledger (`.loopgen/audit.jsonl`). How much that record is
worth depends on **where it was produced**. There are two trust tiers, and loopgen labels every run with
which one it is.

The honest one-line summary: **a local run is tamper-evident _evidence_; a CI run is a verifiable, signed
_attestation_ (proof).** Don't read more into either than this document supports.

---

## Tier 1 — `local` (the default off-CI behavior)

What you get: a sha256 **hash chain** over each audit entry. Editing any field of a past entry without
recomputing every following hash is detected by `loopgen audit verify`.

**What `local` does NOT establish — be clear-eyed about this:**

- **No root of trust.** The ledger is a plain append-only file with no external anchor. Anyone with write
  access to the repo can **delete it and re-fabricate the entire chain from scratch**; the new chain will
  verify perfectly, because verification only checks internal consistency.
- **The verification commands are repo-controlled.** They live in the loop spec in the repo. Swapping the
  real test command for `echo PASS && exit 0` produces a "passing" run. loopgen records *that the declared
  commands exited 0*, not that they were honest.
- **Identity is self-asserted.** The `actor` is read from `os.userInfo()` / `os.hostname()` — spoofable in
  seconds. Recorded git SHAs are informational, not cryptographically bound.

So a `local` run proves only: *"someone ran these commands on some machine and recorded this result."*
Useful as a working record and a tripwire for casual tampering — **not** as proof to a skeptical reviewer.

---

## Tier 2 — `attested` (produced in CI with an OIDC identity)

When `loopgen run` executes in CI with an ambient OIDC identity (e.g. GitHub Actions with
`id-token: write`) and a signer is available (cosign), it signs the audit **entry hash** keyless against
the **Sigstore / Rekor public transparency log** and writes the bundle next to the ledger
(`.loopgen/attestations/<entryId>.sigstore.json`). `loopgen audit verify --attestation` re-derives the
entry hash from the (chain-validated) ledger and verifies the signature and identity against it.

**What is now trusted (the new, external root of trust):**

- **The CI runner** that executed the verification commands.
- **The OIDC identity** — for GitHub Actions, the issuer `token.actions.githubusercontent.com` plus the
  repository and `workflow_ref`. This is an accountable identity the developer cannot mint locally.
- **The Sigstore / Rekor public transparency log** — an append-only, third-party-witnessed log. loopgen
  runs **no key infrastructure**; signing is keyless.

**What the signature binds:** the audit entry hash ⊕ the commit SHA (`shaAfter`) ⊕ the exact verification
commands and their exit codes ⊕ a hash of the loop spec ("which tests") ⊕ tree-clean status. This is the
[SLSA provenance](https://slsa.dev/spec/v1.0/provenance) model: a signed statement, by an accountable
identity, about an immutable artifact.

---

## The residual hole — named explicitly

**A fully attacker-controlled CI can still attest a doctored run.** A compromised self-hosted runner, or a
malicious workflow that legitimately holds `id-token: write`, can sign a run whose tests were rigged. The
signature proves *"this identity produced this result"*, **not** *"the work was honest."* Provenance is
**attributable accountability, not correctness** — the same boundary SLSA draws.

Mitigations (none of which loopgen can enforce for you):

- **Public accountability.** The signing identity and commit are written to a public, append-only log, so a
  forgery is attributable and after-the-fact detectable.
- **Commit binding.** The attestation names the exact commit, so anyone can re-check what was actually built.
- **Policy.** Require `runnerEnv == "github-hosted"` and pin the expected `workflow_ref`; treat self-hosted
  runners as a higher-trust surface.

---

## What still isn't in scope (carried over, unchanged)

- **`referee` mode is detection, not prevention.** It runs your verification and diffs the tree *after* a
  work session; it does not sandbox the agent or block reads.
- **`driven` mode is enforcement, not a sandbox.** It blocks forbidden-path writes and non-allowlisted
  commands at apply time and bounds iterations/bytes, but there is **no syscall, network, or process
  isolation** — an allowed command can still do anything that command can do. Driven mode also drives only
  **local** models, which are weaker at coding than frontier vendor agents; it's for local/air-gapped or
  cost-constrained use, not a headline capability.

---

## TL;DR for a reviewer deciding how much to trust a run

| | `local` | `attested` (CI) |
|---|---|---|
| Detects in-place ledger edits | ✅ | ✅ |
| Survives full ledger re-fabrication | ❌ | ✅ (signature won't match a forged hash) |
| Binds an accountable identity | ❌ | ✅ (OIDC, public log) |
| Binds the exact commit + checks | partial (unsigned) | ✅ (signed) |
| Proves the tests were *honest* | ❌ | ❌ (provenance ≠ correctness) |

Gate merges with `loopgen audit check --require-attested` (claim present) **and** `loopgen audit verify
--attestation` (signature valid) — both, because `check` is the cheap gate and `verify` is the cryptographic
one.
