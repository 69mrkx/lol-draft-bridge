import { config } from './config.js';
import { LcuClient } from './lcu/lcu-client.js';
import { BridgeServer } from './server/bridge-server.js';
import { TrayManager } from './tray/tray-manager.js';
import { getLocalIpAddresses, getPrimaryLocalIp } from './utils/network.js';

async function bootstrap() {
  const primaryIp = getPrimaryLocalIp();
  const allIps = getLocalIpAddresses();
  const enableTray = process.platform === 'win32' && !process.argv.includes('--no-tray');

  // 1. Initialize LCU Client
  const lcuClient = new LcuClient({
    pollIntervalMs: config.pollIntervalMs,
    customLockfilePath: config.customLockfilePath,
  });

  // 2. Initialize LAN Bridge Server
  const bridgeServer = new BridgeServer(lcuClient, {
    port: config.port,
    host: config.host,
    corsOrigin: config.corsOrigin,
  });

  let isShuttingDown = false;
  let trayManager: TrayManager | null = null;

  // Handle graceful termination
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n\x1b[33mShutting down LoL Draft Bridge...\x1b[0m');
    if (trayManager) {
      trayManager.destroy();
    }
    lcuClient.stop();
    await bridgeServer.close();
    console.log('\x1b[32mBridge terminated cleanly.\x1b[0m');
    process.exit(0);
  };

  // 3. Initialize Windows System Tray if enabled
  if (enableTray) {
    trayManager = new TrayManager({
      lcuClient,
      port: config.port,
      lanIp: primaryIp,
      onExit: () => {
        shutdown();
      },
    });
    await trayManager.start();
  }

  // Setup logging
  lcuClient.on('connected', (creds) => {
    console.log(`\x1b[32m[LCU]\x1b[0m Connected to League of Legends Client! (Port: ${creds.port}, PID: ${creds.pid}, Source: ${creds.source})`);
  });

  lcuClient.on('disconnected', (reason) => {
    console.log(`\x1b[33m[LCU]\x1b[0m Disconnected: ${reason}. Polling for client start...`);
  });

  lcuClient.on('gameflow', (phase) => {
    console.log(`\x1b[36m[GAMEFLOW]\x1b[0m Phase changed to: \x1b[1m${phase}\x1b[0m`);
  });

  lcuClient.on('readyCheck', (session) => {
    if (session && session.state === 'InProgress') {
      console.log(`\x1b[35m[READY-CHECK]\x1b[0m Match found! Ready check in progress (Time left: ${session.timer}s)`);
    }
  });

  lcuClient.on('champSelect', (session) => {
    if (session) {
      console.log(`\x1b[34m[CHAMP-SELECT]\x1b[0m Session active (Local Cell ID: ${session.localPlayerCellId})`);
    } else {
      console.log(`\x1b[34m[CHAMP-SELECT]\x1b[0m Session closed`);
    }
  });

  // Start HTTP and WebSocket listener
  await bridgeServer.listen();

  // Start LCU process watcher
  lcuClient.start();

  // Print startup visual banner
  console.log(`
\x1b[36m╔══════════════════════════════════════════════════════════════════════╗
║                    LoL Draft Bridge - LAN Server                     ║
╚══════════════════════════════════════════════════════════════════════╝\x1b[0m
  \x1b[1mStatus:\x1b[0m       Running & Listening
  \x1b[1mLAN IP:\x1b[0m       \x1b[32m${primaryIp}\x1b[0m (All IPs: ${allIps.join(', ')})
  \x1b[1mPort:\x1b[0m         \x1b[33m${config.port}\x1b[0m
  \x1b[1mSystem Tray:\x1b[0m  ${enableTray ? '\x1b[32mActive (Visible in Windows taskbar tray)\x1b[0m' : '\x1b[90mDisabled\x1b[0m'}
  
  \x1b[1mMobile App Endpoints:\x1b[0m
  • WebSocket:  \x1b[32mws://${primaryIp}:${config.port}\x1b[0m  (or ws://${primaryIp}:${config.port}/ws)
  • HTTP REST:  \x1b[32mhttp://${primaryIp}:${config.port}/api\x1b[0m
  • Web Panel:  \x1b[32mhttp://${primaryIp}:${config.port}/\x1b[0m (Pairing & Diagnostics Dashboard)

  \x1b[90mLCU Auto-Discovery is active. Waiting for League of Legends client...\x1b[0m
`);

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('\x1b[31mFatal startup error:\x1b[0m', err);
  process.exit(1);
});
