import '@yourtutor/ui/styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { type AppBridge, YourTutorApp } from '@yourtutor/ui';
import { createWebPreviewMockBridge } from './mock-bridge.js';

declare global {
  interface Window {
    yourTutorBridge?: AppBridge;
  }
}

const bridge: AppBridge = window.yourTutorBridge ?? createWebPreviewMockBridge();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <YourTutorApp bridge={bridge} />
    </React.StrictMode>
  );
}
