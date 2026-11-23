import { type z } from 'zod';
import { parseSseStream } from './sse-parser.js';
import { runStructuredWithRepair } from './structured-output.js';
import {
  type ChatMessage,
  type ChatRequest,
  type ModelInfo,
  type ProviderCapabilities,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type StructuredRequest,
  type StructuredResult,
  type TutorProvider,
} from './types.js';

export interface OpenAICompatibleConfig {
  id?: string;
  name?: string;
  /** Base URL without trailing slash, e.g. https://api.openai.com/v1 or http://localhost:11434/v1 */
  baseUrl: string;
  /** API key (optional for local Ollama / LM Studio). */
  apiKey?: string;
  defaultModel: string;
  supportsVision?: boolean;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
}

interface OpenAIMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

function toOpenAIMessage(msg: ChatMessage): OpenAIMessagePayload {
  if (typeof msg.content === 'string') {
    return { role: msg.role, content: msg.content };
  }

  return {
    role: msg.role,
    content: msg.content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      const imageUrl =
        part.url ?? (part.dataBase64 ? `data:${part.mimeType};base64,${part.dataBase64}` : '');
      return { type: 'image_url', image_url: { url: imageUrl } };
    }),
  };
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Universal OpenAI-compatible HTTP/SSE provider covering OpenAI, DeepSeek, Qwen,
 * OpenRouter, Ollama, LM Studio, vLLM, and any custom OpenAI-compatible endpoint.
 */
export class OpenAICompatibleProvider implements TutorProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultModel: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetchFn: typeof fetch;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id ?? 'openai-compatible';
    this.name = config.name ?? 'OpenAI-Compatible API';
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.extraHeaders = config.headers ?? {};
    this.fetchFn = config.fetchFn ?? fetch;
    this.capabilities = {
      runtime: 'universal-api',
      supportsVision: config.supportsVision ?? true,
      supportsThinking: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      supportsModelListing: true,
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const messages: OpenAIMessagePayload[] = [];
    if (request.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: request.systemPrompt.trim() });
    }
    for (const msg of request.messages) {
      messages.push(toOpenAIMessage(msg));
    }

    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
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
          message: `OpenAI-compatible API error (${response.status}): ${errText.slice(0, 500)}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      };
      return;
    }

    if (!response.body) {
      yield {
        type: 'error',
        error: { code: 'INVALID_RESPONSE', message: 'Response body stream is empty.' },
      };
      return;
    }

    let emittedDone = false;
    let lastFinishReason: string | undefined;

    for await (const frame of parseSseStream(response.body, request.signal)) {
      if (frame.data === '[DONE]') {
        emittedDone = true;
        yield { type: 'done', finishReason: lastFinishReason ?? 'stop' };
        break;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(frame.data) as unknown;
      } catch {
        continue;
      }

      if (!isRecord(parsed)) {
        continue;
      }

      if (isRecord(parsed.error)) {
        yield {
          type: 'error',
          error: {
            code: 'HTTP_ERROR',
            message:
              typeof parsed.error.message === 'string'
                ? parsed.error.message
                : 'Provider returned an inline stream error.',
          },
        };
        return;
      }

      const choices: unknown[] = Array.isArray(parsed.choices) ? parsed.choices : [];
      const firstChoice = choices[0];
      if (isRecord(firstChoice)) {
        if (typeof firstChoice.finish_reason === 'string') {
          lastFinishReason = firstChoice.finish_reason;
        }
        const delta = firstChoice.delta;
        if (isRecord(delta)) {
          // Support DeepSeek R1 / QwQ reasoning_content deltas
          const reasoning =
            typeof delta.reasoning_content === 'string'
              ? delta.reasoning_content
              : typeof delta.reasoning === 'string'
                ? delta.reasoning
                : '';
          if (reasoning) {
            yield { type: 'thinking_delta', text: reasoning };
          }
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            yield { type: 'text_delta', text: delta.content };
          }
        }
      }

      if (isRecord(parsed.usage)) {
        yield {
          type: 'usage',
          usage: {
            inputTokens:
              typeof parsed.usage.prompt_tokens === 'number'
                ? parsed.usage.prompt_tokens
                : undefined,
            outputTokens:
              typeof parsed.usage.completion_tokens === 'number'
                ? parsed.usage.completion_tokens
                : undefined,
            totalTokens:
              typeof parsed.usage.total_tokens === 'number' ? parsed.usage.total_tokens : undefined,
          },
        };
      }
    }

    if (!emittedDone && !request.signal?.aborted) {
      yield { type: 'done', finishReason: lastFinishReason ?? 'stop' };
    }
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredRequest<TSchema>
  ): Promise<StructuredResult<z.infer<TSchema>>> {
    return runStructuredWithRepair(this, request);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });

      if (!response.ok) {
        return [
          {
            id: this.defaultModel,
            name: this.defaultModel,
            providerId: this.id,
            supportsVision: this.capabilities.supportsVision,
          },
        ];
      }

      const json: unknown = await response.json();
      if (isRecord(json) && Array.isArray(json.data)) {
        const models: ModelInfo[] = [];
        for (const item of json.data) {
          if (isRecord(item) && typeof item.id === 'string') {
            models.push({
              id: item.id,
              name: item.id,
              providerId: this.id,
              supportsVision: this.capabilities.supportsVision,
            });
          }
        }
        if (models.length > 0) {
          return models;
        }
      }
    } catch {
      // Fallback to defaultModel if endpoint does not implement /models
    }

    return [
      {
        id: this.defaultModel,
        name: this.defaultModel,
        providerId: this.id,
        supportsVision: this.capabilities.supportsVision,
      },
    ];
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchFn(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });

      if (response.ok) {
        return {
          providerId: this.id,
          ok: true,
          latencyMs: Date.now() - startedAt,
          message: `Connected to ${this.name} (${this.baseUrl}).`,
        };
      }

      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: `${this.name} health check failed with HTTP ${response.status}.`,
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
