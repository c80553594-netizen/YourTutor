# YourTutor — Project Charter & Engineering Rules (AGENTS.md)

**YourTutor** 是一个面向考生的开源、跨平台、本地优先（Local-First）桌面学习应用——「AI 考题反推高分私教」。
核心理念：考生导入考试题目后，系统通过 AI 反向拆解考点、前置知识链、命题陷阱与阅卷采分点，自动规划分课时渐进式课程，支持实时切换讲课风格与详细程度，持续追踪学情掌握度并像一对一家教一样针对性出题，帮助考生高效拿高分。

---

## 1. 架构分层红线（严格遵守 Monorepo 解耦）
- `packages/core`：纯 TypeScript 核心引擎（统一 Provider 网关、教研状态机、Prompt Pack 教研包、Zod 校验与数据模型）。**严禁引入任何 Electron 或浏览器 DOM 依赖**。
- `packages/storage`：SQLite + Drizzle ORM，负责课程、考题反推结果、课时规划、对话、学情掌握度档案（Mastery Profile）、错题与防坑本的本地持久化与自动迁移。
- `apps/desktop`：Electron（主进程 + Preload IPC）+ React + Vite + Tailwind CSS + shadcn/ui + KaTeX，仅作为展示与系统能力外壳。
- **状态与模型解耦**：课时进度、学情掌握度、历史错因全部持久化在 SQLite，每次调用模型时动态注入上下文。考生在中途切换任意订阅或模型 API 后，教学状态必须无缝延续。

---

## 2. 多 Provider 接入与安全合规底线
所有模型源必须实现统一接口 `TutorProvider`（`streamChat`、`generateStructured`、`healthCheck`、`listModels`、`AbortSignal`）：

1. **本地订阅 CLI / SDK 轨道（BYO-Subscription）**：
   - **Antigravity**：调用官方 `agy -p --output-format stream-json`（支持 `--model`、`--effort`）。
   - **OpenAI Codex**：调用官方 `codex exec --json` 或 `@openai/codex-sdk`。
   - **Claude Code**：调用官方 `claude -p --output-format stream-json` 或官方 Claude Agent SDK。
2. **标准模型 API 轨道（BYO-API）**：
   - 原生支持 OpenAI、Anthropic、Google Gemini 官方 API；
   - 原生支持所有 OpenAI-Compatible 接口（DeepSeek、Qwen、OpenRouter、Ollama、LM Studio、vLLM 等）。
3. **安全与合规铁律**：
   - **绝不破解/窃取/伪造**任何厂商的私有 OAuth Token 或未公开私有接口，100% 走官方 CLI / SDK 或官方 API。
   - **CLI 安全沙箱**：调用 `agy` / `codex` / `claude` 进行教学推理时，必须强制使用隔离的空临时工作目录，禁用文件写入与 Shell 执行等工具权限（无工具/只读模式，如 Claude Code 使用 `--bare` 并禁用写工具），防止误操作考生本机文件。
   - **密钥加密**：所有 API Key 必须通过 Electron `safeStorage`（系统钥匙串/DPAPI）加密存储，严禁明文落盘或打印到日志。

---

## 3. 云端开发友好与高频迭代规范
- **云端无头环境可开发、可预览**：
  - 渲染层必须支持纯浏览器预览模式 `pnpm dev:web`（通过 Mock IPC 适配器在无 Electron 窗口的 Linux 云端环境正常运行全部 UI 与模拟数据），确保 Antigravity Remote Agents / SSH 云端开发时能顺畅调试界面。
  - 核心逻辑与存储层必须具备完善的 Vitest 单元测试，云端改动后直接通过 `pnpm typecheck && pnpm lint && pnpm test` 自证正确。
- **UI 易改版架构**：
  - 所有主题色、圆角、字号、间距通过 CSS Variables（Design Tokens）集中定义；
  - 前端严格按业务域拆分独立模块（`features/import`、`features/syllabus`、`features/classroom`、`features/mastery`、`features/settings`），禁止在 UI 组件中硬编码 Prompt 或直接操作 SQLite。
- **功能易扩展与数据兼容**：
  - 新增模型 Provider：仅在 `packages/core/src/providers/` 新增独立适配器并注册；
  - 新增考试学科模板：仅在 `packages/core/src/packs/` 新增教研包配置（内置核心教研提示词参考 `docs/tutor-prompt.md`）；
  - 新增学习工具面板（如错题本导出、Anki 闪卡、模拟考场、TTS 语音）：通过侧边栏注册表挂载；
  - 数据库变更一律通过 Drizzle Migration 自动增量升级，确保老用户升级软件时不丢失历史学情与错题数据。

---

## 4. 云端 CI/CD 与开源规范
- `.github/workflows/ci.yml`：Push / PR 自动运行类型检查、Lint 与单元测试。
- `.github/workflows/release.yml`：打 `v*` 标签或手动触发时，在 `windows-latest`、`macos-latest`、`ubuntu-latest` 三端云端并行打包 `.exe` / `.dmg` / `.AppImage` 并发布至 GitHub Releases（签名证书通过 GitHub Secrets 可选注入，未配置时默认产出开源未签名包不阻塞发版）。
- 保持中英双语 `README`、清晰 `CONTRIBUTING.md` 与 MIT 开源协议。
