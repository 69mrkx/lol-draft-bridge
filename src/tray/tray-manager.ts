import { exec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import SysTray, { MenuItem } from 'systray2';
import { LcuClient } from '../lcu/lcu-client.js';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

export interface TrayManagerOptions {
  lcuClient: LcuClient;
  port: number;
  lanIp: string;
  onExit: () => void;
}

export class TrayManager {
  private systray: SysTray | null = null;
  private options: TrayManagerOptions;
  private isDestroyed: boolean = false;
  private isReady: boolean = false;

  private itemTitle: MenuItem;
  private itemLan: MenuItem;
  private itemLcuStatus: MenuItem;
  private itemPhase: MenuItem;
  private itemOpenDashboard: MenuItem;
  private itemExit: MenuItem;

  constructor(options: TrayManagerOptions) {
    this.options = options;

    this.itemTitle = {
      title: '🎮 LoL Draft Bridge',
      tooltip: 'League of Legends Mobile Remote Bridge',
      enabled: false,
    };

    this.itemLan = {
      title: `🌐 LAN: ${options.lanIp}:${options.port}`,
      tooltip: 'Click to open in browser',
      enabled: true,
    };

    this.itemLcuStatus = {
      title: '⚡ LCU: In attesa del Client...',
      tooltip: 'League Client Status',
      enabled: false,
    };

    this.itemPhase = {
      title: '🎯 Fase: None',
      tooltip: 'Gameflow Phase',
      enabled: false,
    };

    this.itemOpenDashboard = {
      title: '🖥️ Apri Web Dashboard',
      tooltip: 'Open Web Dashboard in default browser',
      enabled: true,
    };

    this.itemExit = {
      title: '❌ Spegni Bridge (Exit)',
      tooltip: 'Stop server and exit',
      enabled: true,
    };
  }

  public async start(): Promise<void> {
    try {
      const iconPath = this.resolveIconPath();
      let iconBase64 = '';

      if (existsSync(iconPath)) {
        iconBase64 = readFileSync(iconPath).toString('base64');
      }

      const menuItems = [
        this.itemTitle,
        this.itemLan,
        this.itemLcuStatus,
        this.itemPhase,
        SysTray.separator,
        this.itemOpenDashboard,
        SysTray.separator,
        this.itemExit,
      ];

      this.systray = new SysTray({
        menu: {
          icon: iconBase64,
          title: 'LoL Draft Bridge',
          tooltip: 'LoL Draft Bridge - In esecuzione',
          items: menuItems,
        },
        debug: false,
        copyDir: false,
      });

      this.systray.onError((err) => {
        // Prevent unhandled errors if tray process terminates
        this.isReady = false;
      });

      this.systray.onExit(() => {
        this.isReady = false;
      });

      this.systray.onClick((action) => {
        if (this.isDestroyed) return;

        if (action.item.title === this.itemOpenDashboard.title || action.item.title === this.itemLan.title) {
          this.openDashboardInBrowser();
        } else if (action.item.title === this.itemExit.title) {
          this.options.onExit();
        }
      });

      // Wait until the underlying native process is ready
      await this.systray.ready();
      this.isReady = true;

      // Setup listeners for live status updates
      this.setupLcuListeners();

      // Apply initial state if LCU is already connected
      if (this.options.lcuClient.isConnected && this.options.lcuClient.currentCredentials) {
        this.updateItem(
          this.itemLcuStatus,
          `⚡ LCU: Connesso (Porta ${this.options.lcuClient.currentCredentials.port})`
        );
      }
      if (this.options.lcuClient.currentGameflow !== 'None') {
        this.updateItem(this.itemPhase, `🎯 Fase: ${this.options.lcuClient.currentGameflow}`);
      }
    } catch (err: any) {
      this.isReady = false;
      console.warn('[Tray] System Tray non inizializzato o non disponibile in questo ambiente. Continuazione in console.');
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isReady = false;

    if (this.systray) {
      try {
        this.systray.kill(false);
      } catch {}
      this.systray = null;
    }
  }

  private resolveIconPath(): string {
    const candidates = [
      join(process.cwd(), 'assets', 'icon.ico'),
      join(process.cwd(), 'assets', 'icon.png'),
      join(currentDir, '..', '..', 'assets', 'icon.ico'),
      join(currentDir, '..', '..', 'assets', 'icon.png'),
    ];

    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  private setupLcuListeners(): void {
    const lcu = this.options.lcuClient;

    lcu.on('connected', (creds) => {
      this.updateItem(this.itemLcuStatus, `⚡ LCU: Connesso (Porta ${creds.port})`);
    });

    lcu.on('disconnected', () => {
      this.updateItem(this.itemLcuStatus, '⚡ LCU: Disconnesso');
      this.updateItem(this.itemPhase, '🎯 Fase: None');
    });

    lcu.on('gameflow', (phase) => {
      this.updateItem(this.itemPhase, `🎯 Fase: ${phase}`);
    });
  }

  private async updateItem(item: MenuItem, newTitle: string): Promise<void> {
    item.title = newTitle;
    if (!this.systray || this.isDestroyed || !this.isReady) return;

    try {
      const proc = (this.systray as any)._process;
      if (!proc || !proc.stdin || proc.killed) return;

      await this.systray.sendAction({
        type: 'update-item',
        item,
      });
    } catch {
      // Gracefully ignore pipe errors
    }
  }

  private openDashboardInBrowser(): void {
    const url = `http://localhost:${this.options.port}`;
    const cmd = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
    exec(cmd, () => {});
  }
}
