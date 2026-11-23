import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import { ProviderRegistry } from '../registry.js';
import {
  type ModelInfo,
  type ProviderCapabilities,
  type ProviderHealthResult,
  type ProviderStreamEvent,
  type StructuredRequest,
  type StructuredResult,
  type TutorProvider,
} from '../types.js';

function createStubProvider(
  id: string,
  capabilities: ProviderCapabilities,
  healthy = true
): TutorProvider {
  return {
    id,
    name: `Stub ${id}`,
    capabilities,
    async *streamChat(): AsyncIterable<ProviderStreamEvent> {
      yield { type: 'text_delta', text: `from:${id}` };
      yield { type: 'done', finishReason: 'stop' };
    },
    async generateStructured<TSchema extends z.ZodTypeAny>(
      _req: StructuredRequest<TSchema>
    ): Promise<StructuredResult<z.infer<TSchema>>> {
      throw new Error('Not used');
    },
    async healthCheck(): Promise<ProviderHealthResult> {
      return { providerId: id, ok: healthy, latencyMs: 5, message: healthy ? 'ok' : 'down' };
    },
    async listModels(): Promise<ModelInfo[]> {
      return [{ id: `${id}-model`, name: `${id}-model`, providerId: id }];
    },
  };
}

describe('ProviderRegistry', () => {
  it('filters desktop-cli vs mobile-compatible runtimes, vision capability, task routes, and batch health checks', async () => {
    const registry = new ProviderRegistry();

    const agyCli = createStubProvider('antigravity-cli', {
      runtime: 'desktop-cli',
      supportsVision: false,
      supportsThinking: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      supportsModelListing: true,
    });

    const geminiApi = createStubProvider('gemini-api', {
      runtime: 'universal-api',
      supportsVision: true,
      supportsThinking: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      supportsModelListing: true,
    });

    const companion = createStubProvider(
      'companion-bridge',
      {
        runtime: 'companion-remote',
        supportsVision: true,
        supportsThinking: true,
        supportsStructuredOutput: true,
        supportsStreaming: true,
        supportsModelListing: true,
      },
      false
    );

    registry.register(agyCli, { setAsDefault: true });
    registry.register(geminiApi);
    registry.register(companion);

    // Android should exclude desktop-cli providers
    const mobileProviders = registry.listMobileCompatible();
    expect(mobileProviders.map((p) => p.id)).toEqual(['gemini-api', 'companion-bridge']);

    // Vision filter
    const visionProviders = registry.list({ requireVision: true });
    expect(visionProviders.map((p) => p.id)).toEqual(['gemini-api', 'companion-bridge']);

    // Task routing: route exam reverse engineering (photo-heavy) to Gemini API, default to Antigravity CLI
    registry.setTaskRoute('reverse_engineer', 'gemini-api');
    expect(registry.resolveForTask('reverse_engineer').id).toBe('gemini-api');
    expect(registry.resolveForTask('teach').id).toBe('antigravity-cli');
    expect(registry.resolveForTask('teach', 'companion-bridge').id).toBe('companion-bridge');

    // Batch healthCheck
    const healthResults = await registry.healthCheckAll();
    expect(healthResults).toHaveLength(3);
    expect(healthResults.find((h) => h.providerId === 'companion-bridge')?.ok).toBe(false);

    // Unregistering routed provider cleans up task routes and reassigns default
    registry.unregister('antigravity-cli');
    expect(registry.getDefault()?.id).toBe('gemini-api');
  });
});
