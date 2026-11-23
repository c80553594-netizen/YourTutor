import { Capacitor, registerPlugin } from '@capacitor/core';

export interface MobileSecretStore {
  setSecret(key: string, plaintextValue: string): Promise<string>;
  getSecret(secretRef: string): Promise<string | null>;
  deleteSecret(secretRef: string): Promise<void>;
}

/**
 * Native Android Keystore bridge plugin contract (backed by Android EncryptedSharedPreferences / Keystore).
 */
interface YourTutorKeystorePlugin {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value?: string | null }>;
  remove(options: { key: string }): Promise<void>;
}

const NativeKeystore = registerPlugin<YourTutorKeystorePlugin>('YourTutorKeystore');

/**
 * Android Keystore encrypted secret store.
 *
 * Security rule (AGENTS.md): Plaintext API keys & Companion pairing tokens MUST NEVER
 * be written into browser `localStorage` or unencrypted SQLite columns.
 * On native Android, delegates to the Android Keystore plugin (`YourTutorKeystore`);
 * in non-native web preview/tests, keeps secrets strictly in volatile process memory only.
 */
export class AndroidKeystoreSecretStore implements MobileSecretStore {
  private readonly volatileMemory = new Map<string, string>();
  private readonly nativePlugin?: YourTutorKeystorePlugin;

  constructor(nativePlugin?: YourTutorKeystorePlugin) {
    this.nativePlugin = nativePlugin;
  }

  private getActiveNativePlugin(): YourTutorKeystorePlugin | null {
    if (this.nativePlugin) {
      return this.nativePlugin;
    }
    if (Capacitor.isNativePlatform()) {
      return NativeKeystore;
    }
    return null;
  }

  async setSecret(key: string, plaintextValue: string): Promise<string> {
    const ref = `android-keystore://${key}`;
    const plugin = this.getActiveNativePlugin();
    if (plugin) {
      await plugin.set({ key: ref, value: plaintextValue });
    } else {
      // Strictly volatile memory in web/test mode — NEVER localStorage!
      this.volatileMemory.set(ref, plaintextValue);
    }
    return ref;
  }

  async getSecret(secretRef: string): Promise<string | null> {
    const plugin = this.getActiveNativePlugin();
    if (plugin) {
      try {
        const res = await plugin.get({ key: secretRef });
        return res.value ?? null;
      } catch {
        return null;
      }
    }
    return this.volatileMemory.get(secretRef) ?? null;
  }

  async deleteSecret(secretRef: string): Promise<void> {
    const plugin = this.getActiveNativePlugin();
    if (plugin) {
      await plugin.remove({ key: secretRef });
    } else {
      this.volatileMemory.delete(secretRef);
    }
  }
}
