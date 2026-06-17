# Releasing loopgen

loopgen publishes to npm automatically when a `v*` tag is pushed (see
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml)). This guide covers the
one-time setup and the per-release steps.

## One-time setup: npm Trusted Publishing (OIDC)

No token is needed — the workflow authenticates to npm via GitHub Actions OIDC (more secure than a
long-lived `NPM_TOKEN`). Configure the trusted publisher once:

1. On [npmjs.com/package/loopgen](https://www.npmjs.com/package/loopgen) → **Settings** →
   **Trusted Publisher** → select **GitHub Actions**.
2. Fill in exactly (placeholders are not values — type each one):
   - **Organization or user:** `Nagiici`
   - **Repository:** `Loopgen` (just the name, not a URL)
   - **Workflow filename:** `publish.yml` (filename only, no `.github/workflows/` path)
   - **Environment name:** leave empty
3. Keep **Allow npm publish** checked, then click **Save changes**.

The workflow (`.github/workflows/publish.yml`) has `id-token: write`, upgrades npm to a version that
supports trusted publishing, runs `npm publish --provenance`, and skips if the version is already on
npm — no `NPM_TOKEN` secret required.

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
