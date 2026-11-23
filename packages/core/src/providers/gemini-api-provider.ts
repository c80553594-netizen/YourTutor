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

export interface GeminiApiConfig {
  id?: string;
  name?: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchFn?: typeof fetch;
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function toGeminiContent(msg: ChatMessage): { role: 'user' | 'model'; parts: GeminiPart[] } {
  const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
  if (typeof msg.content === 'string') {
    return { role, parts: [{ text: msg.content }] };
  }
  const parts: GeminiPart[] = [];
  for (const part of msg.content) {
    if (part.type === 'text') {
      parts.push({ text: part.text });
    } else if (part.dataBase64) {
      parts.push({
        inlineData: {
          mimeType: part.mimeType,
          data: part.dataBase64,
        },
      });
    } else if (part.url) {
      parts.push({ text: `[Image URL: ${part.url}]` });
    }
  }
  return { role, parts };
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Official Google Gemini Generative Language API provider (SSE streaming).
 * Sends API key via `x-goog-api-key` header to avoid leaking secrets in URLs.
 */
export class GeminiApiProvider implements TutorProvider {
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
  private readonly fetchFn: typeof fetch;

  constructor(config: GeminiApiConfig) {
    this.id = config.id ?? 'gemini-api';
    this.name = config.name ?? 'Google Gemini API';
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(
      /\/+$/,
      ''
    );
    this.defaultModel = config.defaultModel ?? 'gemini-2.5-flash';
    this.fetchFn = config.fetchFn ?? fetch;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const model = (request.model ?? this.defaultModel).replace(/^models\//, '');
    const systemParts: string[] = [];
    if (request.systemPrompt?.trim()) {
      systemParts.push(request.systemPrompt.trim());
    }

    const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = [];
    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemParts.push(extractTextFromContent(msg.content));
      } else {
        contents.push(toGeminiContent(msg));
      }
    }

    const body: Record<string, unknown> = { contents };
    if (systemParts.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemParts.join('\n\n') }],
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: request.signal,
        }
      );
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
          message: `Gemini API error (${response.status}): ${errText.slice(0, 500)}`,
          retryable: response.status >= 500 || response.status === 429,
        },
      };
      return;
    }

    if (!response.body) {
      yield {
        type: 'error',
        error: { code: 'INVALID_RESPONSE', message: 'Gemini response body is empty.' },
      };
      return;
    }

    let lastFinishReason: string | undefined;

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

      if (isRecord(parsed.error)) {
        yield {
          type: 'error',
          error: {
            code: 'HTTP_ERROR',
            message:
              typeof parsed.error.message === 'string'
                ? parsed.error.message
                : 'Gemini stream returned an error.',
          },
        };
        return;
      }

      const candidates: unknown[] = Array.isArray(parsed.candidates) ? parsed.candidates : [];
      const firstCandidate = candidates[0];
      if (isRecord(firstCandidate)) {
        if (typeof firstCandidate.finishReason === 'string') {
          lastFinishReason = firstCandidate.finishReason;
        }
        const content = firstCandidate.content;
        if (isRecord(content) && Array.isArray(content.parts)) {
          for (const part of content.parts) {
            if (!isRecord(part) || typeof part.text !== 'string') continue;
            if (part.thought === true) {
              yield { type: 'thinking_delta', text: part.text };
            } else if (part.text.length > 0) {
              yield { type: 'text_delta', text: part.text };
            }
          }
        }
      }

      if (isRecord(parsed.usageMetadata)) {
        const meta = parsed.usageMetadata;
        yield {
          type: 'usage',
          usage: {
            inputTokens:
              typeof meta.promptTokenCount === 'number' ? meta.promptTokenCount : undefined,
            outputTokens:
              typeof meta.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : undefined,
            totalTokens:
              typeof meta.totalTokenCount === 'number' ? meta.totalTokenCount : undefined,
          },
        };
      }
    }

    if (!request.signal?.aborted) {
      yield { type: 'done', finishReason: lastFinishReason ?? 'STOP' };
    }
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredRequest<TSchema>
  ): Promise<StructuredResult<z.infer<TSchema>>> {
    return runStructuredWithRepair(this, request);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/v1beta/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });

      if (response.ok) {
        const json: unknown = await response.json();
        if (isRecord(json) && Array.isArray(json.models)) {
          const models: ModelInfo[] = [];
          for (const item of json.models) {
            if (isRecord(item) && typeof item.name === 'string') {
              const id = item.name.replace(/^models\//, '');
              if (id.includes('gemini')) {
                models.push({
                  id,
                  name: typeof item.displayName === 'string' ? item.displayName : id,
                  providerId: this.id,
                  supportsVision: true,
                  supportsThinking: id.includes('2.5') || id.includes('thinking'),
                });
              }
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
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        providerId: this.id,
        supportsVision: true,
        supportsThinking: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        providerId: this.id,
        supportsVision: true,
        supportsThinking: true,
      },
    ];
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchFn(`${this.baseUrl}/v1beta/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });
      if (response.ok) {
        return {
          providerId: this.id,
          ok: true,
          latencyMs: Date.now() - startedAt,
          message: 'Google Gemini API connection verified.',
        };
      }
      return {
        providerId: this.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: `Google Gemini API returned HTTP ${response.status}.`,
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
