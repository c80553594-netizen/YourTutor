import { BaseCliProvider, type BaseCliProviderConfig } from './base-cli-provider.js';
import { type ChatRequest, type ModelInfo, type ProviderStreamEvent } from './types.js';

export interface CodexCliConfig extends BaseCliProviderConfig {
  id?: string;
  name?: string;
  extraArgs?: string[];
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * OpenAI Codex official CLI provider (`codex exec --json --sandbox read-only`).
 * Runs inside an isolated empty temp directory with read-only sandbox enforcement.
 */
export class CodexCliProvider extends BaseCliProvider {
  readonly id: string;
  readonly name: string;
  readonly binaryName = 'codex';
  private readonly extraArgs: string[];

  constructor(config: CodexCliConfig = {}) {
    super(config);
    this.id = config.id ?? 'codex-cli';
    this.name = config.name ?? 'OpenAI Codex CLI';
    this.extraArgs = config.extraArgs ?? [];
  }

  protected override buildCommand(
    request: ChatRequest,
    serializedPrompt: string
  ): { args: string[]; stdinText?: string } {
    const args: string[] = ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check'];
    const model = request.model ?? this.config.defaultModel;
    if (model) {
      args.push('-m', model);
    }
    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }
    // Pass prompt via stdin ('-') to avoid OS command-line length limits
    args.push('-');
    return { args, stdinText: serializedPrompt };
  }

  protected override parseNdjsonEvent(payload: unknown): ProviderStreamEvent[] {
    if (!isRecord(payload)) {
      return [];
    }

    const type = typeof payload.type === 'string' ? payload.type : '';
    const events: ProviderStreamEvent[] = [];

    if (type === 'error' || type === 'turn.failed') {
      const msg =
        typeof payload.message === 'string'
          ? payload.message
          : isRecord(payload.error) && typeof payload.error.message === 'string'
            ? payload.error.message
            : 'Codex CLI execution failed.';
      events.push({
        type: 'error',
        error: { code: 'PROCESS_FAILED', message: msg },
      });
      return events;
    }

    if (type === 'item.delta') {
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      const itemType = typeof payload.item_type === 'string' ? payload.item_type : '';
      if (delta) {
        if (itemType === 'reasoning') {
          events.push({ type: 'thinking_delta', text: delta });
        } else {
          events.push({ type: 'text_delta', text: delta });
        }
      }
      return events;
    }

    if (type === 'item.completed' && isRecord(payload.item)) {
      const item = payload.item;
      const itemType = typeof item.type === 'string' ? item.type : '';
      const text = typeof item.text === 'string' ? item.text : '';
      if (text) {
        if (itemType === 'reasoning') {
          events.push({ type: 'thinking_delta', text });
        } else if (itemType === 'agent_message' || itemType === 'message') {
          events.push({ type: 'text_delta', text });
        }
      }
      return events;
    }

    if (type === 'turn.completed') {
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
      events.push({ type: 'done', finishReason: 'stop', raw: payload });
      return events;
    }

    return events;
  }

  override async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'o3',
        name: 'OpenAI o3 (Codex)',
        providerId: this.id,
        supportsThinking: true,
      },
      {
        id: 'o4-mini',
        name: 'OpenAI o4-mini (Codex)',
        providerId: this.id,
        supportsThinking: true,
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1 (Codex)',
        providerId: this.id,
        supportsThinking: false,
      },
    ];
  }
}
