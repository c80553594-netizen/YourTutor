import { BaseCliProvider, type BaseCliProviderConfig } from './base-cli-provider.js';
import { type ChatRequest, type ModelInfo, type ProviderStreamEvent } from './types.js';

export interface ClaudeCodeCliConfig extends BaseCliProviderConfig {
  id?: string;
  name?: string;
  extraArgs?: string[];
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Anthropic Claude Code official CLI provider (`claude -p --output-format stream-json --bare`).
 * Enforces `--bare` and `--tools ""` inside an isolated empty temp directory to disable all file/shell tools.
 */
export class ClaudeCodeCliProvider extends BaseCliProvider {
  readonly id: string;
  readonly name: string;
  readonly binaryName = 'claude';
  private readonly extraArgs: string[];

  constructor(config: ClaudeCodeCliConfig = {}) {
    super(config);
    this.id = config.id ?? 'claude-code-cli';
    this.name = config.name ?? 'Claude Code CLI';
    this.extraArgs = config.extraArgs ?? [];
  }

  protected override buildCommand(
    request: ChatRequest,
    serializedPrompt: string
  ): { args: string[]; stdinText?: string } {
    const args: string[] = [
      '-p',
      serializedPrompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--bare',
      '--tools',
      '',
    ];
    const model = request.model ?? this.config.defaultModel;
    if (model) {
      args.push('--model', model);
    }
    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }
    return { args };
  }

  protected override parseNdjsonEvent(payload: unknown): ProviderStreamEvent[] {
    if (!isRecord(payload)) {
      return [];
    }

    const type = typeof payload.type === 'string' ? payload.type : '';
    const events: ProviderStreamEvent[] = [];

    if (type === 'stream_event' && isRecord(payload.event)) {
      const inner = payload.event;
      if (inner.type === 'content_block_delta' && isRecord(inner.delta)) {
        const delta = inner.delta;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          events.push({ type: 'text_delta', text: delta.text });
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          events.push({ type: 'thinking_delta', text: delta.thinking });
        }
      }
      return events;
    }

    if (type === 'assistant' && isRecord(payload.message)) {
      const content = payload.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!isRecord(block)) continue;
          if (block.type === 'thinking' && typeof block.thinking === 'string') {
            events.push({ type: 'thinking_delta', text: block.thinking });
          } else if (block.type === 'text' && typeof block.text === 'string') {
            events.push({ type: 'text_delta', text: block.text });
          }
        }
      }
      return events;
    }

    if (type === 'result') {
      if (payload.is_error === true) {
        events.push({
          type: 'error',
          error: {
            code: 'PROCESS_FAILED',
            message:
              typeof payload.result === 'string'
                ? payload.result
                : 'Claude Code CLI reported an error result.',
          },
        });
        return events;
      }

      if (isRecord(payload.usage)) {
        const input =
          typeof payload.usage.input_tokens === 'number' ? payload.usage.input_tokens : undefined;
        const output =
          typeof payload.usage.output_tokens === 'number' ? payload.usage.output_tokens : undefined;
        events.push({
          type: 'usage',
          usage: {
            inputTokens: input,
            outputTokens: output,
            totalTokens: input !== undefined && output !== undefined ? input + output : undefined,
          },
        });
      }

      events.push({
        type: 'done',
        finishReason: typeof payload.subtype === 'string' ? payload.subtype : 'stop',
        raw: payload,
      });
      return events;
    }

    if (type === 'error') {
      const msg =
        typeof payload.message === 'string'
          ? payload.message
          : isRecord(payload.error) && typeof payload.error.message === 'string'
            ? payload.error.message
            : 'Claude Code CLI error.';
      events.push({ type: 'error', error: { code: 'PROCESS_FAILED', message: msg } });
    }

    return events;
  }

  override async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5 (Claude Code)',
        providerId: this.id,
        supportsThinking: true,
      },
      {
        id: 'claude-opus-4-1',
        name: 'Claude Opus 4.1 (Claude Code)',
        providerId: this.id,
        supportsThinking: true,
      },
      {
        id: 'claude-haiku-3-5',
        name: 'Claude Haiku 3.5 (Claude Code)',
        providerId: this.id,
        supportsThinking: false,
      },
    ];
  }
}
