import http from 'node:http';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { buildChampSelectSummary } from '../helpers/champ-select-helper.js';
import { LcuClient } from '../lcu/lcu-client.js';
import {
  InboundMessage,
  OutboundActionResultMessage,
  OutboundBridgeStatusMessage,
  OutboundChampSelectUpdateMessage,
  OutboundErrorMessage,
  OutboundGameflowUpdateMessage,
  OutboundMessage,
  OutboundPongMessage,
  OutboundReadyCheckUpdateMessage,
} from '../types/protocol.js';
import { getLocalIpAddresses, getPrimaryLocalIp } from '../utils/network.js';

export interface BridgeServerOptions {
  port: number;
  host: string;
  corsOrigin?: string;
}

export class BridgeServer {
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private lcuClient: LcuClient;
  private readonly options: BridgeServerOptions;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(lcuClient: LcuClient, options: BridgeServerOptions) {
    this.lcuClient = lcuClient;
    this.options = options;

    this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupWebSocketServer();
    this.setupLcuListeners();
  }

  /**
   * Starts HTTP and WebSocket server.
   */
  public async listen(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.options.port, this.options.host, () => {
        this.startHeartbeat();
        resolve();
      });
    });
  }

  /**
   * Shuts down server gracefully.
   */
  public async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const ws of this.clients) {
      try {
        ws.terminate();
      } catch {}
    }
    this.clients.clear();

    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) return reject(err);
        this.httpServer.close((httpErr) => {
          if (httpErr) return reject(httpErr);
          resolve();
        });
      });
    });
  }

  /**
   * Broadcasts a JSON message to all connected mobile clients.
   */
  public broadcast(message: OutboundMessage): void {
    const serialized = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  private sendTo(client: WebSocket, message: OutboundMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private setupLcuListeners(): void {
    this.lcuClient.on('connected', (creds) => {
      this.broadcastBridgeStatus();
    });

    this.lcuClient.on('disconnected', () => {
      this.broadcastBridgeStatus();
      this.broadcastGameflow('None');
      this.broadcastReadyCheck(null);
      this.broadcastChampSelect(null);
    });

    this.lcuClient.on('gameflow', (phase) => {
      this.broadcastGameflow(phase);
    });

    this.lcuClient.on('readyCheck', (readyCheck) => {
      this.broadcastReadyCheck(readyCheck);
    });

    this.lcuClient.on('champSelect', (session) => {
      this.broadcastChampSelect(session);
    });
  }

  private broadcastBridgeStatus(): void {
    const creds = this.lcuClient.currentCredentials;
    const msg: OutboundBridgeStatusMessage = {
      type: 'BRIDGE_STATUS',
      timestamp: Date.now(),
      payload: {
        bridgeVersion: '1.0.0',
        isLcuConnected: this.lcuClient.isConnected,
        lcuPort: creds?.port,
        activeClients: this.clients.size,
        currentPhase: this.lcuClient.currentGameflow,
        localIpList: getLocalIpAddresses(),
        serverPort: this.options.port,
      },
    };
    this.broadcast(msg);
  }

  private broadcastGameflow(phase: string): void {
    const msg: OutboundGameflowUpdateMessage = {
      type: 'GAMEFLOW_UPDATE',
      timestamp: Date.now(),
      payload: { phase },
    };
    this.broadcast(msg);
  }

  private broadcastReadyCheck(readyCheck: any): void {
    const msg: OutboundReadyCheckUpdateMessage = {
      type: 'READY_CHECK_UPDATE',
      timestamp: Date.now(),
      payload: readyCheck,
    };
    this.broadcast(msg);
  }

  private broadcastChampSelect(session: any): void {
    const summary = session ? buildChampSelectSummary(session) : null;
    const msg: OutboundChampSelectUpdateMessage = {
      type: 'CHAMP_SELECT_UPDATE',
      timestamp: Date.now(),
      payload: summary,
    };
    this.broadcast(msg);
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, req) => {
      ws.isAlive = true;
      this.clients.add(ws);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send initial bridge status immediately
      const creds = this.lcuClient.currentCredentials;
      const initialStatus: OutboundBridgeStatusMessage = {
        type: 'BRIDGE_STATUS',
        timestamp: Date.now(),
        payload: {
          bridgeVersion: '1.0.0',
          isLcuConnected: this.lcuClient.isConnected,
          lcuPort: creds?.port,
          activeClients: this.clients.size,
          currentPhase: this.lcuClient.currentGameflow,
          localIpList: getLocalIpAddresses(),
          serverPort: this.options.port,
        },
      };
      this.sendTo(ws, initialStatus);

      // Send current state snapshots if available
      this.sendTo(ws, {
        type: 'GAMEFLOW_UPDATE',
        timestamp: Date.now(),
        payload: { phase: this.lcuClient.currentGameflow },
      });

      this.sendTo(ws, {
        type: 'READY_CHECK_UPDATE',
        timestamp: Date.now(),
        payload: this.lcuClient.currentReadyCheck,
      });

      if (this.lcuClient.currentChampSelect) {
        this.sendTo(ws, {
          type: 'CHAMP_SELECT_UPDATE',
          timestamp: Date.now(),
          payload: buildChampSelectSummary(this.lcuClient.currentChampSelect),
        });
      }

      ws.on('message', async (data: RawData) => {
        await this.handleClientWsMessage(ws, data);
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        const ws = client as WebSocket & { isAlive?: boolean };
        if (ws.isAlive === false) {
          this.clients.delete(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  private async handleClientWsMessage(ws: WebSocket, raw: RawData): Promise<void> {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      const err: OutboundErrorMessage = {
        type: 'ERROR',
        timestamp: Date.now(),
        payload: { code: 'INVALID_JSON', message: 'Payload must be valid JSON' },
      };
      this.sendTo(ws, err);
      return;
    }

    const replyId = msg.id;

    try {
      switch (msg.type) {
        case 'PING': {
          const pong: OutboundPongMessage = {
            type: 'PONG',
            timestamp: Date.now(),
            replyTo: replyId,
          };
          this.sendTo(ws, pong);
          break;
        }

        case 'GET_STATE': {
          const creds = this.lcuClient.currentCredentials;
          this.sendTo(ws, {
            type: 'BRIDGE_STATUS',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: {
              bridgeVersion: '1.0.0',
              isLcuConnected: this.lcuClient.isConnected,
              lcuPort: creds?.port,
              activeClients: this.clients.size,
              currentPhase: this.lcuClient.currentGameflow,
              localIpList: getLocalIpAddresses(),
              serverPort: this.options.port,
            },
          });
          this.sendTo(ws, {
            type: 'GAMEFLOW_UPDATE',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { phase: this.lcuClient.currentGameflow },
          });
          this.sendTo(ws, {
            type: 'READY_CHECK_UPDATE',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: this.lcuClient.currentReadyCheck,
          });
          this.sendTo(ws, {
            type: 'CHAMP_SELECT_UPDATE',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: this.lcuClient.currentChampSelect
              ? buildChampSelectSummary(this.lcuClient.currentChampSelect)
              : null,
          });
          break;
        }

        case 'MATCH_ACCEPT': {
          const result = await this.lcuClient.acceptReadyCheck();
          const resMsg: OutboundActionResultMessage = {
            type: 'ACTION_RESULT',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { success: true, action: 'MATCH_ACCEPT', data: result },
          };
          this.sendTo(ws, resMsg);
          break;
        }

        case 'MATCH_DECLINE': {
          const result = await this.lcuClient.declineReadyCheck();
          const resMsg: OutboundActionResultMessage = {
            type: 'ACTION_RESULT',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { success: true, action: 'MATCH_DECLINE', data: result },
          };
          this.sendTo(ws, resMsg);
          break;
        }

        case 'ACTION_PICK': {
          const { championId, completed = true, actionId } = msg.payload || {};
          if (!championId) {
            throw new Error('championId is required for ACTION_PICK');
          }
          const result = await this.lcuClient.pickChampion(championId, completed, actionId);
          const resMsg: OutboundActionResultMessage = {
            type: 'ACTION_RESULT',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { success: true, action: 'ACTION_PICK', data: result },
          };
          this.sendTo(ws, resMsg);
          break;
        }

        case 'ACTION_BAN': {
          const { championId, completed = true, actionId } = msg.payload || {};
          if (!championId) {
            throw new Error('championId is required for ACTION_BAN');
          }
          const result = await this.lcuClient.banChampion(championId, completed, actionId);
          const resMsg: OutboundActionResultMessage = {
            type: 'ACTION_RESULT',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { success: true, action: 'ACTION_BAN', data: result },
          };
          this.sendTo(ws, resMsg);
          break;
        }

        case 'ACTION_INTENT': {
          const { championId } = msg.payload || {};
          if (!championId) {
            throw new Error('championId is required for ACTION_INTENT');
          }
          const result = await this.lcuClient.setChampionIntent(championId);
          const resMsg: OutboundActionResultMessage = {
            type: 'ACTION_RESULT',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { success: true, action: 'ACTION_INTENT', data: result },
          };
          this.sendTo(ws, resMsg);
          break;
        }

        case 'ACTION_CUSTOM': {
          const { method, endpoint, body } = msg.payload || {};
          if (!method || !endpoint) {
            throw new Error('method and endpoint are required for ACTION_CUSTOM');
          }
          const result = await this.lcuClient.request(method, endpoint, body);
          const resMsg: OutboundActionResultMessage = {
            type: 'ACTION_RESULT',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: { success: true, action: 'ACTION_CUSTOM', data: result },
          };
          this.sendTo(ws, resMsg);
          break;
        }

        default: {
          const err: OutboundErrorMessage = {
            type: 'ERROR',
            timestamp: Date.now(),
            replyTo: replyId,
            payload: {
              code: 'UNKNOWN_ACTION',
              message: `Unknown action type: ${(msg as any).type}`,
            },
          };
          this.sendTo(ws, err);
          break;
        }
      }
    } catch (actionError: any) {
      const err: OutboundActionResultMessage = {
        type: 'ACTION_RESULT',
        timestamp: Date.now(),
        replyTo: replyId,
        payload: {
          success: false,
          action: msg.type,
          error: actionError.message || String(actionError),
        },
      };
      this.sendTo(ws, err);
    }
  }

  // --- HTTP Request Handler ---

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = this.options.corsOrigin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // Dashboard root
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderDashboardHtml());
        return;
      }

      // Health endpoint
      if (req.method === 'GET' && pathname === '/health') {
        this.jsonResponse(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: Date.now(),
        });
        return;
      }

      // Status endpoint
      if (req.method === 'GET' && pathname === '/api/status') {
        const creds = this.lcuClient.currentCredentials;
        this.jsonResponse(res, 200, {
          bridgeVersion: '1.0.0',
          isLcuConnected: this.lcuClient.isConnected,
          lcuPort: creds?.port,
          lcuSource: creds?.source,
          activeWsClients: this.clients.size,
          currentPhase: this.lcuClient.currentGameflow,
          localIps: getLocalIpAddresses(),
          serverPort: this.options.port,
        });
        return;
      }

      // Full State endpoint
      if (req.method === 'GET' && pathname === '/api/state') {
        const champSummary = this.lcuClient.currentChampSelect
          ? buildChampSelectSummary(this.lcuClient.currentChampSelect)
          : null;

        this.jsonResponse(res, 200, {
          phase: this.lcuClient.currentGameflow,
          readyCheck: this.lcuClient.currentReadyCheck,
          champSelect: this.lcuClient.currentChampSelect,
          champSelectSummary: champSummary,
        });
        return;
      }

      // Matchmaking Accept endpoint
      if (req.method === 'POST' && pathname === '/api/matchmaking/accept') {
        const result = await this.lcuClient.acceptReadyCheck();
        this.jsonResponse(res, 200, { success: true, result });
        return;
      }

      // Matchmaking Decline endpoint
      if (req.method === 'POST' && pathname === '/api/matchmaking/decline') {
        const result = await this.lcuClient.declineReadyCheck();
        this.jsonResponse(res, 200, { success: true, result });
        return;
      }

      // Champ Select Pick endpoint
      if (req.method === 'POST' && pathname === '/api/champ-select/pick') {
        const body = await this.readJsonBody(req);
        const { championId, completed = true, actionId } = body || {};
        if (!championId) {
          this.jsonResponse(res, 400, { error: 'championId is required' });
          return;
        }
        const result = await this.lcuClient.pickChampion(championId, completed, actionId);
        this.jsonResponse(res, 200, { success: true, ...result });
        return;
      }

      // Champ Select Ban endpoint
      if (req.method === 'POST' && pathname === '/api/champ-select/ban') {
        const body = await this.readJsonBody(req);
        const { championId, completed = true, actionId } = body || {};
        if (!championId) {
          this.jsonResponse(res, 400, { error: 'championId is required' });
          return;
        }
        const result = await this.lcuClient.banChampion(championId, completed, actionId);
        this.jsonResponse(res, 200, { success: true, ...result });
        return;
      }

      // Champ Select Hover/Intent endpoint
      if (req.method === 'POST' && pathname === '/api/champ-select/intent') {
        const body = await this.readJsonBody(req);
        const { championId } = body || {};
        if (!championId) {
          this.jsonResponse(res, 400, { error: 'championId is required' });
          return;
        }
        const result = await this.lcuClient.setChampionIntent(championId);
        this.jsonResponse(res, 200, { success: true, result });
        return;
      }

      // Raw / Direct Champ Select Action endpoint
      if (req.method === 'POST' && pathname === '/api/champ-select/action') {
        const body = await this.readJsonBody(req);
        const { actionId, championId, completed = true } = body || {};
        if (actionId === undefined || championId === undefined) {
          this.jsonResponse(res, 400, { error: 'actionId and championId are required' });
          return;
        }
        const result = await this.lcuClient.patchChampSelectAction(actionId, championId, completed);
        this.jsonResponse(res, 200, { success: true, result });
        return;
      }

      // 404 Not Found
      this.jsonResponse(res, 404, { error: 'Endpoint not found', path: pathname });
    } catch (err: any) {
      this.jsonResponse(res, 500, {
        error: err.message || 'Internal Bridge Server Error',
      });
    }
  }

  private jsonResponse(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  private readJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body.trim()) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', (err) => reject(err));
    });
  }

  /**
   * Generates a sleek, dark-mode pairing and live debug interface.
   */
  private renderDashboardHtml(): string {
    const primaryIp = getPrimaryLocalIp();
    const wsUrl = `ws://${primaryIp}:${this.options.port}`;
    const httpUrl = `http://${primaryIp}:${this.options.port}`;

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LoL Draft Bridge - Control Panel</title>
  <style>
    :root {
      --bg: #0b0e14;
      --card-bg: #141b24;
      --card-border: #1f2a38;
      --accent-blue: #00c8c8;
      --accent-gold: #c8aa6e;
      --accent-green: #22c55e;
      --accent-red: #ef4444;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 900px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.5px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: #1e293b;
      color: var(--text-muted);
    }
    .badge.connected { background: rgba(34, 197, 94, 0.15); color: var(--accent-green); border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge.disconnected { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); border: 1px solid rgba(239, 68, 68, 0.3); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 12px; }
    .value { font-size: 1.35rem; font-weight: 700; color: #fff; margin-bottom: 4px; word-break: break-all; }
    .code-pill {
      font-family: var(--font-mono);
      background: #0d1117;
      border: 1px solid #30363d;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.9rem;
      color: var(--accent-gold);
      display: block;
      margin-top: 6px;
      user-select: all;
    }
    .logs-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
    }
    pre {
      background: #07090e;
      border: 1px solid #1a222d;
      padding: 16px;
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: #38bdf8;
      max-height: 280px;
      overflow-y: auto;
    }
    .btn-row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
    button {
      background: #1f2937;
      border: 1px solid #374151;
      color: #fff;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { background: #374151; }
    button.accept { background: #15803d; border-color: #22c55e; }
    button.accept:hover { background: #166534; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c8aa6e" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <h1>LoL Draft Bridge</h1>
      </div>
      <div id="lcuBadge" class="badge disconnected">
        <span class="dot"></span>
        <span id="lcuStatusText">LCU Disconnesso</span>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Connessione LAN Mobile</h2>
        <div class="value">Endpoint WebSocket</div>
        <div class="code-pill" id="wsEndpoint">${wsUrl}</div>
        <div style="margin-top: 8px; color: var(--text-muted); font-size: 0.8rem;">
          Inserisci questo indirizzo nell'app mobile (iOS/Android).
        </div>
      </div>

      <div class="card">
        <h2>Fase Gameflow Riot</h2>
        <div class="value" id="gameflowPhase" style="color: var(--accent-gold);">None</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          Client connessi LAN: <strong id="activeClients" style="color: #fff;">0</strong>
        </div>
      </div>

      <div class="card">
        <h2>Azioni Rapide di Test</h2>
        <div class="btn-row">
          <button class="accept" onclick="acceptMatch()">Accetta Coda</button>
          <button onclick="refreshState()">Aggiorna Stato</button>
        </div>
      </div>
    </div>

    <div class="logs-card">
      <h2>Stato Real-Time Sessione (JSON)</h2>
      <pre id="stateDump">In attesa di dati...</pre>
    </div>
  </div>

  <script>
    const ws = new WebSocket(window.location.origin.replace(/^http/, 'ws'));
    const badge = document.getElementById('lcuBadge');
    const badgeText = document.getElementById('lcuStatusText');
    const gameflowEl = document.getElementById('gameflowPhase');
    const clientsEl = document.getElementById('activeClients');
    const stateDump = document.getElementById('stateDump');

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'BRIDGE_STATUS') {
          if (msg.payload.isLcuConnected) {
            badge.className = 'badge connected';
            badgeText.textContent = 'LCU Connesso (Porta ' + msg.payload.lcuPort + ')';
          } else {
            badge.className = 'badge disconnected';
            badgeText.textContent = 'LCU Disconnesso (In attesa del Client)';
          }
          clientsEl.textContent = msg.payload.activeClients;
          gameflowEl.textContent = msg.payload.currentPhase;
        } else if (msg.type === 'GAMEFLOW_UPDATE') {
          gameflowEl.textContent = msg.payload.phase;
        } else if (msg.type === 'READY_CHECK_UPDATE' || msg.type === 'CHAMP_SELECT_UPDATE') {
          stateDump.textContent = JSON.stringify(msg, null, 2);
        }
      } catch (e) {}
    };

    async function acceptMatch() {
      try {
        const res = await fetch('/api/matchmaking/accept', { method: 'POST' });
        const data = await res.json();
        alert('Risposta LCU: ' + JSON.stringify(data));
      } catch (err) {
        alert('Errore: ' + err.message);
      }
    }

    async function refreshState() {
      try {
        const res = await fetch('/api/state');
        const data = await res.json();
        stateDump.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        stateDump.textContent = 'Errore: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
  }
}
