# Releasing loopgen

loopgen publishes to npm automatically when a `v*` tag is pushed (see
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml)). This guide covers the
one-time setup and the per-release steps.

## One-time setup: an npm token for CI

1. On [npmjs.com](https://www.npmjs.com), go to your avatar → **Access Tokens** →
   **Generate New Token** → **Granular Access Token**.
2. Name it `loopgen-ci-publish` and set an expiration (e.g. 90 days).
3. Under **Packages and scopes**, set **Permissions: Read and write**, and scope it to **only**
   the `loopgen` package (least privilege).
4. Generate the token and copy it (shown once). A granular write token can publish from CI
   **without a 2FA one-time code**.
5. Add it as a repository secret named `NPM_TOKEN` — do not paste it anywhere public:
   ```bash
   gh secret set NPM_TOKEN --repo Nagiici/Loopgen   # paste the token at the prompt
   ```
   Or via GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
6. Verify it exists:
   ```bash
   gh secret list --repo Nagiici/Loopgen            # should list NPM_TOKEN
   ```

The publish workflow already references `secrets.NPM_TOKEN`, publishes with provenance, and skips
if the version is already on npm — no workflow changes needed.

## Each release

1. Make sure the working tree is clean (`git status`) on an up-to-date `main`.
2. Bump the version — this also commits and creates the tag:
   ```bash
   npm version patch -m "loopgen v%s"   # 0.1.0 -> 0.1.1 (use minor/major as appropriate)
   ```
3. Push the commit and the tag:
   ```bash
   git push origin main
   git push origin v0.1.1
   ```
   Pushing the tag triggers the publish workflow, which builds, tests, and runs `npm publish`
   (no OTP needed).
4. Verify:
   ```bash
   gh run list --repo Nagiici/Loopgen --limit 3     # the "Publish" run should be success
   npm view loopgen version                          # shows the new version
   ```

## Notes

- The new version must be **greater** than the published one, or the registry rejects it (and the
  workflow's idempotency guard skips publishing).
- When the token expires, regenerate it and re-run `gh secret set NPM_TOKEN`.
- Manual fallback (requires your 2FA): from the repo root, `npm publish --otp=<code>`
  (a recovery code also works in place of `<code>`).
