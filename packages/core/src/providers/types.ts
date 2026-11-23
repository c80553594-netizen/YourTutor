import { type z } from 'zod';

/**
 * Declares where a provider can execute:
 * - desktop-cli: Local CLI binary on Windows/macOS/Linux desktop or self-hosted server.
 * - universal-api: Direct HTTP/HTTPS API usable on both Desktop and Android.
 * - companion-remote: Remote desktop/server Companion Bridge over HTTP/SSE with Bearer Token.
 */
export type ProviderRuntime = 'desktop-cli' | 'universal-api' | 'companion-remote';

export interface ProviderCapabilities {
  runtime: ProviderRuntime;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  supportsModelListing: boolean;
}

export type MessageContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mimeType: string;
      /** Base64 encoded image payload (without data URL prefix). */
      dataBase64?: string;
      /** Optional remote or data URL. */
      url?: string;
    };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Reasoning effort hint (supported by Antigravity / Codex / Anthropic / Gemini). */
  effort?: 'low' | 'medium' | 'high';
  /** Optional target remote provider ID when routing through CompanionBridgeProvider. */
  remoteProviderId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StructuredRequest<TSchema extends z.ZodTypeAny> extends ChatRequest {
  schema: TSchema;
  schemaName?: string;
  schemaDescription?: string;
  /** Maximum automatic repair retries when JSON parsing or Zod validation fails. Default: 2. */
  maxRepairAttempts?: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ProviderErrorInfo {
  code:
    | 'EXECUTABLE_NOT_FOUND'
    | 'PROCESS_FAILED'
    | 'TIMEOUT'
    | 'ABORTED'
    | 'AUTH_ERROR'
    | 'HTTP_ERROR'
    | 'NETWORK_ERROR'
    | 'INVALID_RESPONSE'
    | 'SCHEMA_VALIDATION_ERROR'
    | 'UNSUPPORTED_CAPABILITY'
    | 'UNKNOWN';
  message: string;
  stderr?: string;
  statusCode?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorInfo['code'];
  readonly stderr?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(info: ProviderErrorInfo) {
    super(info.message, info.cause !== undefined ? { cause: info.cause } : undefined);
    this.name = 'ProviderError';
    this.code = info.code;
    this.stderr = info.stderr;
    this.statusCode = info.statusCode;
    this.retryable = info.retryable ?? false;
  }

  toInfo(): ProviderErrorInfo {
    return {
      code: this.code,
      message: this.message,
      stderr: this.stderr,
      statusCode: this.statusCode,
      retryable: this.retryable,
    };
  }
}

export type ProviderStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done'; finishReason?: string; raw?: unknown }
  | { type: 'error'; error: ProviderErrorInfo };

export interface StructuredResult<T> {
  data: T;
  rawText: string;
  attempts: number;
  usage?: TokenUsage;
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  contextWindow?: number;
  remoteProviderId?: string;
}

export interface ProviderHealthResult {
  providerId: string;
  ok: boolean;
  latencyMs: number;
  message: string;
  resolvedPath?: string;
  version?: string;
  details?: Record<string, unknown>;
}

export type TutorTaskType = 'reverse_engineer' | 'plan' | 'teach' | 'grade' | 'drill';

/**
 * Unified model provider interface implemented by all CLI, API, and Companion adapters.
 */
export interface TutorProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  streamChat(request: ChatRequest): AsyncIterable<ProviderStreamEvent>;

  generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredRequest<TSchema>
  ): Promise<StructuredResult<z.infer<TSchema>>>;

  healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult>;

  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
}

/**
 * Helper to flatten ChatMessage content to plain text for text-only providers or prompt rendering.
 */
export function extractTextFromContent(content: string | MessageContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }
      return `[Attached Image: ${part.mimeType}]`;
    })
    .join('\n');
}

/**
 * Checks whether a chat request contains any image content parts.
 */
export function requestHasImages(messages: ChatMessage[]): boolean {
  return messages.some(
    (msg) => Array.isArray(msg.content) && msg.content.some((part) => part.type === 'image')
  );
}
