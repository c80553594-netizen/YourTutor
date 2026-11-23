import { type z } from 'zod';
import {
  COMPANION_PROTOCOL_VERSION,
  CompanionHealthResponseSchema,
  CompanionProvidersResponseSchema,
  CompanionStreamEventSchema,
  type CompanionRemoteProvider,
  type CompanionSyncRequest,
  type CompanionSyncResponse,
  CompanionSyncResponseSchema,
} from './companion-protocol.js';
import { parseSseStream } from './sse-parser.js';
import { runStructuredWithRepair } from './structured-output.js';
import {
  type ChatRequest,
  type ModelInfo,
  type ProviderCapabilities,
  ProviderError,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type StructuredRequest,
  type StructuredResult,
  type TutorProvider,
} from './types.js';

export interface CompanionBridgeConfig {
  id?: string;
  name?: string;
  /** Companion Bridge server base URL, e.g. http://192.168.1.25:48720 */
  baseUrl: string;
  /** Pairing Bearer token (stored securely via Android Keystore / OS keychain). */
  pairingToken: string;
  /** Default remote provider ID on the desktop/server (e.g. 'antigravity-cli', 'codex-cli', 'claude-code-cli'). */
  defaultRemoteProviderId?: string;
  defaultModel?: string;
  fetchFn?: typeof fetch;
}

/**
 * HTTP/SSE Companion Bridge client adapter enabling Android (and remote clients)
 * to securely invoke desktop/server subscriptions (Antigravity / Codex / Claude Code)
 * and sync study records using a Bearer pairing token.
 */
export class CompanionBridgeProvider implements TutorProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    runtime: 'companion-remote',
    supportsVision: true,
    supportsThinking: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsModelListing: true,
  };

  private readonly baseUrl: string;
  private readonly pairingToken: string;
  private readonly defaultRemoteProviderId?: string;
  private readonly defaultModel?: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: CompanionBridgeConfig) {
    this.id = config.id ?? 'companion-bridge';
    this.name = config.name ?? 'Desktop Companion Bridge';
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.pairingToken = config.pairingToken;
    this.defaultRemoteProviderId = config.defaultRemoteProviderId;
    this.defaultModel = config.defaultModel;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  private buildHeaders(includeJson = true): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.pairingToken}`,
      'X-YourTutor-Protocol': COMPANION_PROTOCOL_VERSION,
    };
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const payload = {
      remoteProviderId: request.remoteProviderId ?? this.defaultRemoteProviderId,
      model: request.model ?? this.defaultModel,
      systemPrompt: request.systemPrompt,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      effort: request.effort,
    };

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(payload),
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
          message: `Companion Bridge error (${response.status}): ${errText.slice(0, 500)}`,
          retryable: response.status >= 500,
        },
      };
      return;
    }

    if (!response.body) {
      yield {
        type: 'error',
        error: { code: 'INVALID_RESPONSE', message: 'Companion Bridge stream body is empty.' },
      };
      return;
    }

    let emittedDone = false;
    for await (const frame of parseSseStream(response.body, request.signal)) {
      if (frame.data === '[DONE]') {
        emittedDone = true;
        yield { type: 'done', finishReason: 'stop' };
        break;
      }

      let rawJson: unknown;
      try {
        rawJson = JSON.parse(frame.data) as unknown;
      } catch {
        continue;
      }

      const parsed = CompanionStreamEventSchema.safeParse(rawJson);
      if (parsed.success) {
        if (parsed.data.type === 'done') {
          emittedDone = true;
        }
        yield parsed.data;
        if (parsed.data.type === 'error') {
          return;
        }
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

  async fetchRemoteProviders(signal?: AbortSignal): Promise<CompanionRemoteProvider[]> {
    const response = await this.fetchFn(`${this.baseUrl}/providers`, {
      method: 'GET',
      headers: this.buildHeaders(false),
      signal,
    });

    if (!response.ok) {
      throw new ProviderError({
        code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR',
        statusCode: response.status,
        message: `Failed to list Companion providers (HTTP ${response.status}).`,
      });
    }

    const json: unknown = await response.json();
    const parsed = CompanionProvidersResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        message: `Invalid Companion /providers payload: ${parsed.error.message}`,
      });
    }

    return parsed.data.providers;
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const remoteProviders = await this.fetchRemoteProviders(signal);
    const models: ModelInfo[] = [];

    for (const remote of remoteProviders) {
      for (const m of remote.models) {
        models.push({
          id: m.id,
          name: `${m.name} via ${remote.name}`,
          providerId: this.id,
          remoteProviderId: remote.id,
          supportsVision: m.supportsVision ?? remote.supportsVision,
          supportsThinking: m.supportsThinking ?? remote.supportsThinking,
          contextWindow: m.contextWindow,
        });
      }
    }

    return models;
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchFn(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.buildHeaders(false),
        signal,
      });

      if (!response.ok) {
        return {
          providerId: this.id,
          ok: false,
          latencyMs: Date.now() - startedAt,
          message:
            response.status === 401 || response.status === 403
              ? 'Companion Bridge rejected the pairing token.'
              : `Companion Bridge health check failed with HTTP ${response.status}.`,
        };
      }

      const json: unknown = await response.json();
      const parsed = CompanionHealthResponseSchema.safeParse(json);
      if (!parsed.success || !parsed.data.ok) {
        return {
          providerId: this.id,
          ok: false,
          latencyMs: Date.now() - startedAt,
          message: 'Companion Bridge reported unhealthy status.',
        };
      }

      return {
        providerId: this.id,
        ok: true,
        latencyMs: Date.now() - startedAt,
        version: parsed.data.protocolVersion,
        message: `Connected to Companion Bridge${parsed.data.hostname ? ` (${parsed.data.hostname})` : ''}.`,
        details: {
          serverName: parsed.data.serverName,
          hostname: parsed.data.hostname,
        },
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

  /**
   * Synchronizes courses, lessons, mastery records, and practice attempts with the desktop companion.
   */
  async syncData(
    request: CompanionSyncRequest,
    signal?: AbortSignal
  ): Promise<CompanionSyncResponse> {
    const response = await this.fetchFn(`${this.baseUrl}/sync`, {
      method: 'POST',
      headers: this.buildHeaders(true),
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      throw new ProviderError({
        code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR',
        statusCode: response.status,
        message: `Companion sync failed with HTTP ${response.status}.`,
      });
    }

    const json: unknown = await response.json();
    const parsed = CompanionSyncResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        message: `Invalid Companion /sync payload: ${parsed.error.message}`,
      });
    }

    return parsed.data;
  }
}
