import { type ProviderRuntime } from '@yourtutor/core';
import { type HostCapabilities } from '@yourtutor/ui';

export * from './bridge/capacitor-sqlite-driver.js';
export * from './bridge/keystore-secret-store.js';
export * from './bridge/image-processor.js';
export * from './bridge/sync-merger.js';
export * from './bridge/mobile-app-bridge.js';

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
