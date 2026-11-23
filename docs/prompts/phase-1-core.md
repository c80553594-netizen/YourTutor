# 阶段一开发提示词：工程骨架、多 Provider 网关、持久化与教研引擎

请严格阅读并遵循仓库根目录的 `AGENTS.md`（并参考 `docs/tutor-prompt.md` 中的核心教学规范），为 **YourTutor** 执行【阶段一：工程骨架、多 Provider 网关、本地持久化与教研核心引擎】开发任务。本阶段重点把底层架构、数据流和测试打牢，暂不做复杂视觉美化。

## 具体交付清单

### 1. Monorepo 与开源基础设施
- 使用 `pnpm workspace` 初始化：`packages/core`、`packages/storage`、`apps/desktop`、`docs/`。
- 配置严格模式 TypeScript、ESLint、Prettier、Vitest，并在根 `package.json` 提供统一脚本：`dev:web`、`dev:desktop`、`typecheck`、`lint`、`test`、`build`。
- 完善开源基础文档：`README.md`、`README.zh-CN.md`、`CONTRIBUTING.md` 以及 `.github/workflows/ci.yml`（保留已有的 MIT `LICENSE`）。

### 2. 统一 Provider 网关（`packages/core/src/providers`）
- 定义统一的 `TutorProvider` 接口，支持流式正文事件、可选思考过程事件、结构化 JSON 输出（含 Zod 校验与格式异常自动修复重试）、`healthCheck` 健康体检、`listModels`、`AbortSignal` 中断。
- 实现 `BaseCliProvider` 抽象基类：
  - 跨平台探测可执行文件（兼容 Windows `.cmd`/`.exe` 及 macOS GUI 启动缺少 login shell `PATH` 的问题）；
  - 强制使用隔离的空临时工作目录并禁用写文件/Shell 等危险工具；
  - 健壮解析 NDJSON 流式 stdout，收集 stderr 诊断信息，支持超时和干净终止子进程（无僵尸进程）。
- 实现 6 个内置适配器并接入 `ProviderRegistry`：
  1. `AntigravityCliProvider`（`agy -p --output-format stream-json`）
  2. `CodexCliProvider`（`codex exec --json`）
  3. `ClaudeCodeCliProvider`（`claude -p --output-format stream-json --bare`，禁用工具）
  4. `OpenAICompatibleProvider`（覆盖 OpenAI / DeepSeek / Qwen / OpenRouter / Ollama / LM Studio，支持自定义 Base URL 与图片多模态）
  5. `AnthropicApiProvider`（官方 Messages API）
  6. `GeminiApiProvider`（官方 Gemini API）
- 为 CLI 流解析器与 ProviderRegistry 编写完整的 Mock 单元测试。

### 3. 本地持久化层（`packages/storage`）
使用 SQLite + Drizzle ORM（含自动 Migration 机制）设计并实现以下表与 Repository：
- `courses`：课程/试卷项目（标题、考试类型、目标分数、备考时间、当前讲课风格、当前详细程度、所选教研包）
- `exam_items`：导入的考试题目（原始文本、图片附件路径、反推分析 JSON：核心考点、前置依赖链、命题陷阱、阅卷采分点）
- `lessons`：自动生成的渐进式课时表（序号、主题、对应考点、学习目标、难度、预计时长、状态 `locked | active | mastered`）
- `messages`：分课时对话流（关联课时 ID、角色、内容、卡片类型 `lecture | quiz | feedback | drill`、所用 Provider/Model）
- `mastery_records`：结构化学情掌握度档案（考点名、掌握分 0~100、状态 `unlearned | weak | consolidating | mastered`、错因标签 `concept_gap | logic_break | trap_missed | step_deduction`、专属防坑口诀、更新时间）
- `practice_attempts`：随堂测与针对性刷题记录（题干、参考采分点、考生作答、阅卷评分、失分诊断、关联考点）
- `provider_configs`：Provider 配置与加密后的密钥引用

### 4. 教研状态机与 Prompt Pack（`packages/core/src/tutor` & `packs/`）
将核心教学拆分为 4 个独立、可单测的服务模块，并把提示词模板外部化到 `packages/core/src/packs/general-exam/`：
1. `ReverseEngineerService`：输入考题 → 输出结构化反推分析（考点权重、前置知识依赖树、命题陷阱、阅卷采分点）。
2. `CurriculumPlannerService`：基于反推结果与考生目标 → 自动生成由浅入深的分课时大纲（前置补齐 → 核心模型 → 原题破解 → 变式防坑），支持根据最新学情重排剩余课时。
3. `LessonTutorService`：动态注入【当前课时目标 + 实时讲课风格（5种预设+自定义）+ 实时详细程度（3档）+ SQLite 最新学情档案】，流式执行「本课锚点 → 核心精讲 → 原题映射 → 随堂诊断小测」，严格遵守一次只讲一课时、出题后等待作答。
4. `GradingAndDrillService`：
   - 阅卷级批改学生作答，输出得分、卡点诊断、高分标准写法及 `mastery_delta` 自动回写 SQLite；
   - 按学情薄弱点与错因精准生成针对性私教练习（基础概念辨析 / 同母题换壳变式 / 刻意埋坑防丢分 / 跨考点压轴拔高 / 间隔抗遗忘复盘）。

## 执行方式
请先输出完整的目录规划、核心接口定义与数据表 Schema 摘要；确认无误后直接编码实现，并确保 `pnpm typecheck`、`pnpm lint`、`pnpm test` 全部通过。
