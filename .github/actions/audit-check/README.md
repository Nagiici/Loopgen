# loopgen audit check — GitHub Action

Gate a PR/merge on [loopgen](https://www.npmjs.com/package/loopgen) audit evidence. The action installs
the `loopgen` CLI, writes the governance rollup to the job summary (a mini dashboard), and **fails the job
when the policy isn't satisfied** — so you can require that AI-assisted changes actually ran and passed
verification, didn't touch forbidden paths, and have an intact (tamper-evident) audit chain.

## Usage

```yaml
name: loopgen audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... your job produces/commits .loopgen/audit.jsonl (via `loopgen run`) ...
      - uses: Nagiici/Loopgen/.github/actions/audit-check@v0.6.0
        with:
          require: test-repair,ci-failure-repair
          require-no-violations: "true"
          require-chain: "true"
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `project` | `.` | Directory containing `.loopgen/audit.jsonl` |
| `require` | `""` | Comma-separated loop ids that must have a passing run |
| `since` | `""` | Only consider runs at/after this ISO timestamp |
| `require-no-violations` | `false` | Fail if any run modified forbidden paths |
| `require-chain` | `true` | Fail if the audit hash chain is broken |
| `version` | `latest` | `loopgen` version to use (npm version or dist-tag) |
| `node-version` | `20` | Node.js version for the runner |

The audit log must exist in the checked-out repo (commit `.loopgen/audit.jsonl`, or run `loopgen run`
earlier in the job). Pin the action to a release tag (e.g. `@v0.6.0`).
