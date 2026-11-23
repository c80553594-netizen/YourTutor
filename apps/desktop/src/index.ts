import { type ProviderRuntime } from '@yourtutor/core';
import { type SqlDriver } from '@yourtutor/storage';
import { type HostCapabilities } from '@yourtutor/ui';

/**
 * Phase 1 scaffold for Electron Desktop shell (`apps/desktop`).
 * Full Electron main/preload IPC, Companion Bridge server, and `dev:web` preview
 * will be implemented in Phase 2.
 */
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

export interface DesktopBootstrapContext {
  storageDriver: SqlDriver;
}
