import {
  Activity,
  CheckCircle2,
  Cpu,
  KeyRound,
  Layers,
  QrCode,
  RefreshCw,
  Smartphone,
  Terminal,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';
import {
  createDefaultPromptPackRegistry,
  type ProviderConfigModel,
  type ProviderHealthResult,
} from '@yourtutor/core';
import { type CompanionServerStatus, type ProviderSummary } from '../../bridge/types.js';
import { Badge, Button, Card } from '../../components/ui/primitives.js';
import { useAppBridge } from '../../context/AppBridgeContext.js';

export interface SettingsViewProps {
  providers: ProviderSummary[];
  onProvidersChanged: () => void;
}

type SettingsTab = 'cli' | 'api' | 'companion' | 'packs';

export function SettingsView({
  providers,
  onProvidersChanged,
}: SettingsViewProps): React.ReactElement {
  const { bridge, hostCapabilities, t } = useAppBridge();
  const [tab, setTab] = useState<SettingsTab>(hostCapabilities.supportsLocalCli ? 'cli' : 'api');
  const [configs, setConfigs] = useState<ProviderConfigModel[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, ProviderHealthResult>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // API form state
  const [apiType, setApiType] = useState<'openai-compatible' | 'anthropic-api' | 'gemini-api'>(
    'openai-compatible'
  );
  const [apiName, setApiName] = useState('DeepSeek / Custom OpenAI');
  const [apiBaseUrl, setApiBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiDefaultModel, setApiDefaultModel] = useState('deepseek-chat');
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Companion Server (Desktop) & Client (Mobile) state
  const [companionServer, setCompanionServer] = useState<CompanionServerStatus>({
    running: false,
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [companionUrl, setCompanionUrl] = useState('http://192.168.1.100:48720');
  const [companionToken, setCompanionToken] = useState('');
  const [qrPasteInput, setQrPasteInput] = useState('');
  const [syncing, setSyncing] = useState(false);

  const packs = createDefaultPromptPackRegistry().list();

  const reloadConfigs = async () => {
    const list = await bridge.listProviderConfigs();
    setConfigs(list);
    if (bridge.getCompanionServerStatus) {
      const st = await bridge.getCompanionServerStatus();
      setCompanionServer(st);
    }
  };

  useEffect(() => {
    void reloadConfigs();
  }, [bridge]);

  useEffect(() => {
    if (companionServer.running && companionServer.qrPayload) {
      void QRCode.toDataURL(companionServer.qrPayload, { width: 180, margin: 1 }).then(
        setQrDataUrl,
        () => setQrDataUrl('')
      );
    } else {
      setQrDataUrl('');
    }
  }, [companionServer.running, companionServer.qrPayload]);

  const handleHealthCheck = async (providerId: string) => {
    setCheckingId(providerId);
    try {
      const res = await bridge.checkProviderHealth(providerId);
      setHealthMap((prev) => ({ ...prev, [providerId]: res }));
    } finally {
      setCheckingId(null);
    }
  };

  const handleSaveApiConfig = async () => {
    setStatusMsg(null);
    const id = `${apiType}:${apiName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await bridge.saveProviderConfig({
      id,
      providerType: apiType,
      displayName: apiName.trim() || apiType,
      enabled: true,
      config: {
        baseUrl: apiBaseUrl.trim(),
        defaultModel: apiDefaultModel.trim(),
      },
      secretValue: apiKeyInput.trim() || undefined,
      isDefault: false,
    });
    setApiKeyInput('');
    setStatusMsg(`已加密保存 ${apiName}（密钥已通过安全存储加密，不落盘明文）。`);
    await reloadConfigs();
    onProvidersChanged();
  };

  const handleToggleCompanionServer = async () => {
    if (!bridge.setCompanionServerEnabled) {
      return;
    }
    const next = await bridge.setCompanionServerEnabled(!companionServer.running);
    setCompanionServer(next);
  };

  const handleParsePairingPayload = () => {
    try {
      const trimmed = qrPasteInput.trim();
      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed) as { baseUrl?: string; token?: string };
        if (parsed.baseUrl) setCompanionUrl(parsed.baseUrl);
        if (parsed.token) setCompanionToken(parsed.token);
        setStatusMsg('已解析配对二维码数据，请点击“保存配置”建立伴侣连接。');
      } else if (trimmed.startsWith('yourtutor://pair')) {
        const urlObj = new URL(trimmed);
        const baseUrl = urlObj.searchParams.get('url');
        const token = urlObj.searchParams.get('token');
        if (baseUrl) setCompanionUrl(baseUrl);
        if (token) setCompanionToken(token);
        setStatusMsg('已解析 yourtutor:// 配对链接。');
      }
    } catch {
      setStatusMsg('无法解析配对内容，请检查格式或手动填入地址与 Token。');
    }
  };

  const handleSaveCompanionClient = async () => {
    setStatusMsg(null);
    await bridge.saveProviderConfig({
      id: 'companion-bridge',
      providerType: 'companion-bridge',
      displayName: 'Desktop Companion Bridge',
      enabled: true,
      config: { baseUrl: companionUrl.trim() },
      secretValue: companionToken.trim() || undefined,
    });
    setStatusMsg('已保存桌面伴侣桥接配置（配对 Token 已安全加密存储）。');
    await reloadConfigs();
    onProvidersChanged();
  };

  const handleSyncCompanion = async () => {
    if (!bridge.syncWithCompanion) {
      return;
    }
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await bridge.syncWithCompanion(companionUrl.trim(), companionToken.trim());
      setStatusMsg(
        `同步完成（服务端时间 ${new Date(res.serverTime).toLocaleTimeString()}）：已合并 ${res.merged.courses.length} 门课程、${res.merged.masteryRecords.length} 条学情记录。`
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const cliProviders = providers.filter((p) => p.capabilities.runtime === 'desktop-cli');
  const apiProviders = providers.filter((p) => p.capabilities.runtime === 'universal-api');

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-8">
      <h1 className="text-lg font-bold tracking-tight">{t.settingsTitle}</h1>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: 'var(--yt-border)' }}>
        {[
          { id: 'cli' as const, label: t.tabLocalCli, icon: Terminal },
          { id: 'api' as const, label: t.tabModelApis, icon: KeyRound },
          { id: 'companion' as const, label: t.tabCompanion, icon: Smartphone },
          { id: 'packs' as const, label: t.tabPromptPacks, icon: Layers },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <Button
              key={item.id}
              variant={active ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </div>

      {statusMsg && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--yt-accent-soft)',
            borderColor: 'var(--yt-accent)',
            color: 'var(--yt-text-primary)',
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* 1. Local CLI Subscriptions Tab */}
      {tab === 'cli' && (
        <div className="space-y-3">
          {!hostCapabilities.supportsLocalCli && (
            <Card className="text-xs">
              <p style={{ color: 'var(--yt-text-secondary)' }}>
                当前运行环境不支持直接调用本机桌面 CLI（Antigravity / Codex / Claude Code）。请在「
                {t.tabCompanion}」标签页连接你的桌面端/自托管伴侣服务，或在「{t.tabModelApis}
                」直接配置官方/兼容模型 API。
              </p>
            </Card>
          )}
          {cliProviders.map((provider) => {
            const health = healthMap[provider.id];
            return (
              <Card key={provider.id} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
                    <span className="text-sm font-semibold">{provider.name}</span>
                    <Badge tone="neutral">{provider.capabilities.runtime}</Badge>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={checkingId === provider.id}
                    onClick={() => void handleHealthCheck(provider.id)}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    <span>{t.healthCheckBtn}</span>
                  </Button>
                </div>
                {health && (
                  <div className="flex items-center gap-2 text-xs">
                    {health.ok ? (
                      <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--yt-mastery-mastered)' }} />
                    ) : (
                      <XCircle className="h-4 w-4" style={{ color: 'var(--yt-mastery-weak)' }} />
                    )}
                    <span>
                      {health.message} ({health.latencyMs}ms)
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 2. Standard APIs Tab */}
      {tab === 'api' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {apiProviders.map((provider) => {
              const health = healthMap[provider.id];
              return (
                <Card key={provider.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{provider.name}</span>
                    <div className="flex gap-1">
                      {provider.capabilities.supportsVision && <Badge tone="accent">Vision</Badge>}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={checkingId === provider.id}
                        onClick={() => void handleHealthCheck(provider.id)}
                      >
                        {t.healthCheckBtn}
                      </Button>
                    </div>
                  </div>
                  {health && (
                    <div className="text-xs" style={{ color: 'var(--yt-text-secondary)' }}>
                      {health.ok ? '✅ ' : '⚠️ '}
                      {health.message}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <Card className="space-y-3">
            <div className="text-sm font-semibold">添加 / 更新模型 API 配置</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <label className="space-y-1">
                <span>接口类型</span>
                <select
                  value={apiType}
                  onChange={(e) =>
                    setApiType(
                      e.target.value as 'openai-compatible' | 'anthropic-api' | 'gemini-api'
                    )
                  }
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                >
                  <option value="openai-compatible">OpenAI / DeepSeek / Qwen / Ollama 兼容接口</option>
                  <option value="anthropic-api">Anthropic 官方 API</option>
                  <option value="gemini-api">Google Gemini 官方 API</option>
                </select>
              </label>
              <label className="space-y-1">
                <span>显示名称</span>
                <input
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                />
              </label>
              <label className="space-y-1">
                <span>Base URL</span>
                <input
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                />
              </label>
              <label className="space-y-1">
                <span>默认模型</span>
                <input
                  value={apiDefaultModel}
                  onChange={(e) => setApiDefaultModel(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span>API Key（使用 OS Keychain / Android Keystore 加密存储，本地 Ollama 可留空）</span>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                />
              </label>
            </div>
            <Button size="sm" onClick={() => void handleSaveApiConfig()}>
              {t.saveConfigBtn}
            </Button>

            {configs.length > 0 && (
              <div className="border-t pt-3 text-xs" style={{ borderColor: 'var(--yt-border)' }}>
                <div className="mb-1.5 font-medium">已保存的加密配置引用：</div>
                <div className="space-y-1">
                  {configs.map((cfg) => (
                    <div key={cfg.id} className="flex items-center justify-between">
                      <span>
                        {cfg.displayName} ({cfg.providerType})
                      </span>
                      <Badge tone="neutral">{cfg.secretRef ? '🔒 Keychain Ref' : 'No Key'}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 3. Companion Bridge Tab (Desktop Server & Mobile Client) */}
      {tab === 'companion' && (
        <div className="space-y-4">
          {hostCapabilities.supportsCompanionServer && (
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
                  <span className="text-sm font-semibold">{t.companionServerHeading}</span>
                  <Badge tone={companionServer.running ? 'mastered' : 'neutral'}>
                    {companionServer.running ? t.companionEnabled : t.companionDisabled}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant={companionServer.running ? 'danger' : 'primary'}
                  onClick={() => void handleToggleCompanionServer()}
                >
                  {companionServer.running ? '关闭伴侣服务' : '开启本地伴侣服务'}
                </Button>
              </div>
              <p className="text-xs" style={{ color: 'var(--yt-text-secondary)' }}>
                {t.companionScanHint}
              </p>

              {companionServer.running && (
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  {qrDataUrl && (
                    <img
                      src={qrDataUrl}
                      alt="Companion Bridge Pairing QR Code"
                      className="h-44 w-44 rounded-lg border bg-white p-2"
                      style={{ borderColor: 'var(--yt-border-strong)' }}
                    />
                  )}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span style={{ color: 'var(--yt-text-muted)' }}>LAN URL: </span>
                      <code className="font-mono font-semibold">{companionServer.baseUrl}</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--yt-text-muted)' }}>Bearer Token: </span>
                      <code className="font-mono font-semibold">{companionServer.pairingToken}</code>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Mobile / Remote Client Connection Panel */}
          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4" style={{ color: 'var(--yt-accent)' }} />
              <span>{t.companionClientHeading}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span>扫码结果 / 配对 JSON 粘贴解析</span>
                <div className="flex gap-2">
                  <input
                    value={qrPasteInput}
                    onChange={(e) => setQrPasteInput(e.target.value)}
                    placeholder='yourtutor://pair?url=...&token=... 或 {"baseUrl":...,"token":...}'
                    className="flex-1 rounded-lg border px-2.5 py-2 outline-none"
                    style={{
                      backgroundColor: 'var(--yt-bg-primary)',
                      borderColor: 'var(--yt-border-strong)',
                      color: 'var(--yt-text-primary)',
                    }}
                  />
                  <Button variant="secondary" size="sm" onClick={handleParsePairingPayload}>
                    解析配对码
                  </Button>
                </div>
              </label>
              <label className="space-y-1">
                <span>伴侣服务地址</span>
                <input
                  value={companionUrl}
                  onChange={(e) => setCompanionUrl(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                />
              </label>
              <label className="space-y-1">
                <span>配对 Bearer Token</span>
                <input
                  type="password"
                  value={companionToken}
                  onChange={(e) => setCompanionToken(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 outline-none"
                  style={{
                    backgroundColor: 'var(--yt-bg-primary)',
                    borderColor: 'var(--yt-border-strong)',
                    color: 'var(--yt-text-primary)',
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void handleSaveCompanionClient()}>
                {t.saveConfigBtn}
              </Button>
              {bridge.syncWithCompanion && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={syncing || !companionUrl || !companionToken}
                  onClick={() => void handleSyncCompanion()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? t.syncing : t.syncProfileBtn}</span>
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* 4. Prompt Packs Tab */}
      {tab === 'packs' && (
        <div className="space-y-3">
          {packs.map((pack) => (
            <Card key={pack.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{pack.name}</span>
                <Badge tone="accent">v{pack.version}</Badge>
              </div>
              <p className="text-xs" style={{ color: 'var(--yt-text-secondary)' }}>
                {pack.description}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
