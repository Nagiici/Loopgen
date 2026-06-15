# loopgen

`loopgen` is a local-first loop engineering generator.

`loopgen` 是一个本地优先的 Loop Engineering 生成器，帮助开发者和技术相关角色快速体验、生成并落地可验证的 agent loop。

- 中文说明见：[中文](#中文)
- English documentation: [English](#english)

---

## 中文

### 项目简介

`loopgen` 会扫描你的项目，推断语言、包管理器、测试/构建命令和 CI 配置，然后生成一组可审查的 loop 文件：

- 通用 `.loopgen/playbooks/*.md`：不依赖任何特定 AI 工具，适合先理解 loop engineering 的工作方式。
- Codex 配置：`.codex/skills/*`、`.codex/automations/*`、checker agent。
- Claude 配置：`.claude/skills/*`、`.claude/loops/*`、checker notes。
- 状态记录：`.loopgen/state/*.md`，用于记录每次循环尝试、结果和阻塞点。

核心目标是降低使用门槛：你可以先用内置 demo 项目预览效果，不需要接入真实项目，也不会写入真实项目文件。

### 快速上手

#### 1. 安装依赖并构建

```bash
npm install
npm run build
```

#### 2. 用内置 demo 快速体验

```bash
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
npm run loopgen -- apply [project] --templates all --adapters codex,claude
```

`apply` 会先展示 diff。没有 `--yes` 时，它会要求你确认后才写入文件。

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
- `.codex/skills/*`、`.codex/automations/*`、`.codex/agents/*`：Codex 适配输出。
- `.claude/skills/*`、`.claude/loops/*`、`.claude/agents/*`：Claude 适配输出。

默认安全策略包括：有限迭代、maker/checker 分离、必须验证、禁止读取敏感路径、状态文件记录。

### 故障排查

- 如果没有推断出验证命令，生成的 loop 会进入 draft 模式，并带有 TODO 验证命令。
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
- State files: `.loopgen/state/*.md` for recording attempts, outcomes and blockers.

The product goal is low-friction adoption. You can start with the built-in demo project, preview generated loops, and learn the value of loop engineering without writing to your real project.

### Quick Start

#### 1. Install and build

```bash
npm install
npm run build
```

#### 2. Try the built-in demo

```bash
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
npm run loopgen -- apply [project] --templates all --adapters codex,claude
```

`apply` always shows a diff first. Without `--yes`, it asks for confirmation before writing files.

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
- `.codex/skills/*`, `.codex/automations/*`, `.codex/agents/*`: Codex-oriented outputs.
- `.claude/skills/*`, `.claude/loops/*`, `.claude/agents/*`: Claude-oriented outputs.

Generated loops include safety defaults: bounded iterations, maker/checker separation, required verification, forbidden secret paths and state-file logging.

### Troubleshooting

- If no verification command is inferred, generated loops stay in draft mode with a TODO verification command.
- If the Web wizard says assets are missing, run `npm run build`.
- Demo mode is preview-only. Switch to **Use my project** before applying files.
- If a loop tries to read `.env`, production secrets or credential files, stop and treat it as a safety violation.
- If the same failure repeats after the maximum iteration count, stop and ask for human input.

### Contributing Templates

Add template definitions in `src/core/templates.ts`, including the goal, context sources, steps, verification commands, stop conditions and template metadata. Add tests for generated outputs. Keep templates explicit, bounded and easy to inspect.
