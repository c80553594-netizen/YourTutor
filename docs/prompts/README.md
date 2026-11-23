# YourTutor Development Prompts

按以下顺序推进 YourTutor 开源项目开发（支持桌面三端 + Android 四端）：

1. `AGENTS.md`（仓库根目录）— 项目总宪章、四端 Monorepo 分层、安全合规与云端构建规范
2. `docs/tutor-prompt.md` — 核心「AI 考题反推高分私教」教研主提示词
3. `docs/prompts/phase-1-core.md` — 阶段一：Monorepo 骨架、多 Provider 网关、持久化抽象层、教研核心引擎与 CI
4. `docs/prompts/phase-2-desktop.md` — 阶段二：共享响应式 `packages/ui`、Electron 桌面端、伴侣桥接服务、`dev:web` 云端预览与桌面三端打包
5. `docs/prompts/phase-3-android.md` — 阶段三：Capacitor Android 应用、拍照识题、独立 API + 桌面伴侣扫码桥接与云端 `.apk` 自动构建
