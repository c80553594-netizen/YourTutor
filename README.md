# YourTutor

> **AI Reverse-Engineering Exam Tutor** — Open-source, cross-platform (Windows / macOS / Linux / Android), local-first study coach supporting **Antigravity CLI**, **OpenAI Codex CLI**, **Claude Code CLI**, official LLM APIs, OpenAI-compatible endpoints, and Android Companion Bridge.

[中文文档](./README.zh-CN.md) | [Contributing](./CONTRIBUTING.md) | [License (MIT)](./LICENSE)

---

## Core Idea

Instead of dumping a final answer, **YourTutor** takes any exam question (text or photo) and guides learners through a **4-stage high-score loop**:

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

## Architecture (Monorepo)

```text
YourTutor/
├── packages/
│   ├── core/        # Pure TypeScript engine: Provider Gateway, 4 Tutor Services, Prompt Packs, Zod schemas
│   ├── storage/     # Drizzle ORM + cross-platform SqlDriver abstraction + incremental SQLite migrations
│   └── ui/          # Shared responsive UI contracts (AppBridge, ToolPanelRegistry, Design Tokens)
├── apps/
│   ├── desktop/     # Electron desktop shell + optional Companion Bridge server (Phase 2)
│   └── mobile/      # Capacitor Android shell + Camera + Companion client (Phase 3)
└── docs/            # Core teaching prompt specification & phased development guides
```

### Multi-Provider Gateway Matrix

| Provider                       | Runtime Capability | Transport                                                                    | Vision | Notes                                                                    |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| **Antigravity CLI** (`agy`)    | `desktop-cli`      | Sandboxed NDJSON (`agy -p --output-format stream-json`)                      | —      | Supports `--model` & `--effort`                                          |
| **OpenAI Codex CLI** (`codex`) | `desktop-cli`      | Sandboxed JSONL (`codex exec --json --sandbox read-only`)                    | —      | Strict read-only sandbox & temp cwd                                      |
| **Claude Code CLI** (`claude`) | `desktop-cli`      | Sandboxed NDJSON (`claude -p --output-format stream-json --bare --tools ""`) | —      | Tools disabled + temp cwd                                                |
| **OpenAI-Compatible**          | `universal-api`    | HTTP / SSE                                                                   | Yes    | OpenAI, DeepSeek, Qwen, OpenRouter, Ollama, LM Studio, vLLM              |
| **Anthropic API**              | `universal-api`    | Official Messages SSE API                                                    | Yes    | Supports extended thinking & vision                                      |
| **Google Gemini API**          | `universal-api`    | Official Gemini SSE API                                                      | Yes    | Uses `x-goog-api-key` header + vision                                    |
| **Companion Bridge**           | `companion-remote` | HTTP / SSE + Bearer Pairing Token                                            | Yes    | Bridges Android to Desktop/Server CLI subscriptions & syncs mastery data |

---

## Security & Compliance Principles

- **100% Official Interfaces**: Only uses official CLI/SDKs or official HTTP APIs — never extracts or forges private OAuth tokens.
- **CLI Sandbox Isolation**: Every CLI invocation runs inside an isolated empty temporary directory (cleaned up automatically) with write/shell tools disabled.
- **Encrypted Credential References**: `provider_configs` strictly forbids storing plaintext API keys or pairing tokens; hosts store secrets via Electron `safeStorage` / Android Keystore and persist only `secretRef`.

---

## Quick Start (Development)

Requirements: **Node.js >= 22** and **pnpm >= 9**.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Roadmap

- [x] **Phase 1**: Monorepo skeleton, Unified Multi-Provider Gateway, Cross-Platform Drizzle SQLite Storage, 4-Stage Pedagogical Engine & Unit Tests
- [ ] **Phase 2**: Shared Responsive UI (`packages/ui`), Electron Desktop App, Companion Bridge Server, `dev:web` Cloud Preview & Desktop Releases
- [ ] **Phase 3**: Capacitor Android App, Camera Exam Capture, Companion QR Pairing, Cross-Device Sync & Automated APK Releases

## License

Released under the [MIT License](./LICENSE).
