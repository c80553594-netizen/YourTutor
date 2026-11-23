import { asc, eq } from 'drizzle-orm';
import { type ProviderConfigModel } from '@yourtutor/core';
import { type TutorDatabase } from '../database.js';
import { type SqlDriver } from '../driver.js';
import { providerConfigsTable } from '../schema.js';

export interface SaveProviderConfigInput {
  id: string;
  providerType: string;
  displayName: string;
  enabled?: boolean;
  /** Non-secret configuration only (baseUrl, defaultModel, executablePath, etc.). */
  config?: Record<string, unknown>;
  /** Reference ID to OS Keychain / Electron safeStorage / Android Keystore entry. */
  secretRef?: string | null;
  isDefault?: boolean;
  updatedAt?: number;
}

const FORBIDDEN_SECRET_KEYS = new Set([
  'apikey',
  'api_key',
  'pairingtoken',
  'pairing_token',
  'secret',
  'password',
  'token',
]);

function assertNoPlaintextSecrets(config: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(config)) {
    if (
      FORBIDDEN_SECRET_KEYS.has(key.toLowerCase()) &&
      typeof value === 'string' &&
      value.trim().length > 0
    ) {
      throw new Error(
        `Security policy violation: plaintext secret field '${key}' must not be stored in provider_configs.configJson. Use 'secretRef' backed by OS keychain/keystore instead.`
      );
    }
  }
}

function mapProviderConfigRow(row: typeof providerConfigsTable.$inferSelect): ProviderConfigModel {
  let config: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.configJson) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    config = {};
  }

  return {
    id: row.id,
    providerType: row.providerType,
    displayName: row.displayName,
    enabled: row.enabled === 1,
    config,
    secretRef: row.secretRef,
    isDefault: row.isDefault === 1,
    updatedAt: row.updatedAt,
  };
}

export class ProviderConfigRepository {
  constructor(
    private readonly db: TutorDatabase,
    private readonly driver: SqlDriver
  ) {}

  async save(input: SaveProviderConfigInput): Promise<ProviderConfigModel> {
    const safeConfig = input.config ?? {};
    assertNoPlaintextSecrets(safeConfig);
    const updatedAt = input.updatedAt ?? Date.now();

    await this.driver.transaction(async () => {
      if (input.isDefault) {
        await this.db.update(providerConfigsTable).set({ isDefault: 0 });
      }

      const existing = await this.findById(input.id);
      if (existing) {
        await this.db
          .update(providerConfigsTable)
          .set({
            providerType: input.providerType,
            displayName: input.displayName,
            enabled: (input.enabled ?? existing.enabled) ? 1 : 0,
            configJson: JSON.stringify(safeConfig),
            secretRef:
              input.secretRef !== undefined ? input.secretRef : (existing.secretRef ?? null),
            isDefault: (input.isDefault ?? existing.isDefault) ? 1 : 0,
            updatedAt,
          })
          .where(eq(providerConfigsTable.id, input.id));
      } else {
        await this.db.insert(providerConfigsTable).values({
          id: input.id,
          providerType: input.providerType,
          displayName: input.displayName,
          enabled: (input.enabled ?? true) ? 1 : 0,
          configJson: JSON.stringify(safeConfig),
          secretRef: input.secretRef ?? null,
          isDefault: input.isDefault ? 1 : 0,
          updatedAt,
        });
      }
    });

    const saved = await this.findById(input.id);
    if (!saved) {
      throw new Error(`Failed to reload saved provider config '${input.id}'.`);
    }
    return saved;
  }

  async findById(id: string): Promise<ProviderConfigModel | null> {
    const row = await this.db
      .select()
      .from(providerConfigsTable)
      .where(eq(providerConfigsTable.id, id))
      .get();
    return row ? mapProviderConfigRow(row) : null;
  }

  async listAll(): Promise<ProviderConfigModel[]> {
    const rows = await this.db
      .select()
      .from(providerConfigsTable)
      .orderBy(asc(providerConfigsTable.displayName))
      .all();
    return rows.map(mapProviderConfigRow);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(providerConfigsTable).where(eq(providerConfigsTable.id, id));
  }
}
