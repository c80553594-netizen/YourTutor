import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { hostname, networkInterfaces } from 'node:os';
import {
  type ChatMessage,
  COMPANION_PROTOCOL_VERSION,
  CompanionSyncRequestSchema,
  type CompanionSyncRequest,
  type CompanionSyncResponse,
  type ProviderRegistry,
} from '@yourtutor/core';
import { type CompanionServerStatus } from '@yourtutor/ui';

export interface CompanionBridgeServerOptions {
  registry: ProviderRegistry;
  host?: string;
  port?: number;
  pairingToken?: string;
  /** Optional sync handler invoked on POST /sync to merge with local storage. */
  onSync?: (payload: CompanionSyncRequest) => Promise<CompanionSyncResponse>;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function detectLanIpAddress(fallbackHost: string): string {
  if (fallbackHost !== '0.0.0.0' && fallbackHost !== '::') {
    return fallbackHost;
  }
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

async function readJsonBody(req: IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buf.length;
    if (total > maxBytes) {
      throw new Error('Request payload exceeds size limit.');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.trim().length > 0 ? (JSON.parse(raw) as unknown) : {};
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-YourTutor-Protocol',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

/**
 * Lightweight optional Companion Bridge HTTP/SSE Server hosted inside the Desktop app
 * (or self-hosted server). Disabled by default; enforces Bearer Token auth on every endpoint.
 *
 * Endpoints:
 * - GET  /health       -> protocol version, hostname, ok
 * - GET  /providers    -> exposes configured desktop CLI & API providers + models
 * - POST /chat/stream  -> streams ProviderStreamEvent frames via SSE
 * - POST /sync         -> conflict-safe timestamp-based bidirectional study sync
 */
export class CompanionBridgeServer {
  private readonly registry: ProviderRegistry;
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly onSync?: (payload: CompanionSyncRequest) => Promise<CompanionSyncResponse>;

  private server: Server | null = null;
  private activePort: number | null = null;
  private pairingToken: string;

  constructor(options: CompanionBridgeServerOptions) {
    this.registry = options.registry;
    this.host = options.host ?? '0.0.0.0';
    this.requestedPort = options.port ?? 48720;
    this.pairingToken = options.pairingToken ?? randomBytes(24).toString('hex');
    this.onSync = options.onSync;
  }

  getStatus(): CompanionServerStatus {
    if (!this.server || this.activePort === null) {
      return { running: false };
    }
    const reachableHost = detectLanIpAddress(this.host);
    const baseUrl = `http://${reachableHost}:${this.activePort}`;
    const qrPayload = JSON.stringify({
      protocol: COMPANION_PROTOCOL_VERSION,
      baseUrl,
      token: this.pairingToken,
      hostname: hostname(),
    });
    return {
      running: true,
      host: this.host,
      port: this.activePort,
      baseUrl,
      pairingToken: this.pairingToken,
      qrPayload,
    };
  }

  async start(): Promise<CompanionServerStatus> {
    if (this.server) {
      return this.getStatus();
    }

    const server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.requestedPort, this.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    this.server = server;
    this.activePort = typeof address === 'object' && address ? address.port : this.requestedPort;
    return this.getStatus();
  }

  async stop(): Promise<CompanionServerStatus> {
    if (!this.server) {
      return { running: false };
    }
    const srv = this.server;
    this.server = null;
    this.activePort = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
    return { running: false };
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const authHeader = req.headers.authorization ?? '';
    const prefix = 'Bearer ';
    if (!authHeader.startsWith(prefix)) {
      return false;
    }
    const provided = authHeader.slice(prefix.length).trim();
    return constantTimeEquals(provided, this.pairingToken);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-YourTutor-Protocol',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    if (!this.isAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized: invalid or missing Bearer pairing token.' });
      return;
    }

    try {
      if (method === 'GET' && urlPath === '/health') {
        sendJson(res, 200, {
          ok: true,
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          serverName: 'YourTutor Companion Bridge',
          hostname: hostname(),
          timestamp: Date.now(),
        });
        return;
      }

      if (method === 'GET' && urlPath === '/providers') {
        const list = this.registry
          .list()
          .filter((p) => p.capabilities.runtime !== 'companion-remote');
        const remoteProviders = await Promise.all(
          list.map(async (provider) => {
            const models = await provider.listModels().catch(() => []);
            return {
              id: provider.id,
              name: provider.name,
              runtime: provider.capabilities.runtime,
              healthy: true,
              supportsVision: provider.capabilities.supportsVision,
              supportsThinking: provider.capabilities.supportsThinking,
              models: models.map((m) => ({
                id: m.id,
                name: m.name,
                supportsVision: m.supportsVision,
                supportsThinking: m.supportsThinking,
                contextWindow: m.contextWindow,
              })),
            };
          })
        );

        sendJson(res, 200, {
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          providers: remoteProviders,
        });
        return;
      }

      if (method === 'POST' && urlPath === '/chat/stream') {
        const rawBody = await readJsonBody(req);
        const body = rawBody as {
          remoteProviderId?: string;
          model?: string;
          systemPrompt?: string;
          messages?: ChatMessage[];
          temperature?: number;
          maxTokens?: number;
          effort?: 'low' | 'medium' | 'high';
        };

        const provider = body.remoteProviderId
          ? this.registry.getOrThrow(body.remoteProviderId)
          : this.registry.resolveForTask('teach');

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        const abortController = new AbortController();
        req.once('close', () => abortController.abort());

        for await (const event of provider.streamChat({
          messages: body.messages ?? [],
          systemPrompt: body.systemPrompt,
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
          effort: body.effort,
          signal: abortController.signal,
        })) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      if (method === 'POST' && urlPath === '/sync') {
        const rawBody = await readJsonBody(req);
        const parsed = CompanionSyncRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
          sendJson(res, 400, { error: `Invalid sync payload: ${parsed.error.message}` });
          return;
        }

        if (this.onSync) {
          const merged = await this.onSync(parsed.data);
          sendJson(res, 200, merged);
        } else {
          sendJson(res, 200, {
            serverTime: Date.now(),
            merged: {
              courses: parsed.data.courses,
              lessons: parsed.data.lessons,
              masteryRecords: parsed.data.masteryRecords,
              practiceAttempts: parsed.data.practiceAttempts,
            },
          });
        }
        return;
      }

      sendJson(res, 404, { error: `Unknown endpoint: ${method} ${urlPath}` });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        res.end();
      }
    }
  }
}
