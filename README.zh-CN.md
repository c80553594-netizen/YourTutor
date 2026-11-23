# YourTutor（AI 考题反推高分私教）

> 面向考生的开源、跨平台（Windows / macOS / Linux / Android）、本地优先（Local-First）学习应用。支持 **Antigravity CLI**、**OpenAI Codex CLI**、**Claude Code CLI**、主流官方模型 API、任意 OpenAI-Compatible 接口以及安卓端 **Companion Bridge** 伴侣桥接。

[English README](./README.md) | [贡献指南](./CONTRIBUTING.md) | [MIT 开源协议](./LICENSE)

---

## 核心教学闭环

收到考题（文本或拍照）后，**YourTutor** 不会直接扔答案了事，而是通过四个独立可测的教研引擎模块完成闭环提分：

1. **阶段一：考题 4 维深度反推（`ReverseEngineerService`）**
   - 核心考点剥离与权重标注（高频必考 / 拉分区分点 / 基础送分点）
   - 前置知识链倒推（`foundation → core → synthesis` 依赖树）
   - 命题陷阱与隐含条件警示
   - 阅卷人视角高分采分点拆解
2. **阶段二：渐进式自动课时规划与动态重排（`CurriculumPlannerService`）**
   - 自动生成 3～8 课时路径（前置补齐 → 核心模型 → 原题破解 → 变式防坑）
   - 支持根据最新学情掌握度动态重排剩余课时（已通关课时自动保留）
3. **阶段三：分课时单步精讲课堂（`LessonTutorService`）**
   - 实时切换 **5 种讲课风格**（名师提分 / 温柔家教 / 苏格拉底启发 / 幽默类比 / 严谨学术 + 自定义）与 **3 档详细程度**（精简提分 / 标准详尽 / 保姆级零基础）
   - 严格遵守「一次只讲一课时、随堂小测出题后立即停顿等待作答」
   - 学情与对话状态完全本地持久化，**中途切换任意订阅或模型 API 无缝延续教学上下文**
4. **阶段四：阅卷级批改、学情追踪与精准出题（`GradingAndDrillService`）**
   - 模拟阅卷打分、错因分类（`concept_gap` / `logic_break` / `trap_missed` / `step_deduction`）、通关门控与专属防坑口诀沉淀
   - 按薄弱考点与错因精准匹配出题策略（基础概念辨析 / 同母题换壳变式 / 刻意埋坑防丢分 / 跨考点压轴拔高 / 每隔 2 课时触发间隔抗遗忘复盘）

---

## Monorepo 目录架构

```text
YourTutor/
├── packages/
│   ├── core/        # 纯 TypeScript 核心引擎：多 Provider 网关、4 大教研服务、Prompt Pack 与 Zod Schema
│   ├── storage/     # Drizzle ORM + 跨端 SqlDriver 抽象 + 自动增量 SQLite Migration + 7 表 Repository
│   └── ui/          # 桌面与安卓共享 UI 契约（AppBridge、ToolPanelRegistry、CSS Design Tokens）
├── apps/
│   ├── desktop/     # Electron 桌面外壳与可选 Companion Bridge 本地伴侣服务（阶段二实现）
│   └── mobile/      # Capacitor Android 原生外壳、拍题与扫码伴侣桥接（阶段三实现）
└── docs/            # 核心教研主提示词与三阶段开发指南
```

### 多 Provider 网关矩阵

| Provider 适配器                | 运行能力声明       | 接入方式                                                                     | 多模态识图 | 说明                                                             |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| **Antigravity CLI** (`agy`)    | `desktop-cli`      | 隔离沙箱 NDJSON（`agy -p --output-format stream-json`）                      | —          | 支持 `--model` 与 `--effort`                                     |
| **OpenAI Codex CLI** (`codex`) | `desktop-cli`      | 隔离沙箱 JSONL（`codex exec --json --sandbox read-only`）                    | —          | 强制只读沙箱 + 空临时工作目录                                    |
| **Claude Code CLI** (`claude`) | `desktop-cli`      | 隔离沙箱 NDJSON（`claude -p --output-format stream-json --bare --tools ""`） | —          | 禁用所有工具 + 空临时工作目录                                    |
| **OpenAI-Compatible**          | `universal-api`    | 标准 HTTP / SSE                                                              | 支持       | 覆盖 OpenAI、DeepSeek、Qwen、OpenRouter、Ollama、LM Studio、vLLM |
| **Anthropic API**              | `universal-api`    | 官方 Messages SSE API                                                        | 支持       | 支持思考流与图片输入                                             |
| **Google Gemini API**          | `universal-api`    | 官方 Gemini SSE API                                                          | 支持       | Header 传密钥（避免 URL 泄漏）+ 思考流 + 识图                    |
| **Companion Bridge**           | `companion-remote` | HTTP / SSE + Bearer 配对 Token                                               | 支持       | 供 Android 端安全复用桌面/服务器本地订阅并同步学情档案           |

---

## 安全与合规底线

- **100% 官方通道**：绝不破解、窃取或伪造私有 OAuth Token 与未公开接口。
- **CLI 安全沙箱**：每次调用 `agy` / `codex` / `claude` 均在独立空临时目录运行并自动清理，严格禁用文件写入与 Shell 工具。
- **密钥加密引用**：持久化层 `provider_configs` 拒绝存储任何明文 API Key / Token，仅保存系统钥匙串 / Android Keystore 的 `secretRef`。

---

## 快速开发验证

环境要求：**Node.js >= 22**、**pnpm >= 9**。

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## 开源路线图

- [x] **阶段一**：Monorepo 工程骨架、统一多 Provider 网关、跨端 Drizzle SQLite 持久化层、4 大教研引擎与单元测试
- [ ] **阶段二**：共享响应式界面 `packages/ui`、Electron 桌面端、Companion Bridge 服务、`dev:web` 云端预览与桌面三端打包
- [ ] **阶段三**：Capacitor Android 端、拍照识题、伴侣扫码桥接、跨端同步与云端 APK 自动构建

## 开源协议

基于 [MIT License](./LICENSE) 开源。
