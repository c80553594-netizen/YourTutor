# YourTutor（AI 考题反推高分私教）

> 面向考生的开源、跨平台（**Windows / macOS / Linux / Android**）、本地优先（Local-First）学习应用。支持 **Antigravity CLI**、**OpenAI Codex CLI**、**Claude Code CLI**、主流官方模型 API、任意 OpenAI-Compatible 接口以及安卓端 **Companion Bridge** 伴侣扫码桥接。

[English README](./README.md) | [贡献指南](./CONTRIBUTING.md) | [MIT 开源协议](./LICENSE)

---

## 核心教学闭环

收到考题（文本、桌面截图或手机拍照）后，**YourTutor** 不会直接扔答案了事，而是通过四个独立可测的教研引擎模块完成闭环提分：

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

## Monorepo 目录架构（桌面与安卓 95%+ 代码复用）

```text
YourTutor/
├── packages/
│   ├── core/        # 纯 TypeScript 核心引擎：多 Provider 网关、4 大教研服务、Prompt Pack 与 Zod Schema
│   ├── storage/     # Drizzle ORM + 跨端 SqlDriver 抽象 + 自动增量 SQLite Migration + 7 表 Repository
│   └── ui/          # 桌面与安卓共享 React + Tailwind CSS + KaTeX 响应式界面、AppBridge 与 Design Tokens
├── apps/
│   ├── desktop/     # Electron 桌面外壳、safeStorage 密钥库、Companion Bridge 伴侣服务与 dev:web 云端预览
│   └── mobile/      # Capacitor 7 Android 原生外壳、拍照识题、Android Keystore 插件与跨端同步
└── docs/            # 核心教研主提示词与三阶段开发指南
```

---

## Android 端特色与伴侣扫码配对指南

- **拍照识题 / 相册选图**：在考题导入页直接点击「拍照识题」或「相册选图」，客户端自动完成轻量压缩与方向矫正后送入多模态模型反推考点。
- **双模式模型接入**：
  1. **独立模式（无需电脑）**：直接在手机端配置 Gemini / OpenAI / Anthropic / DeepSeek / OpenRouter / 任意 OpenAI-Compatible API（密钥经原生 `YourTutorKeystorePlugin` 调用 Android Keystore AES-256-GCM 加密，绝不存明文 `localStorage`）。
  2. **伴侣桥接模式（复用本机 CLI 订阅）**：
     - 在桌面端打开 **设置 → 伴侣桥接（手机连接）**，手动开启本地 Companion Bridge 服务（默认关闭），界面自动生成局域网地址、随机配对 Token 与二维码；
     - 在 Android 端扫码或粘贴配对链接（`yourtutor://pair?...` / JSON），即可直接拉取并流式调用桌面端的 **Antigravity / Codex / Claude Code** 订阅；
     - 点击「一键同步学习档案」，基于时间戳冲突安全策略在桌面与手机间合并同步课程、学情掌握度与防坑口诀。
- **移动端体验优化**：底部四 Tab 触控导航、Android 安全区适配、系统返回键路由、软键盘 `adjustResize` 防遮挡以及超宽 KaTeX 公式横向平滑滚动。

---

## 快速开发、云端预览与四端发版

环境要求：**Node.js >= 22**、**pnpm >= 9**。

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

- **纯浏览器云端预览（内置桌面视图 / 390×844 手机视口一键切换）**：
  ```bash
  pnpm dev:web
  ```
- **Electron 桌面端运行**：
  ```bash
  pnpm dev:desktop
  ```
- **触发 `v0.1.0` 云端四端自动发版（Windows `.exe` / macOS `.dmg` / Linux `.AppImage` / Android `.apk`）**：
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```
  或在 GitHub 仓库 **Actions → Release → Run workflow** 手动触发。若未配置 `ANDROID_KEYSTORE_BASE64` 等签名 Secrets，Android Job 会自动回退产出可安装的开源签名 APK，不阻塞任何 Fork 仓库发版。

## 开源协议

基于 [MIT License](./LICENSE) 开源。
