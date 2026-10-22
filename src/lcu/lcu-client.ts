import { EventEmitter } from 'node:events';
import https from 'node:https';
import { WebSocket } from 'ws';
import { findActivePlayerAction } from '../helpers/champ-select-helper.js';
import {
  ChampSelectSession,
  GameflowPhase,
  LcuCredentials,
  LcuWsEventPayload,
  ReadyCheckSession,
} from '../types/lcu.js';
import { discoverLcuCredentials } from './credentials.js';

export interface LcuClientOptions {
  customLockfilePath?: string;
  pollIntervalMs?: number;
}

export class LcuClient extends EventEmitter {
  private credentials: LcuCredentials | null = null;
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private isDestroyed: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private httpsAgent: https.Agent;

  // Cached client state
  public currentGameflow: GameflowPhase = 'None';
  public currentReadyCheck: ReadyCheckSession | null = null;
  public currentChampSelect: ChampSelectSession | null = null;

  private readonly customLockfilePath?: string;
  private readonly pollIntervalMs: number;

  constructor(options: LcuClientOptions = {}) {
    super();
    this.customLockfilePath = options.customLockfilePath;
    this.pollIntervalMs = options.pollIntervalMs ?? 2500;

    // Agent that ignores Riot self-signed certificate
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
    });
  }

  public get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.credentials !== null;
  }

  public get currentCredentials(): LcuCredentials | null {
    return this.credentials;
  }

  /**
   * Starts background monitoring of the League client process.
   */
  public start(): void {
    this.isDestroyed = false;
    this.checkAndConnect();
  }

  /**
   * Stops monitoring and disconnects any open sockets.
   */
  public stop(): void {
    this.isDestroyed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.disconnect();
  }

  private scheduleNextCheck(delayMs: number = this.pollIntervalMs): void {
    if (this.isDestroyed) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    this.pollTimer = setTimeout(() => {
      this.checkAndConnect();
    }, delayMs);
  }

  private async checkAndConnect(): Promise<void> {
    if (this.isDestroyed || this.isConnected || this.isConnecting) {
      return;
    }

    try {
      const creds = await discoverLcuCredentials(this.customLockfilePath);

      if (!creds) {
        // Client not running yet
        if (this.credentials !== null) {
          this.handleDisconnect('LoL Client process closed');
        }
        this.scheduleNextCheck();
        return;
      }

      // If credentials changed or not connected, establish connection
      if (!this.credentials || this.credentials.port !== creds.port || this.credentials.token !== creds.token) {
        this.credentials = creds;
        await this.connectWs(creds);
      }
    } catch (err: any) {
      this.scheduleNextCheck();
    }
  }

  private async connectWs(creds: LcuCredentials): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      // Basic auth base64 encoding (user is always 'riot')
      const authHeader = 'Basic ' + Buffer.from(`riot:${creds.token}`).toString('base64');
      const wsUrl = `wss://127.0.0.1:${creds.port}/`;

      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: authHeader,
        },
        rejectUnauthorized: false,
      });

      this.ws = ws;

      ws.on('open', async () => {
        this.isConnecting = false;
        this.emit('connected', creds);

        // Subscribe to LCU WAMP event topics: [5, "TopicName"]
        ws.send(JSON.stringify([5, 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase']));
        ws.send(JSON.stringify([5, 'OnJsonApiEvent_lol-matchmaking_v1_ready-check']));
        ws.send(JSON.stringify([5, 'OnJsonApiEvent_lol-champ-select_v1_session']));

        // Query initial state
        await this.syncInitialState();
      });

      ws.on('message', (data: any) => {
        this.handleWsMessage(data);
      });

      ws.on('error', (err: Error) => {
        // Will trigger 'close' event
      });

      ws.on('close', () => {
        this.handleDisconnect('LCU WebSocket connection closed');
      });
    } catch (err) {
      this.isConnecting = false;
      this.handleDisconnect('Failed to open LCU WebSocket');
    }
  }

  private handleDisconnect(reason: string): void {
    const wasConnected = this.credentials !== null;
    this.credentials = null;
    this.isConnecting = false;

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch {}
      this.ws = null;
    }

    this.currentGameflow = 'None';
    this.currentReadyCheck = null;
    this.currentChampSelect = null;

    if (wasConnected) {
      this.emit('disconnected', reason);
    }

    this.scheduleNextCheck();
  }

  private disconnect(): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.credentials = null;
    this.isConnecting = false;
  }

  private handleWsMessage(raw: any): void {
    try {
      const text = raw.toString();
      if (!text.trim()) return;

      const payload = JSON.parse(text);

      // WAMP event format is: [8, "EventName", { data, eventType, uri }]
      if (!Array.isArray(payload) || payload[0] !== 8) {
        return;
      }

      const eventName = payload[1];
      const eventData: LcuWsEventPayload = payload[2];

      if (!eventData || !eventData.uri) return;

      const uri = eventData.uri;

      if (uri === '/lol-gameflow/v1/gameflow-phase') {
        this.currentGameflow = eventData.data as GameflowPhase;
        this.emit('gameflow', this.currentGameflow);
      } else if (uri === '/lol-matchmaking/v1/ready-check') {
        this.currentReadyCheck = eventData.data as ReadyCheckSession;
        this.emit('readyCheck', this.currentReadyCheck);
      } else if (uri === '/lol-champ-select/v1/session') {
        if (eventData.eventType === 'Delete') {
          this.currentChampSelect = null;
          this.emit('champSelect', null);
        } else {
          this.currentChampSelect = eventData.data as ChampSelectSession;
          this.emit('champSelect', this.currentChampSelect);
        }
      }
    } catch (err) {
      // Silently ignore corrupted LCU frames
    }
  }

  /**
   * Fetches current state immediately upon connecting.
   */
  public async syncInitialState(): Promise<void> {
    try {
      // 1. Gameflow phase
      const phase = await this.request<GameflowPhase>('GET', '/lol-gameflow/v1/gameflow-phase');
      if (phase) {
        this.currentGameflow = phase;
        this.emit('gameflow', this.currentGameflow);
      }
    } catch {}

    try {
      // 2. Ready check
      const readyCheck = await this.request<ReadyCheckSession>('GET', '/lol-matchmaking/v1/ready-check');
      if (readyCheck) {
        this.currentReadyCheck = readyCheck;
        this.emit('readyCheck', this.currentReadyCheck);
      }
    } catch {}

    try {
      // 3. Champ select session
      const champSelect = await this.request<ChampSelectSession>('GET', '/lol-champ-select/v1/session');
      if (champSelect) {
        this.currentChampSelect = champSelect;
        this.emit('champSelect', this.currentChampSelect);
      }
    } catch {}
  }

  /**
   * Executes a direct HTTPS request against the LCU REST API.
   */
  public request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        return reject(new Error('LCU is not connected'));
      }

      const formattedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const authHeader = 'Basic ' + Buffer.from(`riot:${this.credentials.token}`).toString('base64');
      const payloadStr = body !== undefined ? JSON.stringify(body) : null;

      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: this.credentials.port,
          path: formattedPath,
          method,
          agent: this.httpsAgent,
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
            ...(payloadStr
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payloadStr),
                }
              : {}),
          },
          timeout: 8000,
        },
        (res) => {
          let rawData = '';

          res.on('data', (chunk) => {
            rawData += chunk;
          });

          res.on('end', () => {
            const statusCode = res.statusCode || 500;
            if (statusCode >= 200 && statusCode < 300) {
              if (!rawData.trim()) {
                return resolve({} as T);
              }
              try {
                const parsed = JSON.parse(rawData);
                resolve(parsed as T);
              } catch {
                resolve(rawData as unknown as T);
              }
            } else {
              let errMsg = `LCU HTTP ${statusCode}`;
              try {
                const errObj = JSON.parse(rawData);
                errMsg += `: ${errObj.message || rawData}`;
              } catch {
                errMsg += `: ${rawData}`;
              }
              reject(new Error(errMsg));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`LCU request timeout on ${method} ${formattedPath}`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (payloadStr) {
        req.write(payloadStr);
      }
      req.end();
    });
  }

  // --- Core Action Dispatchers ---

  /**
   * Accepts the matchmaking ready-check.
   */
  public async acceptReadyCheck(): Promise<any> {
    return this.request('POST', '/lol-matchmaking/v1/ready-check/accept');
  }

  /**
   * Declines the matchmaking ready-check.
   */
  public async declineReadyCheck(): Promise<any> {
    return this.request('POST', '/lol-matchmaking/v1/ready-check/decline');
  }

  /**
   * Directly executes a champ select action by actionId.
   */
  public async patchChampSelectAction(
    actionId: number,
    championId: number,
    completed: boolean = true
  ): Promise<any> {
    return this.request('PATCH', `/lol-champ-select/v1/session/actions/${actionId}`, {
      championId,
      completed,
    });
  }

  /**
   * Automatically resolves actionId and performs a Champion Pick.
   */
  public async pickChampion(
    championId: number,
    completed: boolean = true,
    explicitActionId?: number
  ): Promise<{ actionId: number; response: any }> {
    let actionId = explicitActionId;

    if (actionId === undefined) {
      const activeAction = findActivePlayerAction(this.currentChampSelect, 'pick');
      if (!activeAction) {
        throw new Error('No active pick turn found for local player in current Champ Select');
      }
      actionId = activeAction.id;
    }

    const response = await this.patchChampSelectAction(actionId, championId, completed);
    return { actionId, response };
  }

  /**
   * Automatically resolves actionId and performs a Champion Ban.
   */
  public async banChampion(
    championId: number,
    completed: boolean = true,
    explicitActionId?: number
  ): Promise<{ actionId: number; response: any }> {
    let actionId = explicitActionId;

    if (actionId === undefined) {
      const activeAction = findActivePlayerAction(this.currentChampSelect, 'ban');
      if (!activeAction) {
        throw new Error('No active ban turn found for local player in current Champ Select');
      }
      actionId = activeAction.id;
    }

    const response = await this.patchChampSelectAction(actionId, championId, completed);
    return { actionId, response };
  }

  /**
   * Sets champion pick intent (hover) without locking in.
   */
  public async setChampionIntent(championId: number): Promise<any> {
    return this.request('PATCH', '/lol-champ-select/v1/session/my-selection', {
      championId,
    });
  }
}
