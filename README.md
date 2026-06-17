# loopgen

[![npm version](https://img.shields.io/npm/v/loopgen.svg)](https://www.npmjs.com/package/loopgen)
[![CI](https://github.com/Nagiici/Loopgen/actions/workflows/ci.yml/badge.svg)](https://github.com/Nagiici/Loopgen/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**AI coding assistants can make unlimited changes. loopgen generates the guardrails.**

loopgen scans your project and generates bounded, inspectable **agent loop** configs — so your own
CI, tests, and lint verify every iteration before it goes further. Works with Claude Code, Codex,
Cursor, and local models (Ollama, LM Studio, llama.cpp).

```bash
npx loopgen init      # opens a local wizard in demo mode — no setup, nothing written to your project
```

> **What's a "loop"?** A bounded, verifiable cycle: make the smallest change → run your verification
> commands → log what happened to a state file → stop or repeat, up to a hard iteration limit.

- 🛡️ **Safety by default** — bounded iterations (default 3), required verification, forbidden secret
  paths, maker/checker separation, and a state-file audit log.
- 🔌 **Tool-agnostic** — one scan generates config for Codex, Claude, Cursor, and local runtimes.
- 🏠 **Local-first** — no telemetry, no cloud calls; API keys are referenced by env-var name only.

<!-- TODO: add a 15s demo GIF of the wizard (scan → preview diff → apply) here. -->

📖 中文说明见 [中文](#中文) · English documentation [below](#english).

---

## 中文

### 项目简介

`loopgen` 会扫描你的项目，推断语言、包管理器、测试/构建命令和 CI 配置，然后生成一组可审查的 loop 文件：

- 通用 `.loopgen/playbooks/*.md`：不依赖任何特定 AI 工具，适合先理解 loop engineering 的工作方式。
- Codex 配置：`.codex/skills/*`、`.codex/automations/*`、checker agent。
- Claude 配置：`.claude/skills/*`、`.claude/loops/*`、checker notes。
- 本地/开源模型适配器：Ollama 与 OpenAI-compatible server（例如 LM Studio、llama.cpp）的配置和 runbook。
- 状态记录：`.loopgen/state/*.md`，用于记录每次循环尝试、结果和阻塞点。

核心目标是降低使用门槛：你可以先用内置 demo 项目预览效果，不需要接入真实项目，也不会写入真实项目文件。

### 适合谁先尝试

如果你有一个带 npm scripts 和 GitHub Actions 的 TypeScript/Node 项目，并且已经在用 Claude Code、Codex 或
Cursor，loopgen 能自动识别你的 test/lint/build 命令，并在 5 分钟内生成可直接使用的 agent 配置。其他角色（QA、
Ops、Product 等）也有对应模板。

### 快速上手

#### 最快方式：npx（无需克隆）

```bash
npx loopgen init      # 在 demo 模式下打开本地向导，无需配置，也不会写入文件
```

#### 从源码运行（开发场景）

```bash
npm install
npm run build
npm run loopgen -- scan --demo
npm run loopgen -- preview --demo
```

`--demo` 会使用内置示例项目 `examples/demo-webapp`，只生成预览，不会写入你的真实项目。

#### 3. 启动本地 Web 向导

```bash
npm run loopgen -- init .
```

打开终端中打印的本地地址，通常是：

```text
http://127.0.0.1:8787
```

在 Web 向导中：

1. 选择 **Try demo**：快速查看 loop engineering 的效果。
2. 选择 **Use my project**：扫描真实项目。
3. 点击 **Choose folder** 从本地桌面选择项目目录，或手动粘贴项目路径。
4. 按角色或场景选择模板。
5. 点击 **Generate preview** 查看 diff。
6. 确认无误后再点击 **Apply files** 写入项目。

#### 4. 在真实项目中生成预览

```bash
npm run loopgen -- scan .
npm run loopgen -- preview . --templates test-repair --adapters codex,claude
```

生成 Ollama runbook：

```bash
npm run loopgen -- preview . \
  --templates test-repair \
  --adapters ollama \
  --ollama-model llama3.1
```

生成 LM Studio 或 llama.cpp 等 OpenAI-compatible runbook：

```bash
npm run loopgen -- preview . \
  --templates test-repair \
  --adapters openai-compatible \
  --openai-compatible-model qwen2.5-coder \
  --openai-compatible-base-url http://localhost:1234/v1
```

`loopgen` 只生成配置和运行手册，不会自动调用本地模型。API key 只通过环境变量名引用，不会把密钥值写入文件。

#### 5. 确认后写入文件

```bash
npm run loopgen -- apply . --templates test-repair --adapters codex,claude
```

如果你已经确认 diff，可以使用：

```bash
npm run loopgen -- apply . --templates test-repair --adapters codex,claude --yes
```

### 常用命令

```bash
npm run loopgen -- init [project]
npm run loopgen -- scan --demo
npm run loopgen -- scan [project] --json
npm run loopgen -- preview --demo
npm run loopgen -- preview [project] --templates all --adapters codex,claude
npm run loopgen -- preview [project] --templates test-repair --adapters ollama --ollama-model llama3.1
npm run loopgen -- preview [project] --templates test-repair --adapters openai-compatible --openai-compatible-model qwen2.5-coder
npm run loopgen -- apply [project] --templates all --adapters codex,claude
```

`apply` 会先展示 diff。没有 `--yes` 时，它会要求你确认后才写入文件。

可用 adapter：

- `agents-md`：通用 `AGENTS.md`，可被 Claude Code、Codex、Cursor、Copilot、Gemini CLI、Aider 等读取
- `codex`
- `claude`
- `cursor`：`.cursor/rules/*.mdc` 规则
- `windsurf`：`.windsurfrules`
- `ollama`
- `openai-compatible`

本地模型参数：

- `--ollama-model`
- `--ollama-base-url`，默认 `http://localhost:11434`
- `--openai-compatible-model`
- `--openai-compatible-base-url`，常见值包括 LM Studio 的 `http://localhost:1234/v1` 和 llama.cpp 的 `http://localhost:8080/v1`
- `--openai-compatible-api-key-env`，只填写环境变量名，例如 `LOCAL_LLM_API_KEY`

### 模板场景

当前模板库覆盖五类技术协作场景：

- **Maintenance**：CI 修复、测试修复、依赖升级、PR 评论处理。
- **Delivery**：发布准备、变更日志生成、回滚检查、版本升级检查。
- **Quality**：类型错误收敛、lint 清理、测试覆盖补洞、死代码清理。
- **Knowledge**：README 更新、架构说明、onboarding 指南、决策记录。
- **Cross-functional**：需求澄清、QA 验收清单、数据处理检查、客户问题复盘。

### 生成文件

`loopgen` 会生成一组小而可审查的文件：

- `.loopgen/loopgen.loop.yaml`：中间 loop 表示。
- `.loopgen/playbooks/*.md`：通用 loop playbook。
- `.loopgen/state/*.md`：循环状态、尝试记录和阻塞点。
- `AGENTS.md`：通用 agent 指令文件，可被大多数 AI 编码工具读取。
- `.codex/skills/*`、`.codex/automations/*`、`.codex/agents/*`：Codex 适配输出。
- `.claude/skills/*`、`.claude/loops/*`、`.claude/agents/*`：Claude 适配输出。
- `.cursor/rules/*.mdc` 与 `.windsurfrules`：Cursor 与 Windsurf 规则。
- `.loopgen/adapters/ollama/config.json` 与 `.loopgen/adapters/ollama/*.md`：Ollama 本地运行时配置和 runbook。
- `.loopgen/adapters/openai-compatible/config.json` 与 `.loopgen/adapters/openai-compatible/*.md`：OpenAI-compatible server 配置和 runbook。

默认安全策略包括：有限迭代、maker/checker 分离、必须验证、禁止读取敏感路径、状态文件记录。

本地模型 runbook 会包含 loop 目标、上下文来源、验证命令、停止条件、状态文件路径、模型提示词模板，以及对应运行时的 `curl` 示例。

### 故障排查

- 如果没有推断出验证命令，生成的 loop 会进入 draft 模式，并带有 TODO 验证命令。
- 如果选择了 Ollama 或 OpenAI-compatible adapter 但没有填写模型名，`loopgen` 仍会生成文件，并在 config 和 runbook 中留下 warning/TODO。
- 如果 Web 向导提示缺少静态资源，请先运行 `npm run build`。
- Demo 模式只能预览，不能写入文件；需要写入时请切换到 **Use my project**。
- 如果 loop 尝试读取 `.env`、生产密钥或 credential 文件，应立即停止并视为安全违规。
- 如果同一失败在最大迭代次数后仍重复出现，应停止并请求人工输入。

### 贡献模板

新增模板时，请修改 `src/core/templates.ts`，补充目标、上下文、步骤、验证命令、停止条件和模板元数据，并为生成结果添加测试。模板应保持明确、有限、可审查。

---

## English

### Overview

`loopgen` scans a project, infers the language, package manager, verification commands and CI setup, then generates inspectable loop engineering files:

- Tool-agnostic `.loopgen/playbooks/*.md` files for anyone who wants to understand the loop before using an agent tool.
- Codex outputs: `.codex/skills/*`, `.codex/automations/*`, and checker agents.
- Claude outputs: `.claude/skills/*`, `.claude/loops/*`, and checker notes.
- Local/open-source model adapters: config and runbooks for Ollama and OpenAI-compatible servers such as LM Studio and llama.cpp.
- State files: `.loopgen/state/*.md` for recording attempts, outcomes and blockers.

The product goal is low-friction adoption. You can start with the built-in demo project, preview generated loops, and learn the value of loop engineering without writing to your real project.

### Why loopgen?

Most AI coding agents optimize for speed and run with broad permissions. loopgen makes the opposite
trade-off the **default**, so an agent's work stays reviewable:

- **Bounded iterations** (default 3) — the loop stops instead of grinding forever.
- **Required verification** — success is defined by your real `test`/`lint`/`build` commands, not the model's say-so.
- **Forbidden secret paths** — `.env`, `secrets/**`, and credential files are off-limits by construction.
- **Maker/checker separation** — a separate checker reviews the diff and verification output before continuing.
- **State-file audit log** — every attempt, outcome, and blocker is written to `.loopgen/state/*.md`.

### Who should start here

If you have a TypeScript/Node project with npm scripts and GitHub Actions and you already use Claude
Code, Codex, or Cursor, loopgen auto-detects your `test`/`lint`/`build` commands and generates
ready-to-use agent configs in under five minutes. Other roles (QA, Ops, Product, Data) have matching
templates too.

### What you get

A small, inspectable set of files. For example, a generated Codex skill looks like:

```markdown
---
name: loopgen-test-repair
description: Diagnose failing tests in my-app, fix the underlying issue, and verify the relevant suite.
---

# Test repair

## Verify
- `npm run test`

## Stop conditions
- A verification command is missing or undefined.
- The same failure repeats after the maximum iteration count.

State file: `.loopgen/state/test-repair.md`
Maximum iterations: 3
```

### Quick Start

#### Fastest: npx (no clone required)

```bash
npx loopgen init      # opens the local wizard in demo mode — no setup, nothing written
```

#### From source (development)

```bash
npm install
npm run build
npm run loopgen -- scan --demo
npm run loopgen -- preview --demo
```

`--demo` uses the built-in `examples/demo-webapp` fixture. It is preview-only and will not write files to your real project.

#### 3. Start the local Web wizard

```bash
npm run loopgen -- init .
```

Open the printed local URL, usually:

```text
http://127.0.0.1:8787
```

In the wizard:

1. Choose **Try demo** to see loop engineering outputs quickly.
2. Choose **Use my project** to scan a real project.
3. Click **Choose folder** to select a local project directory, or paste the project path manually.
4. Filter templates by role or category.
5. Click **Generate preview** to inspect the diff.
6. Click **Apply files** only after reviewing the generated files.

#### 4. Preview loops for a real project

```bash
npm run loopgen -- scan .
npm run loopgen -- preview . --templates test-repair --adapters codex,claude
```

Generate Ollama runbooks:

```bash
npm run loopgen -- preview . \
  --templates test-repair \
  --adapters ollama \
  --ollama-model llama3.1
```

Generate LM Studio, llama.cpp, or other OpenAI-compatible runbooks:

```bash
npm run loopgen -- preview . \
  --templates test-repair \
  --adapters openai-compatible \
  --openai-compatible-model qwen2.5-coder \
  --openai-compatible-base-url http://localhost:1234/v1
```

`loopgen` only generates configuration and runbooks. It does not execute local models automatically. API keys are referenced by environment variable name only; secret values are never written into generated files.

#### 5. Apply after review

```bash
npm run loopgen -- apply . --templates test-repair --adapters codex,claude
```

If you already reviewed the diff:

```bash
npm run loopgen -- apply . --templates test-repair --adapters codex,claude --yes
```

### CLI

```bash
npm run loopgen -- init [project]
npm run loopgen -- scan --demo
npm run loopgen -- scan [project] --json
npm run loopgen -- preview --demo
npm run loopgen -- preview [project] --templates all --adapters codex,claude
npm run loopgen -- preview [project] --templates test-repair --adapters ollama --ollama-model llama3.1
npm run loopgen -- preview [project] --templates test-repair --adapters openai-compatible --openai-compatible-model qwen2.5-coder
npm run loopgen -- apply [project] --templates all --adapters codex,claude
```

`apply` always shows a diff first. Without `--yes`, it asks for confirmation before writing files.

Available adapters:

- `agents-md` — one `AGENTS.md` read by Claude Code, Codex, Cursor, Copilot, Gemini CLI, Aider, and more
- `codex`
- `claude`
- `cursor` — `.cursor/rules/*.mdc` rules
- `windsurf` — a `.windsurfrules` file
- `ollama`
- `openai-compatible`

Local model flags:

- `--ollama-model`
- `--ollama-base-url`, defaulting to `http://localhost:11434`
- `--openai-compatible-model`
- `--openai-compatible-base-url`, commonly `http://localhost:1234/v1` for LM Studio or `http://localhost:8080/v1` for llama.cpp
- `--openai-compatible-api-key-env`, an environment variable name such as `LOCAL_LLM_API_KEY`

### Template Library

The current library covers five categories:

- **Maintenance**: CI failure repair, test repair, dependency upgrade, PR comment handling.
- **Delivery**: release preparation, changelog generation, rollback checks, version upgrade checks.
- **Quality**: type error reduction, lint cleanup, coverage gap fill, dead code cleanup.
- **Knowledge**: README refresh, architecture notes, onboarding guides, decision records.
- **Cross-functional**: requirements clarification, QA acceptance checklists, data processing checks, customer issue retros.

### Generated Files

`loopgen` writes a small, inspectable set of files:

- `.loopgen/loopgen.loop.yaml`: intermediate loop representation.
- `.loopgen/playbooks/*.md`: tool-agnostic loop playbooks.
- `.loopgen/state/*.md`: attempts, outcomes and blockers.
- `AGENTS.md`: a universal agent instruction file read by most AI coding tools.
- `.codex/skills/*`, `.codex/automations/*`, `.codex/agents/*`: Codex-oriented outputs.
- `.claude/skills/*`, `.claude/loops/*`, `.claude/agents/*`: Claude-oriented outputs.
- `.cursor/rules/*.mdc` and `.windsurfrules`: Cursor and Windsurf rules.
- `.loopgen/adapters/ollama/config.json` and `.loopgen/adapters/ollama/*.md`: Ollama runtime config and runbooks.
- `.loopgen/adapters/openai-compatible/config.json` and `.loopgen/adapters/openai-compatible/*.md`: OpenAI-compatible runtime config and runbooks.

Generated loops include safety defaults: bounded iterations, maker/checker separation, required verification, forbidden secret paths and state-file logging.

Local model runbooks include the loop goal, context sources, verification commands, stop criteria, state-file path, a model prompt template and a runtime-specific `curl` example.

### Troubleshooting

- If no verification command is inferred, generated loops stay in draft mode with a TODO verification command.
- If you select Ollama or OpenAI-compatible adapters without a model name, `loopgen` still generates files and adds warnings/TODOs to the config and runbook.
- If the Web wizard says assets are missing, run `npm run build`.
- Demo mode is preview-only. Switch to **Use my project** before applying files.
- If a loop tries to read `.env`, production secrets or credential files, stop and treat it as a safety violation.
- If the same failure repeats after the maximum iteration count, stop and ask for human input.

### Contributing Templates

Add template definitions in `src/core/templates.ts`, including the goal, context sources, steps, verification commands, stop conditions and template metadata. Add tests for generated outputs. Keep templates explicit, bounded and easy to inspect.
