import { BaseCliProvider, type BaseCliProviderConfig } from './base-cli-provider.js';
import { type ChatRequest, type ModelInfo, type ProviderStreamEvent } from './types.js';

export interface AntigravityCliConfig extends BaseCliProviderConfig {
  id?: string;
  name?: string;
  defaultEffort?: 'low' | 'medium' | 'high';
  /** Extra CLI flags if the user needs custom read-only overrides. */
  extraArgs?: string[];
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Antigravity official CLI provider (`agy -p --output-format stream-json`).
 * Runs inside an isolated empty temp directory with read-only / no-tools flags.
 */
export class AntigravityCliProvider extends BaseCliProvider {
  readonly id: string;
  readonly name: string;
  readonly binaryName = 'agy';
  private readonly defaultEffort?: 'low' | 'medium' | 'high';
  private readonly extraArgs: string[];

  constructor(config: AntigravityCliConfig = {}) {
    super(config);
    this.id = config.id ?? 'antigravity-cli';
    this.name = config.name ?? 'Antigravity CLI';
    this.defaultEffort = config.defaultEffort;
    this.extraArgs = config.extraArgs ?? [];
  }

  protected override buildCommand(
    request: ChatRequest,
    serializedPrompt: string
  ): { args: string[]; stdinText?: string } {
    const args: string[] = ['-p', serializedPrompt, '--output-format', 'stream-json'];
    const model = request.model ?? this.config.defaultModel;
    if (model) {
      args.push('--model', model);
    }
    const effort = request.effort ?? this.defaultEffort;
    if (effort) {
      args.push('--effort', effort);
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

    if (type === 'error') {
      const msg =
        typeof payload.message === 'string'
          ? payload.message
          : isRecord(payload.error) && typeof payload.error.message === 'string'
            ? payload.error.message
            : 'Antigravity CLI returned an error event.';
      events.push({
        type: 'error',
        error: { code: 'PROCESS_FAILED', message: msg },
      });
      return events;
    }

    if (type === 'thinking' || type === 'thinking_delta' || type === 'reasoning') {
      const text =
        typeof payload.delta === 'string'
          ? payload.delta
          : typeof payload.text === 'string'
            ? payload.text
            : '';
      if (text) {
        events.push({ type: 'thinking_delta', text });
      }
      return events;
    }

    if (type === 'text_delta' || type === 'content_delta' || type === 'delta') {
      const text =
        typeof payload.delta === 'string'
          ? payload.delta
          : typeof payload.text === 'string'
            ? payload.text
            : '';
      if (text) {
        events.push({ type: 'text_delta', text });
      }
      return events;
    }

    if (type === 'message' || type === 'assistant') {
      const content =
        payload.content ?? (isRecord(payload.message) ? payload.message.content : null);
      if (typeof content === 'string' && content.length > 0) {
        events.push({ type: 'text_delta', text: content });
      } else if (Array.isArray(content)) {
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

    if (type === 'usage' && isRecord(payload.usage)) {
      events.push({
        type: 'usage',
        usage: {
          inputTokens:
            typeof payload.usage.input_tokens === 'number' ? payload.usage.input_tokens : undefined,
          outputTokens:
            typeof payload.usage.output_tokens === 'number'
              ? payload.usage.output_tokens
              : undefined,
          totalTokens:
            typeof payload.usage.total_tokens === 'number' ? payload.usage.total_tokens : undefined,
        },
      });
      return events;
    }

    if (type === 'result' || type === 'done') {
      if (typeof payload.result === 'string' && payload.result.length > 0) {
        events.push({ type: 'text_delta', text: payload.result });
      }
      if (isRecord(payload.usage)) {
        events.push({
          type: 'usage',
          usage: {
            inputTokens:
              typeof payload.usage.input_tokens === 'number'
                ? payload.usage.input_tokens
                : undefined,
            outputTokens:
              typeof payload.usage.output_tokens === 'number'
                ? payload.usage.output_tokens
                : undefined,
            totalTokens:
              typeof payload.usage.total_tokens === 'number'
                ? payload.usage.total_tokens
                : undefined,
          },
        });
      }
      events.push({
        type: 'done',
        finishReason: typeof payload.finish_reason === 'string' ? payload.finish_reason : 'stop',
        raw: payload,
      });
      return events;
    }

    return events;
  }

  override async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro (Antigravity)',
        providerId: this.id,
        supportsThinking: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (Antigravity)',
        providerId: this.id,
        supportsThinking: true,
      },
      {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4 (Antigravity)',
        providerId: this.id,
        supportsThinking: true,
      },
    ];
  }
}
