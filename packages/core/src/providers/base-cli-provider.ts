import { type z } from 'zod';
import {
  buildEnrichedPathEnv,
  type ExecutableResolverEnv,
  resolveExecutable,
} from './executable-resolver.js';
import { NdjsonStreamParser } from './ndjson-parser.js';
import { runStructuredWithRepair } from './structured-output.js';
import {
  type ChatRequest,
  extractTextFromContent,
  type ModelInfo,
  type ProviderCapabilities,
  ProviderError,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type StructuredRequest,
  type StructuredResult,
  type TutorProvider,
} from './types.js';

export interface CliSpawnRequest {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdinText?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface CliSpawnHandle {
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
  exitCode: Promise<number | null>;
  kill: (signal?: 'SIGTERM' | 'SIGKILL') => void;
}

export interface CliRuntimeAdapter {
  createSandboxDir: () => Promise<string>;
  removeSandboxDir: (dirPath: string) => Promise<void>;
  spawn: (req: CliSpawnRequest) => Promise<CliSpawnHandle>;
  resolverEnv?: ExecutableResolverEnv;
}

export interface BaseCliProviderConfig {
  /** Custom binary path override. */
  executablePath?: string;
  /** Default model ID passed to the CLI. */
  defaultModel?: string;
  /** Default execution timeout in milliseconds (default: 180_000). */
  timeoutMs?: number;
  /** Grace period before escalating SIGTERM to SIGKILL (default: 2_000). */
  killGraceMs?: number;
  /** Optional injected runtime adapter for unit testing or custom host runners. */
  runtime?: CliRuntimeAdapter;
}

const MAX_STDERR_CHARS = 8192;

async function createDefaultNodeCliRuntime(): Promise<CliRuntimeAdapter> {
  const [{ spawn }, fsPromises, os, path] = await Promise.all([
    import('node:child_process'),
    import('node:fs/promises'),
    import('node:os'),
    import('node:path'),
  ]);

  return {
    createSandboxDir: async () => {
      const prefix = path.join(os.tmpdir(), 'yourtutor-cli-sandbox-');
      return fsPromises.mkdtemp(prefix);
    },
    removeSandboxDir: async (dirPath: string) => {
      await fsPromises.rm(dirPath, { recursive: true, force: true });
    },
    spawn: async (req: CliSpawnRequest): Promise<CliSpawnHandle> => {
      const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(req.command);
      const child = spawn(req.command, req.args, {
        cwd: req.cwd,
        env: req.env,
        shell: isWinCmd,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (req.stdinText !== undefined && child.stdin) {
        child.stdin.write(req.stdinText);
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end();
      }

      const toAsyncStrings = async function* (
        stream: NodeJS.ReadableStream | null
      ): AsyncIterable<string> {
        if (!stream) {
          return;
        }
        stream.setEncoding('utf8');
        for await (const chunk of stream) {
          yield typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        }
      };

      const exitCode = new Promise<number | null>((resolve, reject) => {
        child.once('error', (err) => reject(err));
        child.once('close', (code) => resolve(code));
      });

      return {
        stdout: toAsyncStrings(child.stdout),
        stderr: toAsyncStrings(child.stderr),
        exitCode,
        kill: (sig = 'SIGTERM') => {
          if (child.killed || child.exitCode !== null) {
            return;
          }
          try {
            child.kill(sig);
          } catch {
            // Process may have already exited
          }
        },
      };
    },
  };
}

/**
 * Formats multi-turn chat history into a single prompt string for headless CLI invocation.
 * Teaching state (syllabus, style, detail level, mastery profile) is injected per call
 * so switching models mid-course preserves full continuity.
 */
export function serializePromptForCli(request: ChatRequest): string {
  const sections: string[] = [];

  if (request.systemPrompt?.trim()) {
    sections.push(`<system_instructions>\n${request.systemPrompt.trim()}\n</system_instructions>`);
  }

  for (const msg of request.messages) {
    const roleTag = msg.role.toUpperCase();
    const contentText = extractTextFromContent(msg.content).trim();
    if (contentText.length > 0) {
      sections.push(`[${roleTag}]\n${contentText}`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Abstract base class for local CLI subscription providers (Antigravity, Codex, Claude Code).
 *
 * Security & reliability guarantees:
 * 1. Always resolves the binary safely across Windows/macOS/Linux (GUI PATH safe).
 * 2. Always executes inside a freshly created empty temp directory (sandbox) and cleans it up.
 * 3. Subclasses pass read-only / no-tools flags to prevent any file writes or shell actions.
 * 4. Parses NDJSON stdout reliably across chunk boundaries, collects capped stderr diagnostics,
 *    and enforces clean timeout/abort process termination with SIGTERM -> SIGKILL escalation.
 */
export abstract class BaseCliProvider implements TutorProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly binaryName: string;

  readonly capabilities: ProviderCapabilities = {
    runtime: 'desktop-cli',
    supportsVision: false,
    supportsThinking: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsModelListing: true,
  };

  protected readonly config: BaseCliProviderConfig;
  private cachedRuntime: CliRuntimeAdapter | null = null;

  constructor(config: BaseCliProviderConfig = {}) {
    this.config = config;
  }

  protected async getRuntime(): Promise<CliRuntimeAdapter> {
    if (this.config.runtime) {
      return this.config.runtime;
    }
    if (!this.cachedRuntime) {
      this.cachedRuntime = await createDefaultNodeCliRuntime();
    }
    return this.cachedRuntime;
  }

  /**
   * Builds the CLI argument vector (and optional stdin payload) for a chat request.
   * Subclasses MUST include strict read-only / no-tool flags.
   */
  protected abstract buildCommand(
    request: ChatRequest,
    serializedPrompt: string
  ): { args: string[]; stdinText?: string };

  /**
   * Maps a parsed NDJSON event object from stdout into zero or more ProviderStreamEvents.
   */
  protected abstract parseNdjsonEvent(payload: unknown): ProviderStreamEvent[];

  /**
   * Optional arguments used to probe CLI version during healthCheck.
   */
  protected getVersionArgs(): string[] {
    return ['--version'];
  }

  abstract listModels(signal?: AbortSignal): Promise<ModelInfo[]>;

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    const runtime = await this.getRuntime();
    const resolvedPath = await resolveExecutable({
      binaryName: this.binaryName,
      customPath: this.config.executablePath,
      resolverEnv: runtime.resolverEnv,
    });

    if (!resolvedPath) {
      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: `Executable '${this.config.executablePath ?? this.binaryName}' not found in PATH.`,
      };
    }

    let sandboxDir: string | null = null;
    try {
      sandboxDir = await runtime.createSandboxDir();
      const env = await buildEnrichedPathEnv(runtime.resolverEnv);
      const handle = await runtime.spawn({
        command: resolvedPath,
        args: this.getVersionArgs(),
        cwd: sandboxDir,
        env,
        signal,
        timeoutMs: 10_000,
      });

      const outChunks: string[] = [];
      const errChunks: string[] = [];
      await Promise.all([
        (async () => {
          for await (const chunk of handle.stdout) {
            outChunks.push(chunk);
          }
        })(),
        (async () => {
          for await (const chunk of handle.stderr) {
            errChunks.push(chunk);
          }
        })(),
      ]);

      const code = await handle.exitCode;
      const versionText = outChunks.join('').trim() || errChunks.join('').trim();
      if (code === 0) {
        return {
          providerId: this.id,
          ok: true,
          latencyMs: Date.now() - startedAt,
          message: `${this.name} CLI is ready.`,
          resolvedPath,
          version: versionText.split(/\r?\n/)[0],
        };
      }

      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: `${this.name} CLI exited with code ${String(code)}.`,
        resolvedPath,
        details: { stderr: errChunks.join('').slice(0, 500) },
      };
    } catch (err) {
      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: err instanceof Error ? err.message : String(err),
        resolvedPath,
      };
    } finally {
      if (sandboxDir) {
        await runtime.removeSandboxDir(sandboxDir).catch(() => undefined);
      }
    }
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    if (request.signal?.aborted) {
      yield {
        type: 'error',
        error: { code: 'ABORTED', message: 'Request aborted before CLI launch.' },
      };
      return;
    }

    const runtime = await this.getRuntime();
    const resolvedPath = await resolveExecutable({
      binaryName: this.binaryName,
      customPath: this.config.executablePath,
      resolverEnv: runtime.resolverEnv,
    });

    if (!resolvedPath) {
      yield {
        type: 'error',
        error: {
          code: 'EXECUTABLE_NOT_FOUND',
          message: `Cannot find '${this.config.executablePath ?? this.binaryName}'. Please install it or configure its custom path.`,
        },
      };
      return;
    }

    const timeoutMs = request.timeoutMs ?? this.config.timeoutMs ?? 180_000;
    const killGraceMs = this.config.killGraceMs ?? 2_000;
    const serializedPrompt = serializePromptForCli(request);
    const { args, stdinText } = this.buildCommand(request, serializedPrompt);

    let sandboxDir: string | null = null;
    let timedOut = false;
    let aborted = false;
    let processDone = false;
    let killEscalationTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let activeHandle: CliSpawnHandle | null = null;

    const terminateProcess = () => {
      if (!activeHandle || processDone) {
        return;
      }
      activeHandle.kill('SIGTERM');
      killEscalationTimer = setTimeout(() => {
        if (!processDone && activeHandle) {
          activeHandle.kill('SIGKILL');
        }
      }, killGraceMs);
    };

    const onAbort = () => {
      aborted = true;
      terminateProcess();
    };

    request.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      sandboxDir = await runtime.createSandboxDir();
      const env = await buildEnrichedPathEnv(runtime.resolverEnv);
      const handle = await runtime.spawn({
        command: resolvedPath,
        args,
        cwd: sandboxDir,
        env,
        stdinText,
        signal: request.signal,
        timeoutMs,
      });
      activeHandle = handle;

      timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminateProcess();
      }, timeoutMs);

      let stderrBuffer = '';
      const stderrCollector = (async () => {
        try {
          for await (const chunk of handle.stderr) {
            if (stderrBuffer.length < MAX_STDERR_CHARS) {
              stderrBuffer += chunk.slice(0, MAX_STDERR_CHARS - stderrBuffer.length);
            }
          }
        } catch {
          // Ignore stderr close errors on forced kill
        }
      })();

      const parser = new NdjsonStreamParser();
      let emittedDone = false;

      for await (const chunk of handle.stdout) {
        if (aborted || timedOut) {
          break;
        }
        for (const item of parser.push(chunk)) {
          if (item.parsed !== undefined) {
            const events = this.parseNdjsonEvent(item.parsed);
            for (const ev of events) {
              if (ev.type === 'done') {
                emittedDone = true;
              }
              yield ev;
            }
          }
        }
      }

      if (!aborted && !timedOut) {
        for (const item of parser.flush()) {
          if (item.parsed !== undefined) {
            const events = this.parseNdjsonEvent(item.parsed);
            for (const ev of events) {
              if (ev.type === 'done') {
                emittedDone = true;
              }
              yield ev;
            }
          }
        }
      }

      await stderrCollector;
      const exitCode = await handle.exitCode;
      processDone = true;

      if (aborted) {
        yield {
          type: 'error',
          error: {
            code: 'ABORTED',
            message: `${this.name} CLI execution was aborted.`,
            stderr: stderrBuffer || undefined,
          },
        };
        return;
      }

      if (timedOut) {
        yield {
          type: 'error',
          error: {
            code: 'TIMEOUT',
            message: `${this.name} CLI timed out after ${timeoutMs}ms.`,
            stderr: stderrBuffer || undefined,
            retryable: true,
          },
        };
        return;
      }

      if (exitCode !== 0 && exitCode !== null) {
        yield {
          type: 'error',
          error: {
            code: 'PROCESS_FAILED',
            message: `${this.name} CLI exited with status ${exitCode}.${stderrBuffer ? ` ${stderrBuffer.trim()}` : ''}`,
            stderr: stderrBuffer || undefined,
            retryable: false,
          },
        };
        return;
      }

      if (!emittedDone) {
        yield { type: 'done', finishReason: 'stop' };
      }
    } catch (err) {
      processDone = true;
      yield {
        type: 'error',
        error:
          err instanceof ProviderError
            ? err.toInfo()
            : {
                code: 'PROCESS_FAILED',
                message: err instanceof Error ? err.message : String(err),
                cause: err,
              },
      };
    } finally {
      processDone = true;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (killEscalationTimer) {
        clearTimeout(killEscalationTimer);
      }
      request.signal?.removeEventListener('abort', onAbort);
      if (activeHandle) {
        activeHandle.kill('SIGTERM');
      }
      if (sandboxDir) {
        await runtime.removeSandboxDir(sandboxDir).catch(() => undefined);
      }
    }
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredRequest<TSchema>
  ): Promise<StructuredResult<z.infer<TSchema>>> {
    return runStructuredWithRepair(this, request);
  }
}
