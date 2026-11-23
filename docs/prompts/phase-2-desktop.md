# 阶段二开发提示词：桌面端 UI、云端浏览器预览与三端云端打包

阶段一的核心引擎（`packages/core`）与持久化层（`packages/storage`）已就绪。请严格遵循 `AGENTS.md`，为 **YourTutor** 执行【阶段二：跨平台桌面应用 UI、云端浏览器预览模式与三端自动打包发布】。

## 1. Electron 安全外壳与云端双模式运行（`apps/desktop`）
- 开启 `contextIsolation: true`、`nodeIntegration: false`，通过类型安全的 Preload IPC Bridge 暴露所有核心能力（流式教学输出、考题反推、课时操作、学情读写、Provider 健康体检、API Key 经 `safeStorage` 加密存取）。
- **必须实现双模式启动**：
  - `pnpm dev:desktop`：完整 Electron 桌面端模式；
  - `pnpm dev:web`：纯浏览器独立预览模式（自动注入内置 Mock IPC Bridge 与演示真题/学情数据，支持在无 GUI 的 Linux 云端环境中通过浏览器实时预览与调试全部 UI）。

## 2. 面向考生的三栏桌面工作台（React + Tailwind + shadcn/ui + KaTeX）
要求界面清爽现代、专注学习、支持明暗主题与中英双语切换，所有主题色与间距走 CSS Variables（方便后续随时大改皮肤与布局），并按 `features/*` 模块化组织：

- **左侧栏 · 课程与自动课时大纲（`features/syllabus`）**
  - 课程/试卷列表 + 「导入新考题」按钮。
  - 当前课程的渐进式课时树：显示每课时标题、难度、预计时长与状态徽章（未解锁 / 学习中 / 已通关 🟢），支持点击切换、微调顺序、以及「按当前掌握度重排剩余课时」。
  - 底部提供注册表驱动的工具扩展入口（预留错题本、设置中心及未来新功能面板插槽）。

- **中间主区 · 考题反推与渐进式互动课堂（`features/import` & `features/classroom`）**
  - **顶部常驻教学控制条（随时生效，无需重启课程）**：
    - Provider & 模型快速切换器（支持在 Antigravity / Codex / Claude Code 本地订阅与 DeepSeek / Gemini / OpenAI 等 API 间一键切换）；
    - 讲课风格选择器（名师提分风 / 温柔家教风 / 苏格拉底启发式 / 幽默类比风 / 严谨学术风 / 自定义）；
    - 详细程度三段开关（精简提分 / 标准详尽 / 保姆级零基础）。
  - **考题导入与反推工作台**：
    - 支持粘贴文字题目、批量导入、**Ctrl+V 直接粘贴题目截图**或上传图片；
    - 卡片化清晰展示 AI 反推结果：核心考点权重标签、前置知识依赖路径、命题陷阱警示框、阅卷采分点清单，以及自动生成的课时规划预览与「确认开课」按钮。
  - **互动课堂与随堂答题卡片**：
    - 完整支持 Markdown、表格、代码高亮与 **LaTeX 数学公式（KaTeX）** 渲染；
    - 随堂诊断小测与私教练习渲染为独立交互式卡片（含作答输入框、提交阅卷按钮、流式批改反馈、模拟阅卷得分、扣分点高亮、可折叠高分范例，通关后自动解锁下一课时）。

- **右侧可折叠面板 · 学情掌握度与私教精准出题（`features/mastery`）**
  - 实时可视化展示各考点的掌握度进度条与红/黄/绿状态；
  - 展示【高频失分原因分布】与【专属防坑口诀】；
  - 提供「私教针对性出题」操作区：可一键基于最薄弱考点出题，或手动勾选考点/错因类型/题量（1~5 题）生成变式特训，作答批改后实时刷新左侧课时状态与右侧掌握度。

- **零门槛设置中心（`features/settings`）**
  - **本地订阅标签页**：一键体检扫描本机 `agy`、`codex`、`claude` 状态（已就绪 / 未登录 / 未安装），提供清晰的安装与登录指引、自定义路径、模型与推理深度配置及「测试连接」按钮。
  - **模型 API 标签页**：管理多个 OpenAI / Anthropic / Gemini / OpenAI-Compatible / Ollama 配置，API Key 加密存储且界面脱敏展示；支持按任务分流模型（例如：反推与出题用强推理模型，日常讲解用高性价比模型）。
  - **学科教研包标签页**：切换或导入不同考试模板（通用应试等）。

## 3. 跨平台云端打包配置
- 配置 `electron-builder`（Windows NSIS 安装包、macOS DMG `arm64`/`x64`、Linux AppImage）及 SQLite 原生模块重建钩子。
- 编写 `.github/workflows/release.yml`：推送 `v*` 标签或手动 `workflow_dispatch` 时，在 `windows-latest`、`macos-latest`、`ubuntu-latest` 三端云端并行打包并自动发布到 GitHub Releases（签名证书通过 Secrets 可选配置，缺省时正常产出未签名开源包）。

## 验证要求
完成后请确保 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 全部通过，并给出 `pnpm dev:web` 与 `pnpm dev:desktop` 的完整功能走查步骤。
