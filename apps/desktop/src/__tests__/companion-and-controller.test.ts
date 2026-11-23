import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CompanionBridgeProvider,
  type ModelInfo,
  type ProviderCapabilities,
  type ProviderHealthResult,
  ProviderRegistry,
  type ProviderStreamEvent,
  runStructuredWithRepair,
  type TutorProvider,
} from '@yourtutor/core';
import { createStorage, NodeSqliteDriver, type TutorStorage } from '@yourtutor/storage';
import { CompanionBridgeServer } from '../main/companion-server.js';
import {
  ElectronSafeStorageSecretStore,
  InMemorySecretStore,
} from '../main/secret-store.js';
import { DesktopTutorController } from '../main/tutor-controller.js';

let activeServer: CompanionBridgeServer | null = null;
let activeStorage: TutorStorage | null = null;

afterEach(async () => {
  if (activeServer) {
    await activeServer.stop();
    activeServer = null;
  }
  if (activeStorage) {
    await activeStorage.close();
    activeStorage = null;
  }
});

function createStubCliProvider(): TutorProvider {
  const capabilities: ProviderCapabilities = {
    runtime: 'desktop-cli',
    supportsVision: false,
    supportsThinking: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    supportsModelListing: true,
  };

  const provider: TutorProvider = {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    capabilities,
    async *streamChat(req): AsyncIterable<ProviderStreamEvent> {
      const userMsg = req.messages[req.messages.length - 1]?.content;
      const text = typeof userMsg === 'string' ? userMsg : '';
      yield { type: 'thinking_delta', text: 'Checking rubric' };
      yield { type: 'text_delta', text: `Bridged reply for: ${text}` };
      yield { type: 'done', finishReason: 'stop' };
    },
    generateStructured(request) {
      return runStructuredWithRepair(provider, request);
    },
    async healthCheck(): Promise<ProviderHealthResult> {
      return { providerId: 'antigravity-cli', ok: true, latencyMs: 5, message: 'ready' };
    },
    async listModels(): Promise<ModelInfo[]> {
      return [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', providerId: 'antigravity-cli' }];
    },
  };
  return provider;
}

describe('CompanionBridgeServer <-> CompanionBridgeProvider loopback integration', () => {
  it('enforces Bearer token auth and bridges /health, /providers, /chat/stream, and /sync', async () => {
    const registry = new ProviderRegistry();
    registry.register(createStubCliProvider(), { setAsDefault: true });

    activeServer = new CompanionBridgeServer({
      registry,
      host: '127.0.0.1',
      port: 0, // ephemeral free port
      pairingToken: 'super-secret-pair-token',
    });

    expect(activeServer.getStatus().running).toBe(false);
    const status = await activeServer.start();
    expect(status.running).toBe(true);
    expect(status.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(status.qrPayload).toContain('super-secret-pair-token');

    // Wrong token must be rejected with 401
    const badClient = new CompanionBridgeProvider({
      baseUrl: status.baseUrl!,
      pairingToken: 'wrong-token',
    });
    const badHealth = await badClient.healthCheck();
    expect(badHealth.ok).toBe(false);
    expect(badHealth.message).toContain('rejected');

    // Valid token succeeds across all endpoints
    const goodClient = new CompanionBridgeProvider({
      baseUrl: status.baseUrl!,
      pairingToken: 'super-secret-pair-token',
      defaultRemoteProviderId: 'antigravity-cli',
    });

    const health = await goodClient.healthCheck();
    expect(health.ok).toBe(true);

    const models = await goodClient.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('gemini-2.5-pro');
    expect(models[0]?.remoteProviderId).toBe('antigravity-cli');

    const events: ProviderStreamEvent[] = [];
    for await (const ev of goodClient.streamChat({
      messages: [{ role: 'user', content: 'Explain Taylor expansion' }],
    })) {
      events.push(ev);
    }
    expect(events).toContainEqual({ type: 'thinking_delta', text: 'Checking rubric' });
    expect(events).toContainEqual({
      type: 'text_delta',
      text: 'Bridged reply for: Explain Taylor expansion',
    });
  });
});

describe('ElectronSafeStorageSecretStore & DesktopTutorController', () => {
  it('encrypts secrets via safeStorage without writing plaintext and persists provider secretRef', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'yourtutor-vault-test-'));
    try {
      const vaultFile = join(tempDir, 'secrets.vault.json');
      const fakeSafeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (plain: string) => Buffer.from(`ENC:${plain}`, 'utf8'),
        decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^ENC:/, ''),
      };

      const secretStore = new ElectronSafeStorageSecretStore(vaultFile, fakeSafeStorage);
      const ref = await secretStore.setSecret('gemini-api', 'sk-real-secret-999');
      expect(ref).toBe('safeStorage://gemini-api');
      expect(await secretStore.getSecret(ref)).toBe('sk-real-secret-999');

      // Controller stores only secretRef in SQLite, never plaintext secret
      activeStorage = await createStorage(new NodeSqliteDriver(':memory:'));
      const controller = new DesktopTutorController({
        storage: activeStorage,
        secretStore: new InMemorySecretStore(),
      });

      const saved = await controller.saveProviderConfig({
        id: 'custom-deepseek',
        providerType: 'openai-compatible',
        displayName: 'DeepSeek',
        enabled: true,
        config: { baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
        secretValue: 'sk-never-in-sqlite',
      });
      expect(saved.secretRef).toBe('mem-secret://custom-deepseek');
      expect(JSON.stringify(saved.config)).not.toContain('sk-never-in-sqlite');
      expect(controller.registry.has('custom-deepseek')).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
