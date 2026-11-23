# 阶段三开发提示词：Android 端（Capacitor）、拍照识题、伴侣桥接与云端 APK 自动打包

阶段一（`packages/core`、`packages/storage`）与阶段二（共享响应式 `packages/ui`、`apps/desktop` 及 Companion Bridge 服务）已就绪。请严格遵循 `AGENTS.md`，为 **YourTutor** 执行【阶段三：Android 原生壳 `apps/mobile`、拍照识题、独立 API + 桌面伴侣扫码连接与云端 `.apk` 自动构建】。

## 1. Capacitor Android 工程初始化（`apps/mobile`）
- 使用 Capacitor 初始化 Android 工程，直接挂载并复用 `packages/ui` 与 `packages/core`，**严禁复制粘贴重复的 UI 代码**。
- 实现移动端专用 `MobileAppBridge`（满足 `packages/ui` 定义的同一套 `AppBridge` 接口）：
  - **本地存储**：通过 `@capacitor-community/sqlite` 实现 `packages/storage` 的 `SqlDriver` 接口，复用完全一致的 Drizzle Schema 与自动增量迁移；
  - **密钥安全**：通过 Android Keystore（安全偏好插件）加密存储用户的 API Key 与伴侣配对 Token，严禁明文存进 `localStorage`；
  - **原生体验优化**：适配 Android 安全区（Safe Area / 状态栏 / 底部手势条）、系统返回键路由处理、软键盘弹出时不遮挡答题与对话输入框。

## 2. 移动端专属高频功能（考生场景强化）
- **拍照拍试卷 / 相册选图识题**：
  - 集成 `@capacitor/camera`，在 `features/import` 的考题导入页激活「拍照导入」与「相册选图」按钮；
  - 图片上传前自动在客户端做轻量压缩与方向矫正，直接发送给当前选中的多模态模型进行考题识别与考点反推。
- **双模式模型接入（清晰引导，零困惑）**：
  1. **独立模式（Standalone）**：直接配置并调用 Gemini / OpenAI / Anthropic / DeepSeek / OpenRouter / 任意 OpenAI-Compatible API（手机无须电脑即可独立完成导入、反推、上课、刷题与学情记录）。
  2. **伴侣桥接模式（Connect to Desktop / Server）**：
     - 支持扫描 YourTutor 桌面端（或自托管 Linux 服务器）生成的配对二维码，或手动填入地址与配对 Token；
     - 连接成功后通过 `CompanionBridgeProvider` 自动拉取对方已就绪的 **Antigravity / Codex / Claude Code** 订阅模型列表，直接在手机上流式上课与出题；
     - 提供「一键同步学习档案」按钮，在桌面端与手机端之间合并同步课程、课时进度、学情掌握度与错题防坑口诀（基于时间戳的冲突安全合并策略）。
- **移动端碎片刷题体验**：
  - 优化随堂测与针对性变式题卡片的竖屏排版，保证 LaTeX 数学公式超宽时支持横向平滑滚动而不撑破页面。

## 3. 云端 Android `.apk` 自动构建与发布
- 在 `.github/workflows/release.yml` 中补全 `build-android` Job（运行在 `ubuntu-latest`，使用内置 Java + Android SDK + Gradle）：
  - 自动执行前端构建 → `npx cap sync android` → Gradle 构建 Release APK；
  - 若 GitHub Secrets 配置了 `ANDROID_KEYSTORE_BASE64` 等签名密钥则产出正式签名 APK；未配置时自动回退产出可安装的开源 APK，确保任何 Fork 仓库开箱即可在云端成功构建；
  - 自动将 `YourTutor-<version>-android.apk` 与 Windows / macOS / Linux 安装包一并上传至同一 GitHub Release 页面。
- 更新 `README.md` 与 `README.zh-CN.md`，补充 Android 安装说明、拍照识题介绍及桌面伴侣扫码配对指南。

## 验证要求
- 在云端环境中确保 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm --filter @yourtutor/mobile build` 及 Android Gradle 编译校验逻辑完整无报错；
- 确保 `pnpm dev:web` 切换到手机视口（390x844）下所有页面、底部导航、公式滚动与答题卡片无溢出、无错位。
