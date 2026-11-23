import { type ProviderRuntime } from '@yourtutor/core';
import { type SqlDriver } from '@yourtutor/storage';
import { type HostCapabilities } from '@yourtutor/ui';

/**
 * Phase 1 scaffold for Capacitor Android shell (`apps/mobile`).
 * Full Capacitor Android project, `@capacitor-community/sqlite` driver, Android Keystore,
 * camera exam capture, and Companion QR pairing will be implemented in Phase 3.
 */
export const MOBILE_HOST_CAPABILITIES: HostCapabilities = {
  platform: 'mobile-android',
  supportsLocalCli: false,
  supportsCompanionServer: false,
  supportsCameraCapture: true,
  supportsClipboardImagePaste: false,
};

export const MOBILE_ALLOWED_PROVIDER_RUNTIMES: readonly ProviderRuntime[] = [
  'universal-api',
  'companion-remote',
];

export interface MobileBootstrapContext {
  storageDriver: SqlDriver;
}
