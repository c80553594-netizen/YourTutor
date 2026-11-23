# Contributing to YourTutor

Thank you for contributing to **YourTutor**! Please read [`AGENTS.md`](./AGENTS.md) before opening a pull request so all architectural boundaries and security rules remain intact.

## Architectural Rules

1. **`packages/core`** must stay pure TypeScript with **zero Electron, Capacitor, or browser DOM dependencies**.
2. **`packages/storage`** accesses SQLite exclusively through the cross-platform `SqlDriver` interface and Drizzle ORM. Every schema change must append a new incremental migration in `packages/storage/src/migrations/index.ts`.
3. **`packages/ui`** communicates with hosts exclusively via the `AppBridge` contract and uses CSS Variables (`YOURTUTOR_DESIGN_TOKENS`) for theming.
4. **Security**: Never store plaintext API keys or pairing tokens in SQLite or logs, and never invoke local CLIs outside an isolated temporary sandbox directory with tools disabled.

## Common Extension Workflows

### Adding a New Model Provider

1. Implement `TutorProvider` in `packages/core/src/providers/<your-provider>.ts`.
2. Declare accurate `capabilities` (`runtime`, `supportsVision`, `supportsThinking`, etc.).
3. Export it from `packages/core/src/providers/index.ts` and add unit tests with mock transport.

### Adding a New Exam Subject Prompt Pack

1. Create a directory under `packages/core/src/packs/<pack-id>/` implementing `PromptPack`.
2. Register it in `createDefaultPromptPackRegistry()` inside `packages/core/src/packs/index.ts`.
3. Add tests verifying prompt generation and Zod structured outputs.

## Local Verification Checklist

Before pushing your branch, ensure all checks pass cleanly:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Pull Request Process

1. Branch from `main` using a descriptive name (`feat/...`, `fix/...`, `docs/...`).
2. Keep commits focused and include unit tests for new logic.
3. Open a PR against `main` summarizing architecture changes and verification results.
