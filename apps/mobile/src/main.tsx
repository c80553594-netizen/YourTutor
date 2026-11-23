import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import '@yourtutor/ui/styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createStorage } from '@yourtutor/storage';
import { YourTutorApp } from '@yourtutor/ui';
import { CapacitorSqliteDriver } from './bridge/capacitor-sqlite-driver.js';
import { AndroidKeystoreSecretStore } from './bridge/keystore-secret-store.js';
import { MobileAppBridge } from './bridge/mobile-app-bridge.js';

async function bootstrapMobile(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void CapacitorApp.minimizeApp();
      }
    });
  }

  const driver = new CapacitorSqliteDriver({ dbName: 'yourtutor_mobile' });
  const storage = await createStorage(driver);
  const secretStore = new AndroidKeystoreSecretStore();
  const bridge = new MobileAppBridge({ storage, secretStore });
  await bridge.initializeFromStoredConfigs();

  const rootEl = document.getElementById('root');
  if (rootEl) {
    createRoot(rootEl).render(
      <React.StrictMode>
        <YourTutorApp bridge={bridge} />
      </React.StrictMode>
    );
  }
}

void bootstrapMobile();
