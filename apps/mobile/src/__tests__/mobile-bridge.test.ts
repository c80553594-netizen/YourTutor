import { afterEach, describe, expect, it, vi } from 'vitest';
import { AntigravityCliProvider, ProviderRegistry } from '@yourtutor/core';
import { createStorage, NodeSqliteDriver, type TutorStorage } from '@yourtutor/storage';
import {
  type CapacitorDbConnectionLike,
  CapacitorSqliteDriver,
} from '../bridge/capacitor-sqlite-driver.js';
import { AndroidKeystoreSecretStore } from '../bridge/keystore-secret-store.js';
import { MobileAppBridge } from '../bridge/mobile-app-bridge.js';
import {
  mergeRecordsByTimestamp,
  parseCompanionPairingPayload,
} from '../bridge/sync-merger.js';

let activeStorage: TutorStorage | null = null;

afterEach(async () => {
  if (activeStorage) {
    await activeStorage.close();
    activeStorage = null;
  }
});

describe('CapacitorSqliteDriver', () => {
  it('adapts @capacitor-community/sqlite queries, writes, and transactions to @yourtutor/storage SqlDriver', async () => {
    const calls: string[] = [];
    const mockConn: CapacitorDbConnectionLike = {
      async query(sql) {
        calls.push(`query:${sql}`);
        return { values: [{ id: 'c1', title: 'Kaoyan English' }] };
      },
      async run(sql) {
        calls.push(`run:${sql}`);
        return { changes: { changes: 1, lastId: 7 } };
      },
      async execute(sql) {
        calls.push(`exec:${sql}`);
        return { changes: { changes: 0 } };
      },
      async beginTransaction() {
        calls.push('BEGIN');
      },
      async commitTransaction() {
        calls.push('COMMIT');
      },
      async rollbackTransaction() {
        calls.push('ROLLBACK');
      },
      async close() {
        calls.push('CLOSE');
      },
    };

    const driver = new CapacitorSqliteDriver({ connection: mockConn });
    const rows = await driver.queryValues('SELECT id, title FROM courses');
    expect(rows).toEqual([['c1', 'Kaoyan English']]);

    await driver.transaction(async () => {
      const res = await driver.execute('DELETE FROM courses WHERE id = ?', ['c1']);
      expect(res.changes).toBe(1);
    });

    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
    await driver.close();
    expect(calls).toContain('CLOSE');
  });
});

describe('Mobile Sync Merger & Companion QR Pairing Parser', () => {
  it('merges local and remote records conflict-safely by newest updatedAt timestamp', () => {
    const merged = mergeRecordsByTimestamp(
      [
        { id: 'kp-1', updatedAt: 100, payload: { score: 50 } },
        { id: 'kp-2', updatedAt: 300, payload: { score: 85 } },
      ],
      [
        { id: 'kp-1', updatedAt: 200, payload: { score: 78 } },
        { id: 'kp-2', updatedAt: 150, payload: { score: 40 } },
        { id: 'kp-3', updatedAt: 250, payload: { score: 62 } },
      ]
    );

    const byId = new Map(merged.map((m) => [m.id, m]));
    expect(byId.get('kp-1')?.payload).toEqual({ score: 78 }); // remote newer
    expect(byId.get('kp-2')?.payload).toEqual({ score: 85 }); // local newer
    expect(byId.get('kp-3')?.payload).toEqual({ score: 62 }); // remote new
  });

  it('parses both JSON QR payloads and yourtutor://pair deep links', () => {
    const fromJson = parseCompanionPairingPayload(
      JSON.stringify({
        protocol: '1.0',
        baseUrl: 'http://192.168.1.25:48720/',
        token: 'abc-123',
        hostname: 'study-pc',
      })
    );
    expect(fromJson).toEqual({
      baseUrl: 'http://192.168.1.25:48720',
      pairingToken: 'abc-123',
      hostname: 'study-pc',
    });

    const fromUri = parseCompanionPairingPayload(
      'yourtutor://pair?url=http%3A%2F%2F10.0.0.5%3A48720&token=xyz-999&host=macbook'
    );
    expect(fromUri).toEqual({
      baseUrl: 'http://10.0.0.5:48720',
      pairingToken: 'xyz-999',
      hostname: 'macbook',
    });

    expect(parseCompanionPairingPayload('invalid-text')).toBeNull();
  });
});

describe('MobileAppBridge (Standalone API + Companion Bridge + Keystore Security)', () => {
  it('excludes desktop-cli locally, stores secrets in Android Keystore, and merges synced courses', async () => {
    const keystoreMap = new Map<string, string>();
    const secretStore = new AndroidKeystoreSecretStore({
      async set({ key, value }) {
        keystoreMap.set(key, value);
      },
      async get({ key }) {
        return { value: keystoreMap.get(key) ?? null };
      },
      async remove({ key }) {
        keystoreMap.delete(key);
      },
    });

    activeStorage = await createStorage(new NodeSqliteDriver(':memory:'));
    const registry = new ProviderRegistry();
    // Even if a desktop-cli provider is registered in the registry, MobileAppBridge must filter it out
    registry.register(new AntigravityCliProvider());

    const mockFetch = vi.fn<typeof fetch>(async (url) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.endsWith('/sync')) {
        return new Response(
          JSON.stringify({
            serverTime: 5000,
            merged: {
              courses: [
                {
                  id: 'desktop-course-1',
                  updatedAt: 4000,
                  payload: {
                    id: 'desktop-course-1',
                    title: 'Desktop Synced Physics',
                    examType: '高考物理',
                    teachingStyle: 'coach',
                    detailLevel: 'standard',
                  },
                },
              ],
              lessons: [],
              masteryRecords: [
                {
                  id: 'm-sync-1',
                  updatedAt: 4500,
                  payload: {
                    id: 'm-sync-1',
                    courseId: 'desktop-course-1',
                    knowledgePoint: '牛顿第二定律连接体',
                    score: 88,
                    status: 'mastered',
                    errorTags: [],
                    pitfallMemo: '先整体后隔离',
                  },
                },
              ],
              practiceAttempts: [],
            },
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const bridge = new MobileAppBridge({
      storage: activeStorage,
      secretStore,
      registry,
      fetchFn: mockFetch,
    });

    const caps = await bridge.getHostCapabilities();
    expect(caps.platform).toBe('mobile-android');
    expect(caps.supportsCameraCapture).toBe(true);
    expect(caps.supportsLocalCli).toBe(false);

    // Save standalone Gemini API + Companion Bridge configs
    const savedGemini = await bridge.saveProviderConfig({
      id: 'gemini-standalone',
      providerType: 'gemini-api',
      displayName: 'Gemini Standalone',
      enabled: true,
      config: { defaultModel: 'gemini-2.5-flash' },
      secretValue: 'gem-mobile-secret',
      isDefault: true,
    });
    expect(savedGemini.secretRef).toBe('android-keystore://gemini-standalone');
    expect(keystoreMap.get('android-keystore://gemini-standalone')).toBe('gem-mobile-secret');

    await bridge.saveProviderConfig({
      id: 'companion-bridge',
      providerType: 'companion-bridge',
      displayName: 'Desktop Companion',
      enabled: true,
      config: { baseUrl: 'http://192.168.1.50:48720' },
      secretValue: 'pair-token-777',
    });

    const visibleProviders = await bridge.listProviders();
    expect(visibleProviders.map((p) => p.id)).toEqual(['gemini-standalone', 'companion-bridge']);
    expect(visibleProviders.some((p) => p.capabilities.runtime === 'desktop-cli')).toBe(false);

    // Sync profile from Desktop Companion and verify merged data persisted to local SQLite
    const syncRes = await bridge.syncWithCompanion('http://192.168.1.50:48720', 'pair-token-777');
    expect(syncRes.serverTime).toBe(5000);

    const courses = await bridge.listCourses();
    expect(courses.some((c) => c.id === 'desktop-course-1')).toBe(true);

    const mastery = await bridge.listMasteryRecords('desktop-course-1');
    expect(mastery[0]?.knowledgePoint).toBe('牛顿第二定律连接体');
    expect(mastery[0]?.pitfallMemo).toBe('先整体后隔离');
  });
});
