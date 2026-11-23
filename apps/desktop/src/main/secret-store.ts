import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface SecretStore {
  setSecret(key: string, plaintextValue: string): Promise<string>;
  getSecret(secretRef: string): Promise<string | null>;
  deleteSecret(secretRef: string): Promise<void>;
}

/**
 * In-memory SecretStore used in unit tests and ephemeral preview runs.
 */
export class InMemorySecretStore implements SecretStore {
  private readonly secrets = new Map<string, string>();

  async setSecret(key: string, plaintextValue: string): Promise<string> {
    const ref = `mem-secret://${key}`;
    this.secrets.set(ref, plaintextValue);
    return ref;
  }

  async getSecret(secretRef: string): Promise<string | null> {
    return this.secrets.get(secretRef) ?? null;
  }

  async deleteSecret(secretRef: string): Promise<void> {
    this.secrets.delete(secretRef);
  }
}

export interface ElectronSafeStorageLike {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
}

/**
 * Encrypted secret store backed by Electron's OS keychain (`safeStorage`).
 * Only stores base64-encoded ciphertext blobs on disk; never persists plaintext keys.
 */
export class ElectronSafeStorageSecretStore implements SecretStore {
  private readonly vaultFilePath: string;
  private readonly safeStorage: ElectronSafeStorageLike;

  constructor(vaultFilePath: string, safeStorage: ElectronSafeStorageLike) {
    this.vaultFilePath = vaultFilePath;
    this.safeStorage = safeStorage;
  }

  private async readVault(): Promise<Record<string, string>> {
    try {
      const raw = await readFile(this.vaultFilePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private async writeVault(vault: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.vaultFilePath), { recursive: true });
    await writeFile(this.vaultFilePath, JSON.stringify(vault, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  async setSecret(key: string, plaintextValue: string): Promise<string> {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS keychain encryption (Electron safeStorage) is unavailable; refusing to persist plaintext secret.'
      );
    }
    const encrypted = this.safeStorage.encryptString(plaintextValue);
    const ref = `safeStorage://${key}`;
    const vault = await this.readVault();
    vault[ref] = encrypted.toString('base64');
    await this.writeVault(vault);
    return ref;
  }

  async getSecret(secretRef: string): Promise<string | null> {
    const vault = await this.readVault();
    const cipherB64 = vault[secretRef];
    if (!cipherB64) {
      return null;
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      return null;
    }
    return this.safeStorage.decryptString(Buffer.from(cipherB64, 'base64'));
  }

  async deleteSecret(secretRef: string): Promise<void> {
    const vault = await this.readVault();
    if (secretRef in vault) {
      delete vault[secretRef];
      await this.writeVault(vault);
    }
  }
}
