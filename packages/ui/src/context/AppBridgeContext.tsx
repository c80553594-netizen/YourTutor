import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { type AppBridge, type HostCapabilities } from '../bridge/types.js';
import { UI_MESSAGES, type UiLocale, type UiMessages } from '../i18n/messages.js';

export type UiTheme = 'light' | 'dark';

interface AppBridgeContextValue {
  bridge: AppBridge;
  hostCapabilities: HostCapabilities;
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: UiMessages;
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
}

const DEFAULT_CAPABILITIES: HostCapabilities = {
  platform: 'web-preview',
  supportsLocalCli: false,
  supportsCompanionServer: false,
  supportsCameraCapture: false,
  supportsClipboardImagePaste: true,
};

const AppBridgeContext = createContext<AppBridgeContextValue | null>(null);

export interface AppBridgeProviderProps {
  bridge: AppBridge;
  initialLocale?: UiLocale;
  initialTheme?: UiTheme;
  children: React.ReactNode;
}

export function AppBridgeProvider({
  bridge,
  initialLocale = 'zh-CN',
  initialTheme = 'light',
  children,
}: AppBridgeProviderProps): React.ReactElement {
  const [hostCapabilities, setHostCapabilities] = useState<HostCapabilities>(DEFAULT_CAPABILITIES);
  const [locale, setLocale] = useState<UiLocale>(initialLocale);
  const [theme, setTheme] = useState<UiTheme>(initialTheme);

  useEffect(() => {
    let active = true;
    void bridge.getHostCapabilities().then((caps) => {
      if (active) {
        setHostCapabilities(caps);
      }
    });
    return () => {
      active = false;
    };
  }, [bridge]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo<AppBridgeContextValue>(
    () => ({
      bridge,
      hostCapabilities,
      locale,
      setLocale,
      t: UI_MESSAGES[locale],
      theme,
      setTheme,
    }),
    [bridge, hostCapabilities, locale, theme]
  );

  return <AppBridgeContext.Provider value={value}>{children}</AppBridgeContext.Provider>;
}

export function useAppBridge(): AppBridgeContextValue {
  const ctx = useContext(AppBridgeContext);
  if (!ctx) {
    throw new Error('useAppBridge must be used inside <AppBridgeProvider>.');
  }
  return ctx;
}
