# YourTutor — Project Charter & Engineering Rules (AGENTS.md)

**YourTutor** 是一个面向考生的开源、跨平台（Windows / macOS / Linux / Android）、本地优先（Local-First）学习应用——「AI 考题反推高分私教」。
核心理念：考生导入或拍照上传考试题目后，系统通过 AI 反向拆解考点、前置知识链、命题陷阱与阅卷采分点，自动规划分课时渐进式课程，支持实时切换讲课风格与详细程度，持续追踪学情掌握度并像一对一家教一样针对性出题，帮助考生高效拿高分。

---

## 1. 架构分层红线（严格遵守 Monorepo 解耦，四端共享核心与 UI）
- `packages/core`：纯 TypeScript 核心引擎（统一 Provider 网关、教研状态机、Prompt Pack 教研包、Zod 校验与数据模型）。**严禁引入任何 Electron、Capacitor 或浏览器 DOM 依赖**。
- `packages/storage`：基于 Drizzle ORM 的本地持久化层与抽象存储驱动接口（桌面端接入 SQLite，安卓端接入 `@capacitor-community/sqlite`），负责课程、考题反推结果、课时规划、对话、学情掌握度档案（Mastery Profile）、错题与防坑本的持久化与自动迁移。
- `packages/ui`：桌面端与安卓端**共享的响应式 React + Tailwind CSS + shadcn/ui + KaTeX 界面层**，通过抽象 `AppBridge` 接口与宿主通信（桌面三栏布局 / 手机端底部导航布局自适应），严禁在 UI 中直接操作文件系统、CLI 或数据库。
- `apps/desktop`：Electron（主进程 + Preload IPC）桌面端外壳，提供本机 CLI 调度、系统钥匙串密钥加密（`safeStorage`）、剪贴板截图粘题以及可选的 **Companion Bridge 本地伴侣服务**（供安卓端扫码连接）。
- `apps/mobile`：Capacitor 原生 **Android** 外壳，复用 `packages/ui` 与 `packages/core`，提供摄像头拍题/相册选图、Android Keystore 密钥安全存储、移动端 SQLite 存储以及桌面/服务器伴侣扫码桥接。
- **状态与模型解耦**：课时进度、学情掌握度、历史错因全部持久化在本地数据库，每次调用模型时动态注入上下文。考生在中途切换任意订阅或模型 API 后，教学状态必须无缝延续。

---

## 2. 多 Provider 接入与安全合规底线
所有模型源必须实现统一接口 `TutorProvider`（`streamChat`、`generateStructured`、`healthCheck`、`listModels`、`AbortSignal`）：

1. **本地订阅 CLI / SDK 轨道（桌面端 / 自托管服务器 BYO-Subscription）**：
   - **Antigravity**：调用官方 `agy -p --output-format stream-json`（支持 `--model`、`--effort`）。
   - **OpenAI Codex**：调用官方 `codex exec --json` 或 `@openai/codex-sdk`。
   - **Claude Code**：调用官方 `claude -p --output-format stream-json` 或官方 Claude Agent SDK。
2. **标准模型 API 轨道（桌面端 & 安卓端通用 BYO-API）**：
   - 原生支持 OpenAI、Anthropic、Google Gemini 官方 API；
   - 原生支持所有 OpenAI-Compatible 接口（DeepSeek、Qwen、OpenRouter、Ollama、LM Studio、vLLM 等）。
3. **移动端伴侣桥接轨道（Android Companion Bridge）**：
   - 因 Android 无法直接运行 PC/Linux 命令行工具，安卓端除独立直连各类标准 API 外，还提供 `CompanionBridgeProvider`：通过局域网或用户自托管地址 + 随机配对 Token（二维码配对），安全调用用户自有桌面端/服务器上已登录的 Antigravity / Codex / Claude Code 订阅，并支持跨端同步学习进度与错题档案。
4. **安全与合规铁律**：
   - **绝不破解/窃取/伪造**任何厂商的私有 OAuth Token 或未公开私有接口，100% 走官方 CLI / SDK 或官方 API。
   - **CLI 安全沙箱**：调用 `agy` / `codex` / `claude` 进行教学推理时，必须强制使用隔离的空临时工作目录，禁用文件写入与 Shell 执行等工具权限（无工具/只读模式，如 Claude Code 使用 `--bare` 并禁用写工具），防止误操作考生本机文件。
   - **密钥加密**：桌面端使用 Electron `safeStorage`、安卓端使用 Android Keystore 加密存储 API Key 与伴侣配对 Token，严禁明文落盘或打印到日志。

---

## 3. 云端开发友好与高频迭代规范
- **云端无头环境可开发、可预览**：
  - 必须支持纯浏览器预览模式 `pnpm dev:web`（通过 Mock `AppBridge` 在无 Electron/Android 环境的 Linux 云端正常运行全部 UI，并支持一键切换桌面视图与移动端视口预览），确保 Antigravity Remote Agents / SSH 云端开发时能顺畅调试界面。
  - 核心逻辑与存储层必须具备完善的 Vitest 单元测试，云端改动后直接通过 `pnpm typecheck && pnpm lint && pnpm test` 自证正确。
- **UI 易改版架构**：
  - 所有主题色、圆角、字号、间距通过 CSS Variables（Design Tokens）集中定义；
  - `packages/ui` 按业务域拆分独立模块（`features/import`、`features/syllabus`、`features/classroom`、`features/mastery`、`features/settings`），一次修改同步生效于桌面端与安卓端。
- **功能易扩展与数据兼容**：
  - 新增模型 Provider：仅在 `packages/core/src/providers/` 新增独立适配器并注册；
  - 新增考试学科模板：仅在 `packages/core/src/packs/` 新增教研包配置（内置核心教研提示词参考 `docs/tutor-prompt.md`）；
  - 新增学习工具面板（如错题本导出、Anki 闪卡、模拟考场、TTS 语音）：通过导航注册表挂载；
  - 数据库变更一律通过 Drizzle Migration 自动增量升级，确保老用户升级版本时不丢失历史学情与错题数据。

---

## 4. 云端 CI/CD 与四端自动构建规范
- `.github/workflows/ci.yml`：Push / PR 自动运行类型检查、Lint 与单元测试。
- `.github/workflows/release.yml`：打 `v*` 标签或手动触发时，云端并行构建四端安装包并自动发布至 GitHub Releases：
  - `windows-latest` → Windows `.exe` 安装包
  - `macos-latest` → macOS `.dmg`（`arm64` / `x64`）
  - `ubuntu-latest` → Linux `.AppImage` + **Android `.apk`**（使用内置 Android SDK 与 Gradle 构建；签名证书/Keystore 均通过 GitHub Secrets 可选注入，未配置时默认产出开源未签名/调试签名包不阻塞发版）。
- 保持中英双语 `README`、清晰 `CONTRIBUTING.md` 与 MIT 开源协议。
