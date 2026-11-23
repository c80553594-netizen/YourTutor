import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnthropicApiProvider } from '../anthropic-api-provider.js';
import { CompanionBridgeProvider } from '../companion-bridge-provider.js';
import { COMPANION_PROTOCOL_VERSION } from '../companion-protocol.js';
import { GeminiApiProvider } from '../gemini-api-provider.js';
import { OpenAICompatibleProvider } from '../openai-compatible-provider.js';
import { type ProviderStreamEvent } from '../types.js';

function sseResponse(frames: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) {
        controller.enqueue(encoder.encode(f));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function toUrlString(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('OpenAICompatibleProvider', () => {
  it('streams reasoning + text deltas, supports multimodal vision images, and lists models', async () => {
    const capturedBodies: unknown[] = [];
    const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
      const urlStr = toUrlString(url);
      if (urlStr.endsWith('/models')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'deepseek-reasoner' }, { id: 'qwen-vl-max' }] }),
          { status: 200 }
        );
      }
      capturedBodies.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'));
      return sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"Think first"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Answer: 42"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
        'data: [DONE]\n\n',
      ]);
    });

    const provider = new OpenAICompatibleProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1/',
      apiKey: 'sk-test',
      defaultModel: 'deepseek-reasoner',
      fetchFn: mockFetch,
    });

    expect(provider.capabilities.runtime).toBe('universal-api');
    expect(provider.capabilities.supportsVision).toBe(true);

    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      systemPrompt: 'Exam coach',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Solve this photo' },
            { type: 'image', mimeType: 'image/png', dataBase64: 'AAA=' },
          ],
        },
      ],
    })) {
      events.push(ev);
    }

    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Think first' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Answer: 42' });
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
    });
    expect(capturedBodies[0]).toMatchObject({
      model: 'deepseek-reasoner',
      messages: [
        { role: 'system', content: 'Exam coach' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Solve this photo' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA=' } },
          ],
        },
      ],
    });

    const models = await provider.listModels();
    expect(models.map((m) => m.id)).toEqual(['deepseek-reasoner', 'qwen-vl-max']);
  });

  it('auto-repairs malformed structured JSON output and validates with Zod', async () => {
    let callCount = 0;
    const mockFetch = vi.fn<typeof fetch>(async () => {
      callCount++;
      const content =
        callCount === 1
          ? '{"score": "not-a-number"}' // fails Zod schema
          : '```json\n{"score": 92, "topic": "Calculus"}\n```';
      return sseResponse([
        `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`,
        'data: [DONE]\n\n',
      ]);
    });

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'gpt-4o-mini',
      fetchFn: mockFetch,
    });

    const schema = z.object({ score: z.number(), topic: z.string() });
    const result = await provider.generateStructured({
      messages: [{ role: 'user', content: 'Grade answer' }],
      schema,
      schemaName: 'QuickGrade',
      maxRepairAttempts: 2,
    });

    expect(result.attempts).toBe(2);
    expect(result.data).toEqual({ score: 92, topic: 'Calculus' });
  });
});

describe('AnthropicApiProvider & GeminiApiProvider', () => {
  it('AnthropicApiProvider streams thinking and text blocks with usage stats', async () => {
    const mockFetch = vi.fn<typeof fetch>(async () =>
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":30}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Deriving"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Solution ready"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":45}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );

    const provider = new AnthropicApiProvider({ apiKey: 'ant-key', fetchFn: mockFetch });
    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'Teach me integrals' }],
    })) {
      events.push(ev);
    }

    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Deriving' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Solution ready' });
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 30, outputTokens: 45, totalTokens: 75 },
    });
  });

  it('GeminiApiProvider uses x-goog-api-key header and parses thought + text parts', async () => {
    let seenHeaders: unknown;
    const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
      seenHeaders = init?.headers;
      return sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Check sign","thought":true},{"text":"Final: x=3"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":14,"totalTokenCount":24}}\n\n',
      ]);
    });

    const provider = new GeminiApiProvider({ apiKey: 'gem-secret', fetchFn: mockFetch });
    const events: ProviderStreamEvent[] = [];
    for await (const ev of provider.streamChat({
      messages: [{ role: 'user', content: 'Solve 2x=6' }],
    })) {
      events.push(ev);
    }

    expect(seenHeaders).toMatchObject({ 'x-goog-api-key': 'gem-secret' });
    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Check sign' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'Final: x=3' });
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 10, outputTokens: 14, totalTokens: 24 },
    });
  });
});

describe('CompanionBridgeProvider', () => {
  it('sends Bearer pairing token on /health, /providers, /chat/stream, and /sync', async () => {
    const authHeaders: string[] = [];
    const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      authHeaders.push(headers.Authorization ?? '');
      const urlStr = toUrlString(url);

      if (urlStr.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            ok: true,
            protocolVersion: COMPANION_PROTOCOL_VERSION,
            hostname: 'macbook-pro.local',
          }),
          { status: 200 }
        );
      }

      if (urlStr.endsWith('/providers')) {
        return new Response(
          JSON.stringify({
            providers: [
              {
                id: 'antigravity-cli',
                name: 'Antigravity CLI',
                runtime: 'desktop-cli',
                healthy: true,
                supportsVision: false,
                supportsThinking: true,
                models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }],
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (urlStr.endsWith('/chat/stream')) {
        return sseResponse([
          'data: {"type":"thinking_delta","text":"Bridged reasoning"}\n\n',
          'data: {"type":"text_delta","text":"Bridged lesson text"}\n\n',
          'data: {"type":"done","finishReason":"stop"}\n\n',
        ]);
      }

      if (urlStr.endsWith('/sync')) {
        return new Response(
          JSON.stringify({
            serverTime: 1700000000,
            merged: { courses: [], lessons: [], masteryRecords: [], practiceAttempts: [] },
          }),
          { status: 200 }
        );
      }

      return new Response('Not found', { status: 404 });
    });

    const companion = new CompanionBridgeProvider({
      baseUrl: 'http://192.168.1.50:48720',
      pairingToken: 'pair-secret-token',
      defaultRemoteProviderId: 'antigravity-cli',
      fetchFn: mockFetch,
    });

    expect(companion.capabilities.runtime).toBe('companion-remote');

    const health = await companion.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.message).toContain('macbook-pro.local');

    const models = await companion.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.remoteProviderId).toBe('antigravity-cli');

    const events: ProviderStreamEvent[] = [];
    for await (const ev of companion.streamChat({
      messages: [{ role: 'user', content: 'Quiz me' }],
    })) {
      events.push(ev);
    }
    expect(events).toContainEqual({ type: 'text_delta', text: 'Bridged lesson text' });

    const syncRes = await companion.syncData({
      deviceId: 'android-pixel-9',
      lastSyncedAt: 0,
      courses: [],
      lessons: [],
      masteryRecords: [],
      practiceAttempts: [],
    });
    expect(syncRes.serverTime).toBe(1700000000);

    expect(authHeaders.every((h) => h === 'Bearer pair-secret-token')).toBe(true);
  });
});
