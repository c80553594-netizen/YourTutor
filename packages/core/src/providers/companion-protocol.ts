import { z } from 'zod';

/**
 * Typed Companion Bridge protocol shared between Android/remote clients
 * (`CompanionBridgeProvider`) and the Desktop/Self-Hosted Companion Bridge HTTP/SSE server.
 */

export const COMPANION_PROTOCOL_VERSION = '1.0';

export const CompanionHealthResponseSchema = z.object({
  ok: z.boolean(),
  protocolVersion: z.string(),
  serverName: z.string().optional(),
  hostname: z.string().optional(),
  timestamp: z.number().optional(),
});
export type CompanionHealthResponse = z.infer<typeof CompanionHealthResponseSchema>;

export const CompanionRemoteModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  supportsVision: z.boolean().optional(),
  supportsThinking: z.boolean().optional(),
  contextWindow: z.number().optional(),
});

export const CompanionRemoteProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  runtime: z.enum(['desktop-cli', 'universal-api', 'companion-remote']),
  healthy: z.boolean(),
  supportsVision: z.boolean(),
  supportsThinking: z.boolean(),
  models: z.array(CompanionRemoteModelSchema),
});
export type CompanionRemoteProvider = z.infer<typeof CompanionRemoteProviderSchema>;

export const CompanionProvidersResponseSchema = z.object({
  protocolVersion: z.string().optional(),
  providers: z.array(CompanionRemoteProviderSchema),
});
export type CompanionProvidersResponse = z.infer<typeof CompanionProvidersResponseSchema>;

export const CompanionSyncRecordSchema = z.object({
  id: z.string(),
  updatedAt: z.number(),
  payload: z.record(z.unknown()),
});

export const CompanionSyncRequestSchema = z.object({
  deviceId: z.string().min(1),
  lastSyncedAt: z.number().int().min(0),
  courses: z.array(CompanionSyncRecordSchema).default([]),
  lessons: z.array(CompanionSyncRecordSchema).default([]),
  masteryRecords: z.array(CompanionSyncRecordSchema).default([]),
  practiceAttempts: z.array(CompanionSyncRecordSchema).default([]),
});
export type CompanionSyncRequest = z.infer<typeof CompanionSyncRequestSchema>;

export const CompanionSyncResponseSchema = z.object({
  serverTime: z.number(),
  merged: z.object({
    courses: z.array(CompanionSyncRecordSchema).default([]),
    lessons: z.array(CompanionSyncRecordSchema).default([]),
    masteryRecords: z.array(CompanionSyncRecordSchema).default([]),
    practiceAttempts: z.array(CompanionSyncRecordSchema).default([]),
  }),
});
export type CompanionSyncResponse = z.infer<typeof CompanionSyncResponseSchema>;

export const CompanionStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({ type: z.literal('thinking_delta'), text: z.string() }),
  z.object({
    type: z.literal('usage'),
    usage: z.object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('done'),
    finishReason: z.string().optional(),
    raw: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({
      code: z.enum([
        'EXECUTABLE_NOT_FOUND',
        'PROCESS_FAILED',
        'TIMEOUT',
        'ABORTED',
        'AUTH_ERROR',
        'HTTP_ERROR',
        'NETWORK_ERROR',
        'INVALID_RESPONSE',
        'SCHEMA_VALIDATION_ERROR',
        'UNSUPPORTED_CAPABILITY',
        'UNKNOWN',
      ]),
      message: z.string(),
      stderr: z.string().optional(),
      statusCode: z.number().optional(),
      retryable: z.boolean().optional(),
    }),
  }),
]);
