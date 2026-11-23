# YourTutor

> **AI Reverse-Engineering Exam Tutor** — Open-source, cross-platform (**Windows / macOS / Linux / Android**), local-first study coach supporting **Antigravity CLI**, **OpenAI Codex CLI**, **Claude Code CLI**, official LLM APIs, OpenAI-compatible endpoints, and Android Companion Bridge.

[中文文档](./README.zh-CN.md) | [Contributing](./CONTRIBUTING.md) | [License (MIT)](./LICENSE)

---

## Core Idea

Instead of dumping a final answer, **YourTutor** takes any exam question (text, desktop screenshot, or Android camera photo) and guides learners through a **4-stage high-score loop**:

1. **4-Dimensional Exam Reverse-Engineering (`ReverseEngineerService`)**
   - Weighted knowledge points (`high_frequency` / `differentiator` / `foundation`)
   - Prerequisite dependency chain (`foundation → core → synthesis`)
   - Exam traps & hidden conditions
   - Exam-grader scoring rubric
2. **Progressive Auto-Curriculum Planning (`CurriculumPlannerService`)**
   - Automatically generates a 3–8 lesson syllabus (`foundation → core model → original exam → variants & traps`)
   - Dynamically replans remaining lessons from live mastery records while keeping mastered lessons intact
3. **Single-Lesson Micro-Loop Classroom (`LessonTutorService`)**
   - Real-time switching of **5 Teaching Styles** (`coach`, `gentle`, `socratic`, `humorous`, `academic` + custom) and **3 Detail Levels** (`concise`, `standard`, `zero_base`)
   - Strictly delivers one lesson at a time (`Anchor → Core Lecture → Original Exam Mapping → Diagnostic Quiz & STOP`)
   - State is persisted locally and dynamically injected every turn — switching models/providers mid-course preserves full teaching context
4. **Exam-Grader Feedback, Mastery Profile & Targeted Drills (`GradingAndDrillService`)**
   - Grades student answers against rubric points, classifies error tags (`concept_gap`, `logic_break`, `trap_missed`, `step_deduction`), updates mastery scores & pitfall memos
   - Automatically selects targeted drill strategies (`concept_check`, `variant`, `trap_focus`, `synthesis`, `spaced_review`) with spaced-repetition interleaving every 2 lessons

---

## Architecture (Monorepo — 95%+ Shared UI Across Desktop & Android)

```text
YourTutor/
├── packages/
│   ├── core/        # Pure TypeScript engine: Multi-Provider Gateway, 4 Tutor Services, Prompt Packs, Zod schemas
│   ├── storage/     # Drizzle ORM + cross-platform SqlDriver abstraction + incremental SQLite migrations
│   └── ui/          # Shared responsive React + Tailwind CSS + KaTeX UI, AppBridge & CSS Design Tokens
├── apps/
│   ├── desktop/     # Electron desktop shell, safeStorage vault, Companion Bridge HTTP/SSE server & dev:web preview
│   └── mobile/      # Capacitor 7 Android shell, Camera exam capture, Android Keystore plugin & Companion sync
└── docs/            # Core teaching prompt specification & phased development guides
```

### Multi-Provider Gateway Matrix

| Provider | Runtime Capability | Transport | Vision | Notes |
| --- | --- | --- | --- | --- |
| **Antigravity CLI** (`agy`) | `desktop-cli` | Sandboxed NDJSON (`agy -p --output-format stream-json`) | — | Supports `--model` & `--effort` |
| **OpenAI Codex CLI** (`codex`) | `desktop-cli` | Sandboxed JSONL (`codex exec --json --sandbox read-only`) | — | Strict read-only sandbox & temp cwd |
| **Claude Code CLI** (`claude`) | `desktop-cli` | Sandboxed NDJSON (`claude -p --output-format stream-json --bare --tools ""`) | — | Tools disabled + temp cwd |
| **OpenAI-Compatible** | `universal-api` | HTTP / SSE | Yes | OpenAI, DeepSeek, Qwen, OpenRouter, Ollama, LM Studio, vLLM |
| **Anthropic API** | `universal-api` | Official Messages SSE API | Yes | Supports extended thinking & vision |
| **Google Gemini API** | `universal-api` | Official Gemini SSE API | Yes | Uses `x-goog-api-key` header + vision |
| **Companion Bridge** | `companion-remote` | HTTP / SSE + Bearer Pairing Token | Yes | Bridges Android to Desktop/Server CLI subscriptions & syncs mastery data |

---

## Android Features (Camera, Standalone APIs & Desktop Companion Pairing)

- **Camera & Gallery Exam Recognition**: Snap a photo of any paper exam or worksheet; client-side compression and EXIF orientation correction prepare the image before sending it to multimodal APIs (Gemini, OpenAI, Anthropic, Qwen-VL, etc.).
- **Dual-Mode Model Access**:
  1. **Standalone Mode**: Configure Gemini / OpenAI / Anthropic / DeepSeek / OpenRouter / custom OpenAI-compatible APIs directly on Android (keys encrypted via native Android Keystore `YourTutorKeystorePlugin`, never stored in `localStorage`).
  2. **Companion Bridge Mode**:
     - On Desktop, open **Settings → Companion Bridge** and enable the local server (off by default) to display a LAN URL, random Bearer Token, and QR code.
     - On Android, scan or paste the pairing QR payload (`yourtutor://pair?...` or JSON) to stream your desktop's **Antigravity / Codex / Claude Code** subscriptions and click **Sync Study Profile** for timestamp-safe bidirectional sync.
- **Mobile-First Layout**: Bottom tab navigation (`Syllabus / Classroom / Mastery & Drills / Settings`), Android safe-area insets, soft-keyboard `adjustResize`, hardware Back button handling, and horizontally scrollable KaTeX math blocks.

---

## Quick Start (Development & Cloud Preview)

Requirements: **Node.js >= 22** and **pnpm >= 9**.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

### Browser Cloud Preview (Desktop & 390×844 Mobile Viewport Toggle)

```bash
pnpm dev:web
```

### Desktop Electron Mode

```bash
pnpm dev:desktop
```

### Triggering Automated 4-Platform Cloud Release (Windows / macOS / Linux / Android APK)

Tagging and pushing a version (or triggering **Actions → Release → Run workflow**) builds and publishes all 4 installers (`YourTutor-<ver>-win-x64.exe`, `YourTutor-<ver>-mac-{arm64,x64}.dmg`, `YourTutor-<ver>-linux-x64.AppImage`, and `YourTutor-<ver>-android.apk`) to GitHub Releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

> Optional Android release signing secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) can be configured in repository Settings → Secrets; when absent, CI automatically falls back to an installable open-source signed APK so forks build without blockers.

## License

Released under the [MIT License](./LICENSE).
