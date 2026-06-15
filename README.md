# loopgen

`loopgen` is a local-first loop engineering generator for developers and small teams. It scans a project, asks for the few decisions it cannot infer, previews the files it would write, and generates Codex/Claude-ready loop configuration.

The MVP focuses on maintenance loops:

- CI failure repair
- Test repair
- Dependency upgrade
- PR comment handling

## 10-minute quick start

```bash
npm install
npm run build
npm run loopgen -- scan .
npm run loopgen -- preview .
npm run loopgen -- apply . --yes
```

To use the local Web wizard:

```bash
npm run build
npm run loopgen -- init .
```

Open the printed local URL, review the project scan, choose templates and adapters, then generate a preview before applying files.

## CLI

```bash
loopgen init [project]
loopgen scan [project] --json
loopgen create [template|all] [project]
loopgen preview [project] --templates test-repair --adapters codex,claude
loopgen apply [project] --templates all --adapters codex,claude
```

`apply` always shows a diff first. Without `--yes`, it asks for confirmation before writing files.

## Generated files

`loopgen` writes a small, inspectable set of files:

- `.loopgen/loopgen.loop.yaml` contains the intermediate loop representation.
- `.loopgen/state/*.md` records loop attempts and outcomes.
- `.codex/skills/*` and `.codex/automations/*` contain Codex-oriented prompts and skills.
- `.claude/skills/*` and `.claude/loops/*` contain Claude-oriented skills and loop guides.

Generated loops include safety defaults: bounded iterations, maker/checker separation, required verification, forbidden secret paths, and state-file logging.

## Template examples

### CI failure repair

Uses CI workflow files, local lint/test/build commands, and a checker agent to keep the repair narrow.

### Test repair

Focuses on reproducing failing tests and fixing source behavior instead of weakening assertions.

### Dependency upgrade

Allows network access, updates dependencies in controlled batches, and requires verification after install/build/test.

### PR comment handling

Classifies review comments, implements actionable fixes, and records responses in the state file.

## Troubleshooting

- If no verification command is inferred, generated loops stay in draft mode with a TODO command.
- If the Web wizard says assets are missing, run `npm run build` first.
- If a loop tries to touch `.env`, production secrets, or credential files, stop and treat it as a safety violation.
- If the same failure repeats after the maximum iteration count, stop and ask for human input.

## Contributing templates

Add a template definition in `src/core/templates.ts`, include verification commands and stop criteria, then add adapter coverage and tests. Keep templates explicit, bounded, and easy to inspect.
