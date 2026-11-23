import { type ProviderRuntime } from '@yourtutor/core';
import { type HostCapabilities } from '@yourtutor/ui';

export * from './main/secret-store.js';
export * from './main/companion-server.js';
export * from './main/tutor-controller.js';

export const DESKTOP_HOST_CAPABILITIES: HostCapabilities = {
  platform: 'desktop-electron',
  supportsLocalCli: true,
  supportsCompanionServer: true,
  supportsCameraCapture: false,
  supportsClipboardImagePaste: true,
};

export const DESKTOP_ALLOWED_PROVIDER_RUNTIMES: readonly ProviderRuntime[] = [
  'desktop-cli',
  'universal-api',
  'companion-remote',
];
