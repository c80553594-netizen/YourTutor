import { type z } from 'zod';
import { parseSseStream } from './sse-parser.js';
import { runStructuredWithRepair } from './structured-output.js';
import {
  type ChatMessage,
  type ChatRequest,
  extractTextFromContent,
  type ModelInfo,
  type ProviderCapabilities,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type StructuredRequest,
  type StructuredResult,
  type TutorProvider,
} from './types.js';

export interface AnthropicApiConfig {
  id?: string;
  name?: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  anthropicVersion?: string;
  fetchFn?: typeof fetch;
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
    };

function toAnthropicMessage(msg: ChatMessage): {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
} {
  const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';
  if (typeof msg.content === 'string') {
    return { role, content: msg.content };
  }

  const blocks: AnthropicContentBlock[] = [];
  for (const part of msg.content) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text });
    } else if (part.dataBase64) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mimeType,
          data: part.dataBase64,
        },
      });
    } else if (part.url) {
      blocks.push({
        type: 'image',
        source: { type: 'url', url: part.url },
      });
    }
  }
  return { role, content: blocks };
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Official Anthropic Messages API provider (`POST /v1/messages`).
 * Supports vision multimodal inputs, extended thinking streams, and model listing.
 */
export class AnthropicApiProvider implements TutorProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    runtime: 'universal-api',
    supportsVision: true,
    supportsThinking: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsModelListing: true,
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly anthropicVersion: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: AnthropicApiConfig) {
    this.id = config.id ?? 'anthropic-api';
    this.name = config.name ?? 'Anthropic API';
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    this.defaultModel = config.defaultModel ?? 'claude-sonnet-4-5-20250929';
    this.anthropicVersion = config.anthropicVersion ?? '2023-06-01';
    this.fetchFn = config.fetchFn ?? fetch;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.anthropicVersion,
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const systemParts: string[] = [];
    if (request.systemPrompt?.trim()) {
      systemParts.push(request.systemPrompt.trim());
    }

    const messages: Array<{
      role: 'user' | 'assistant';
      content: string | AnthropicContentBlock[];
    }> = [];
    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemParts.push(extractTextFromContent(msg.content));
      } else {
        messages.push(toAnthropicMessage(msg));
      }
    }

    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      messages,
    };
    if (systemParts.length > 0) {
      body.system = systemParts.join('\n\n');
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (err) {
      const aborted = request.signal?.aborted === true;
      yield {
        type: 'error',
        error: {
          code: aborted ? 'ABORTED' : 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: !aborted,
        },
      };
      return;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      yield {
        type: 'error',
        error: {
          code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR',
          statusCode: response.status,
          message: `Anthropic API error (${response.status}): ${errText.slice(0, 500)}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      };
      return;
    }

    if (!response.body) {
      yield {
        type: 'error',
        error: { code: 'INVALID_RESPONSE', message: 'Anthropic response body is empty.' },
      };
      return;
    }

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let emittedDone = false;

    for await (const frame of parseSseStream(response.body, request.signal)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(frame.data) as unknown;
      } catch {
        continue;
      }
      if (!isRecord(parsed)) {
        continue;
      }

      const evType = typeof parsed.type === 'string' ? parsed.type : (frame.event ?? '');

      if (
        evType === 'message_start' &&
        isRecord(parsed.message) &&
        isRecord(parsed.message.usage)
      ) {
        if (typeof parsed.message.usage.input_tokens === 'number') {
          inputTokens = parsed.message.usage.input_tokens;
        }
      } else if (evType === 'content_block_delta' && isRecord(parsed.delta)) {
        const delta = parsed.delta;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          yield { type: 'text_delta', text: delta.text };
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          yield { type: 'thinking_delta', text: delta.thinking };
        }
      } else if (evType === 'message_delta' && isRecord(parsed.usage)) {
        if (typeof parsed.usage.output_tokens === 'number') {
          outputTokens = parsed.usage.output_tokens;
        }
      } else if (evType === 'message_stop') {
        if (inputTokens !== undefined || outputTokens !== undefined) {
          yield {
            type: 'usage',
            usage: {
              inputTokens,
              outputTokens,
              totalTokens:
                inputTokens !== undefined && outputTokens !== undefined
                  ? inputTokens + outputTokens
                  : undefined,
            },
          };
        }
        emittedDone = true;
        yield { type: 'done', finishReason: 'stop' };
      } else if (evType === 'error') {
        const errMsg =
          isRecord(parsed.error) && typeof parsed.error.message === 'string'
            ? parsed.error.message
            : 'Anthropic stream error.';
        yield { type: 'error', error: { code: 'HTTP_ERROR', message: errMsg } };
        return;
      }
    }

    if (!emittedDone && !request.signal?.aborted) {
      yield { type: 'done', finishReason: 'stop' };
    }
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredRequest<TSchema>
  ): Promise<StructuredResult<z.infer<TSchema>>> {
    return runStructuredWithRepair(this, request);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });

      if (response.ok) {
        const json: unknown = await response.json();
        if (isRecord(json) && Array.isArray(json.data)) {
          const models: ModelInfo[] = [];
          for (const item of json.data) {
            if (isRecord(item) && typeof item.id === 'string') {
              models.push({
                id: item.id,
                name: typeof item.display_name === 'string' ? item.display_name : item.id,
                providerId: this.id,
                supportsVision: true,
                supportsThinking: true,
              });
            }
          }
          if (models.length > 0) {
            return models;
          }
        }
      }
    } catch {
      // Fallback to curated list
    }

    return [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        providerId: this.id,
        supportsVision: true,
        supportsThinking: true,
      },
      {
        id: 'claude-opus-4-1-20250805',
        name: 'Claude Opus 4.1',
        providerId: this.id,
        supportsVision: true,
        supportsThinking: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        providerId: this.id,
        supportsVision: true,
        supportsThinking: false,
      },
    ];
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchFn(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });
      if (response.ok) {
        return {
          providerId: this.id,
          ok: true,
          latencyMs: Date.now() - startedAt,
          message: 'Anthropic API connection verified.',
        };
      }
      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: `Anthropic API returned HTTP ${response.status}.`,
      };
    } catch (err) {
      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
