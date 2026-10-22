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
        copyDir: true,
      });

      this.systray.onClick((action) => {
        if (this.isDestroyed) return;

        if (action.item.title === this.itemOpenDashboard.title || action.item.title === this.itemLan.title) {
          this.openDashboardInBrowser();
        } else if (action.item.title === this.itemExit.title) {
          this.options.onExit();
        }
      });

      this.setupLcuListeners();
    } catch (err) {
      console.warn('[Tray] System Tray non disponibile in questo ambiente. Continuazione in modalità console.');
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

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

  private updateItem(item: MenuItem, newTitle: string): void {
    if (!this.systray || this.isDestroyed) return;
    item.title = newTitle;
    try {
      this.systray.sendAction({
        type: 'update-item',
        item,
      });
    } catch {}
  }

  private openDashboardInBrowser(): void {
    const url = `http://localhost:${this.options.port}`;
    const cmd = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
    exec(cmd, () => {});
  }
}
