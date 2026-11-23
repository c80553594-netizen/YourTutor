import { describe, expect, it, vi } from 'vitest';
import { AntigravityCliProvider } from '../antigravity-cli-provider.js';
import {
  type CliRuntimeAdapter,
  type CliSpawnHandle,
  type CliSpawnRequest,
} from '../base-cli-provider.js';
import { ClaudeCodeCliProvider } from '../claude-code-cli-provider.js';
import { CodexCliProvider } from '../codex-cli-provider.js';
import { type ExecutableResolverEnv, resolveExecutable } from '../executable-resolver.js';
import { type ProviderStreamEvent } from '../types.js';

async function* chunksToAsync(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) {
    yield c;
  }
}

function createMockRuntime(options: {
  existingPaths: string[];
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
  platform?: NodeJS.Platform;
  customSpawn?: (req: CliSpawnRequest) => Promise<CliSpawnHandle>;
}): {
  runtime: CliRuntimeAdapter;
  spawnedRequests: CliSpawnRequest[];
  createdSandboxes: string[];
  removedSandboxes: string[];
} {
  const existingSet = new Set(options.existingPaths);
  const spawnedRequests: CliSpawnRequest[] = [];
  const createdSandboxes: string[] = [];
  const removedSandboxes: string[] = [];

  const resolverEnv: ExecutableResolverEnv = {
    platform: options.platform ?? 'linux',
    env: { PATH: '/usr/bin:/bin', PATHEXT: '.COM;.EXE;.BAT;.CMD' },
    homeDir: '/home/tester',
    fileExists: async (p) => existingSet.has(p),
    readDir: async () => [],
  };

  const runtime: CliRuntimeAdapter = {
    resolverEnv,
    createSandboxDir: async () => {
      const dir = `/tmp/yourtutor-test-sandbox-${createdSandboxes.length + 1}`;
      createdSandboxes.push(dir);
      return dir;
    },
    removeSandboxDir: async (dirPath) => {
      removedSandboxes.push(dirPath);
    },
    spawn: async (req) => {
      spawnedRequests.push(req);
      if (options.customSpawn) {
        return options.customSpawn(req);
      }
      return {
        stdout: chunksToAsync(options.stdoutChunks ?? []),
        stderr: chunksToAsync(options.stderrChunks ?? []),
        exitCode: Promise.resolve(options.exitCode ?? 0),
        kill: vi.fn(),
      };
    },
  };

  return { runtime, spawnedRequests, createdSandboxes, removedSandboxes };
}

describe('resolveExecutable cross-platform discovery', () => {
  it('resolves Windows .cmd binaries via PATHEXT and APPDATA\\npm fallback', async () => {
    const env: ExecutableResolverEnv = {
      platform: 'win32',
      env: {
        PATH: 'C:\\Windows\\System32',
        APPDATA: 'C:\\Users\\Student\\AppData\\Roaming',
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
      },
      homeDir: 'C:\\Users\\Student',
      fileExists: async (p) => p === 'C:\\Users\\Student\\AppData\\Roaming\\npm\\codex.cmd',
    };

    const resolved = await resolveExecutable({ binaryName: 'codex', resolverEnv: env });
    expect(resolved).toBe('C:\\Users\\Student\\AppData\\Roaming\\npm\\codex.cmd');
  });

  it('resolves macOS Homebrew and nvm binaries when GUI launch omits login-shell PATH', async () => {
    const env: ExecutableResolverEnv = {
      platform: 'darwin',
      env: { PATH: '/usr/bin:/bin' },
      homeDir: '/Users/student',
      fileExists: async (p) => p === '/opt/homebrew/bin/agy',
      readDir: async () => ['v22.14.0'],
    };

    const resolved = await resolveExecutable({ binaryName: 'agy', resolverEnv: env });
    expect(resolved).toBe('/opt/homebrew/bin/agy');
  });
});

describe('CLI Providers (Antigravity / Codex / Claude Code)', () => {
  it('AntigravityCliProvider passes -p --output-format stream-json --model --effort in an isolated sandbox and parses stream', async () => {
    const { runtime, spawnedRequests, createdSandboxes, removedSandboxes } = createMockRuntime({
      existingPaths: ['/opt/homebrew/bin/agy'],
      stdoutChunks: [
        '{"type":"thinking_delta","delta":"Analyzing trap..."}\n',
        '{"type":"text_delta","delta":"Step 1: "}\n{"type":"text_delta","delta":"Factorize"}\n',
        '{"type":"result","finish_reason":"stop","usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30}}\n',
      ],
    });

    const provider = new AntigravityCliProvider({
      defaultModel: 'gemini-2.5-pro',
      defaultEffort: 'high',
      runtime,
    });

    expect(provider.capabilities.runtime).toBe('desktop-cli');

    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      systemPrompt: 'Act as exam tutor',
      messages: [{ role: 'user', content: 'Solve x^2 - 1 = 0' }],
    })) {
      events.push(ev);
    }

    expect(spawnedRequests).toHaveLength(1);
    const req = spawnedRequests[0]!;
    expect(req.command).toBe('/opt/homebrew/bin/agy');
    expect(req.args).toContain('-p');
    expect(req.args).toContain('--output-format');
    expect(req.args).toContain('stream-json');
    expect(req.args).toContain('--model');
    expect(req.args).toContain('gemini-2.5-pro');
    expect(req.args).toContain('--effort');
    expect(req.args).toContain('high');
    expect(req.cwd).toBe(createdSandboxes[0]);
    expect(removedSandboxes).toEqual(createdSandboxes);

    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Analyzing trap...' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Step 1: ' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Factorize' });
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('CodexCliProvider enforces --sandbox read-only, streams via stdin, and parses JSONL events', async () => {
    const { runtime, spawnedRequests } = createMockRuntime({
      existingPaths: ['/usr/local/bin/codex'],
      stdoutChunks: [
        '{"type":"item.delta","item_type":"reasoning","delta":"Checking boundary"}\n',
        '{"type":"item.completed","item":{"type":"agent_message","text":"Key formula: F=ma"}}\n',
        '{"type":"turn.completed","usage":{"input_tokens":15,"output_tokens":25}}\n',
      ],
    });

    const provider = new CodexCliProvider({ defaultModel: 'o4-mini', runtime });
    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'Analyze physics problem' }],
    })) {
      events.push(ev);
    }

    const req = spawnedRequests[0]!;
    expect(req.args).toEqual([
      'exec',
      '--json',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '-m',
      'o4-mini',
      '-',
    ]);
    expect(req.stdinText).toContain('Analyze physics problem');
    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Checking boundary' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Key formula: F=ma' });
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
    });
  });

  it('ClaudeCodeCliProvider enforces --bare and --tools "" and parses stream-json events', async () => {
    const { runtime, spawnedRequests } = createMockRuntime({
      existingPaths: ['/usr/local/bin/claude'],
      stdoutChunks: [
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Planning lesson"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Welcome to Lesson 1"}}}\n',
        '{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":50,"output_tokens":80}}\n',
      ],
    });

    const provider = new ClaudeCodeCliProvider({ defaultModel: 'claude-sonnet-4-5', runtime });
    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'Start lesson 1' }],
    })) {
      events.push(ev);
    }

    const req = spawnedRequests[0]!;
    expect(req.args).toContain('--bare');
    const toolsIdx = req.args.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(req.args[toolsIdx + 1]).toBe('');
    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Planning lesson' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Welcome to Lesson 1' });
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('collects stderr diagnostics on non-zero exit and always cleans up sandbox directory', async () => {
    const { runtime, createdSandboxes, removedSandboxes } = createMockRuntime({
      existingPaths: ['/usr/bin/agy'],
      stderrChunks: ['Auth error: please run agy login'],
      exitCode: 1,
    });

    const provider = new AntigravityCliProvider({ runtime });
    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(ev);
    }

    expect(removedSandboxes).toEqual(createdSandboxes);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.type).toBe('error');
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.code).toBe('PROCESS_FAILED');
      expect(errorEvent.error.stderr).toContain('please run agy login');
    }
  });

  it('terminates hung subprocess cleanly on AbortSignal and escalates kill if needed', async () => {
    const killSpy = vi.fn();
    let resolveExit!: (code: number | null) => void;
    const exitPromise = new Promise<number | null>((resolve) => {
      resolveExit = resolve;
    });

    const { runtime, removedSandboxes, createdSandboxes } = createMockRuntime({
      existingPaths: ['/usr/bin/codex'],
      customSpawn: async () => ({
        stdout: (async function* () {
          yield '{"type":"item.delta","item_type":"agent_message","delta":"partial"}\n';
          await new Promise((r) => setTimeout(r, 200));
        })(),
        stderr: chunksToAsync([]),
        exitCode: exitPromise,
        kill: (sig) => {
          killSpy(sig);
          if (sig === 'SIGTERM') {
            resolveExit(null);
          }
        },
      }),
    });

    const controller = new AbortController();
    const provider = new CodexCliProvider({ runtime, killGraceMs: 20 });
    const events: ProviderStreamEvent[] = [];

    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'long task' }],
      signal: controller.signal,
    })) {
      events.push(ev);
      if (ev.type === 'text_delta') {
        controller.abort();
      }
    }

    expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    expect(removedSandboxes).toEqual(createdSandboxes);
    expect(events.some((e) => e.type === 'error' && e.error.code === 'ABORTED')).toBe(true);
  });

  it('healthCheck reports missing executable cleanly without throwing', async () => {
    const { runtime } = createMockRuntime({ existingPaths: [] });
    const provider = new AntigravityCliProvider({ runtime });
    const result = await provider.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('real Node runtime creates an isolated temp sandbox cwd and deletes it after execution', async () => {
    const { access } = await import('node:fs/promises');
    const { BaseCliProvider } = await import('../base-cli-provider.js');

    class NodeEchoCliProvider extends BaseCliProvider {
      readonly id = 'node-echo-test';
      readonly name = 'Node Echo Test';
      readonly binaryName = 'node';

      protected override buildCommand() {
        return {
          args: [
            '-e',
            'console.log(JSON.stringify({ type: "cwd", cwd: process.cwd() })); console.log(JSON.stringify({ type: "done" }));',
          ],
        };
      }

      protected override parseNdjsonEvent(payload: unknown): ProviderStreamEvent[] {
        const rec = payload as { type?: string; cwd?: string };
        if (rec.type === 'cwd' && rec.cwd) {
          return [{ type: 'text_delta', text: rec.cwd }];
        }
        if (rec.type === 'done') {
          return [{ type: 'done', finishReason: 'stop' }];
        }
        return [];
      }

      override async listModels() {
        return [];
      }
    }

    const provider = new NodeEchoCliProvider({ executablePath: process.execPath });
    let reportedCwd = '';
    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'ping' }],
    })) {
      if (ev.type === 'text_delta') {
        reportedCwd += ev.text;
      }
    }

    expect(reportedCwd).toContain('yourtutor-cli-sandbox-');
    // Sandbox directory must be cleaned up automatically after process finishes
    await expect(access(reportedCwd)).rejects.toThrow();
  });
});
