# 阶段二开发提示词：共享响应式 UI、Electron 桌面端、伴侣服务与桌面三端打包

阶段一的核心引擎（`packages/core`）与持久化层（`packages/storage`）已就绪。请严格遵循 `AGENTS.md`，为 **YourTutor** 执行【阶段二：共享响应式界面 `packages/ui`、Electron 桌面端外壳、伴侣桥接服务、`dev:web` 云端预览与桌面三端打包】。

## 1. 共享响应式界面层（`packages/ui`）
所有产品页面与交互组件必须构建在 `packages/ui` 中，并通过依赖注入的 `AppBridge` 接口与底层通信，做到**桌面端与阶段三 Android 端 95%+ 代码复用**：
- **技术与易改版规范**：React + Tailwind CSS + shadcn/ui 风格基础组件 + KaTeX 数学公式渲染 + 代码高亮；支持明暗主题与中英双语切换；所有主题色、圆角、间距统一由 CSS Variables（Design Tokens）控制。
- **双端响应式布局**：
  - 宽屏（桌面端）：三栏工作台（左侧课时大纲 / 中间互动课堂 / 右侧可折叠学情看板）；
  - 窄屏（手机端 `< 768px`）：底部 Tab 导航切换（大纲 / 课堂 / 学情与刷题 / 设置），保证按钮触控区友好，方便阶段三直接套壳 Android。
- **核心业务模块（按 `features/*` 拆分）**：
  1. `features/syllabus`：课程/试卷列表、导入新考题入口、渐进式课时树（未解锁 / 学习中 / 已通关 🟢）、调整顺序与「按最新掌握度重排剩余课时」；预留注册表驱动的工具扩展入口。
  2. `features/import`：支持粘贴题目文本、批量导入、桌面端 `Ctrl+V` 粘截图、图片上传（预留移动端摄像头拍题触发口）；卡片化展示 AI 反推结果（核心考点权重、前置依赖路径、命题陷阱警示、阅卷采分点）与课时规划预览。
  3. `features/classroom`：
     - 顶部常驻教学控制条（随时实时切换）：Provider & 模型切换器、讲课风格选择器（5种预设+自定义）、详细程度三段开关（精简提分 / 标准详尽 / 保姆级零基础）；
     - 课堂对话流（Markdown + 表格 + KaTeX 公式）与**独立交互式随堂测/练习卡片**（作答输入区、提交阅卷、模拟得分、失分点高亮、高分范例折叠、通关解锁下一课）。
  4. `features/mastery`：考点掌握度进度条与红/黄/绿状态、高频失分原因分布、专属防坑口诀，以及「私教针对性出题」特训区（一键攻克最薄弱考点，或自选考点/错因/题量 1~5 题）。
  5. `features/settings`：
     - 本地订阅标签页（Antigravity / Codex / Claude Code 一键体检、自定义路径、模型与推理深度、测试连接）；
     - 模型 API 标签页（OpenAI / Anthropic / Gemini / DeepSeek / Ollama / 自定义兼容接口管理，支持按任务分流模型）；
     - **伴侣桥接（手机连接）标签页**：一键开启/关闭本地 Companion Bridge 服务，显示局域网连接地址、随机配对 Token 与二维码（供阶段三 Android 端扫码复用本机订阅与同步学习数据）；
     - 学科教研包标签页。

## 2. Electron 桌面外壳与云端双模式运行（`apps/desktop`）
- 开启 `contextIsolation: true`、`nodeIntegration: false`，通过类型安全的 Preload IPC 实现 `AppBridge`（含 API Key 经 `safeStorage` 加密存取）。
- 在主进程内置可选的轻量 **Companion Bridge HTTP/SSE 服务**（默认关闭，用户手动开启；强制 Bearer Token 鉴权 + 仅限绑定地址，提供 `/health`、`/providers`、`/chat/stream`、`/sync` 端点）。
- **必须实现云端友好双模式**：
  - `pnpm dev:desktop`：完整 Electron 桌面端模式；
  - `pnpm dev:web`：纯浏览器预览模式（注入 Mock `AppBridge` 与示例考题/学情数据，支持在无 GUI 的 Linux 云端环境通过浏览器实时预览桌面视图与手机视口）。

## 3. 桌面三端云端打包配置
- 配置 `electron-builder`（Windows NSIS 安装包、macOS DMG `arm64`/`x64`、Linux AppImage）及 SQLite 原生模块重建钩子。
- 编写 `.github/workflows/release.yml`（先配置 Windows / macOS / Linux 三端 Matrix，并预留 `android` Job 位置供阶段三接入），打 `v*` 标签或手动触发时自动打包并发布至 GitHub Releases。

## 验证要求
完成后确保 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 全部通过，并提供 `pnpm dev:web` 与 `pnpm dev:desktop` 的完整走查清单。
