# LoL Draft Bridge 🎮⚡

[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-ws%208.18-010101?logo=socket.io&logoColor=white)](https://github.com/websockets/ws)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**LoL Draft Bridge** is a lightweight, high-performance local network (LAN) bridge server written in Node.js and TypeScript. It intercepts communication with the League of Legends Client Update (LCU) API and exposes real-time state synchronization and remote control over WebSocket and REST.

Designed for mobile companion applications (iOS / Android), it lets players accept queue pop-ups, monitor champion draft phases, hover champion intents, and lock in picks and bans directly from their smartphone or tablet anywhere on their local Wi-Fi.

Includes native **Windows System Tray** support for quiet background execution and effortless shutdown.

---

## Architecture Overview

```text
+-------------------------------------------------------------+
|                     LOCAL NETWORK (LAN / Wi-Fi)             |
+-------------------------------------------------------------+
               │                                      ▲
               │ WebSocket (ws://192.168.1.x:3589)    │
               │ REST HTTP (http://192.168.1.x:3589)  │
               ▼                                      │
     +-------------------+                  +-------------------+
     |  iOS Mobile App   |                  | Android Mobile App|
     | (Flutter/React N) |                  | (Native / PWA)    |
     +-------------------+                  +-------------------+
               │                                      │
               +───────────────────┬──────────────────+
                                   │
                                   ▼
         +--------------------------------------------------+
         |           WINDOWS GAMING PC (Host)               |
         |                                                  |
         |   +------------------------------------------+   |
         |   |          LoL Draft Bridge Server         |   |
         |   |                                          |   |
         |   |  - LCU Auto-Discovery (Lockfile + CIM)   |   |
         |   |  - Action Dispatcher & Pick/Ban Resolver |   |
         |   |  - WebSocket Event Hub & REST API        |   |
         |   |  - Windows System Tray Manager           |   |
         |   +------------------------------------------+   |
         |                     │       ▲                    |
         |    REST HTTPS / WSS │       │ Event Stream       |
         |    (Basic Auth Riot)│       │ (WAMP Push)        |
         |    127.0.0.1:port   ▼       │                    |
         |   +------------------------------------------+   |
         |   |     League of Legends Client (LCU)       |   |
         |   |         (LeagueClientUx.exe)             |   |
         |   +------------------------------------------+   |
         +--------------------------------------------------+
```

---

## Key Features

- 🔍 **Resilient LCU Auto-Discovery:** Seamlessly discovers port and auth token via standard lockfile locations or Windows WMI/CIM process inspection fallback.
- 🔄 **Real-Time State Synchronization:** Subscribes to LCU WAMP event topics and instantly broadcasts state changes to all connected mobile clients.
- 🎯 **Automated Action Resolver:** Automatically resolves the active `actionId` for the local player's cell ID in Champ Select, eliminating client-side draft matrix parsing.
- 📱 **Remote Control Dispatcher:**
  - Accept or decline matchmaking ready-checks.
  - Hover champion pick intent.
  - Lock in champion picks and bans.
  - Direct custom LCU request tunneling.
- 🖥️ **Windows System Tray Integration:** Sits quietly in the Windows notification area with a quick menu to inspect LCU status, copy LAN IP, open web dashboard, and safely exit.
- 📊 **Built-in Web Pairing Dashboard:** Web-based control panel at `http://<LAN_IP>:3589/` for quick diagnostic tests and mobile setup.
- 🔒 **Zero-Config Self-Signed TLS:** Handles Riot's dynamic self-signed certificate transparently with zero manual Windows certificate imports required.

---

## Prerequisites

- **Operating System:** Windows 10 / 11 (or macOS with League client).
- **Runtime:** [Node.js](https://nodejs.org/) v18.0.0 or higher (v20+ or v22+ recommended).
- **Package Manager:** `npm` (included with Node.js).

---

## Quick Start & Installation

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/lol-draft-bridge.git
   cd lol-draft-bridge
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **(Optional) Configure Environment:**
   Copy `.env.example` to `.env` if you wish to adjust the default port or custom lockfile path:
   ```bash
   copy .env.example .env
   ```

4. **Build the TypeScript Source:**
   ```bash
   npm run build
   ```

---

## How to Run

### Method 1: Windows System Tray / Hidden Background (Recommended)
Double-click `Start-Bridge-Hidden.vbs`.
- The bridge starts silently in the background without keeping a console window open.
- A golden icon appears in the Windows System Tray (Taskbar Notification Area).
- Right-click the tray icon to view connection details, launch the web dashboard, or click **"Spegni Bridge (Exit)"** to shut it down.

### Method 2: Interactive Terminal
Run:
```bash
npm start
```
Or double-click `Start-Bridge.bat`. A terminal banner displays the detected LAN IP address and connection URLs:

```text
╔══════════════════════════════════════════════════════════════════════╗
║                    LoL Draft Bridge - LAN Server                     ║
╚══════════════════════════════════════════════════════════════════════╝
  Status:       Running & Listening
  LAN IP:       192.168.1.54 (All IPs: 192.168.1.54)
  Port:         3589
  System Tray:  Active (Visible in Windows taskbar tray)
  
  Mobile App Endpoints:
  • WebSocket:  ws://192.168.1.54:3589  (or ws://192.168.1.54:3589/ws)
  • HTTP REST:  http://192.168.1.54:3589/api
  • Web Panel:  http://192.168.1.54:3589/ (Pairing & Diagnostics Dashboard)

  LCU Auto-Discovery is active. Waiting for League of Legends client...
```

### Method 3: Development Mode (Hot-Reload)
```bash
npm run dev
```

---

## Pairing with Mobile Apps

1. **Ensure Mobile Device and PC are on the Same Network:**
   Connect your smartphone/tablet to the same Wi-Fi router as your computer.
2. **Retrieve LAN IP:**
   Check the bridge terminal or open `http://localhost:3589/` in your browser.
3. **Connect via WebSocket:**
   Point your mobile application's WebSocket client to:
   ```text
   ws://<YOUR_PC_LAN_IP>:3589
   ```
4. Upon connecting, the bridge automatically transmits initial state snapshots:
   - `BRIDGE_STATUS` (LCU connection status and server info)
   - `GAMEFLOW_UPDATE` (current gameflow phase)
   - `READY_CHECK_UPDATE` (matchmaking pop-up state)
   - `CHAMP_SELECT_UPDATE` (draft state and active action IDs)

---

## Protocol & API Reference

### WebSocket Protocol

All messages are JSON objects. Inbound messages from mobile clients may include an optional `id` string for request correlation.

#### Inbound Commands (Mobile -> Bridge)

| Message Type | Payload Structure | Description |
|---|---|---|
| `PING` | `{}` | Heartbeat check. Responds with `PONG`. |
| `GET_STATE` | `{}` | Requests full state sync. |
| `MATCH_ACCEPT` | `{}` | Accepts active matchmaking queue pop. |
| `MATCH_DECLINE` | `{}` | Declines active matchmaking queue pop. |
| `ACTION_PICK` | `{"championId": 103, "completed": true}` | Locks in (or hovers) champion pick. |
| `ACTION_BAN` | `{"championId": 84, "completed": true}` | Locks in champion ban. |
| `ACTION_INTENT` | `{"championId": 103}` | Hovers champion pick intent. |

#### Outbound Events (Bridge -> Mobile)

| Event Type | Payload | Description |
|---|---|---|
| `BRIDGE_STATUS` | `{ isLcuConnected, lcuPort, activeClients, currentPhase, localIpList }` | Connection status and bridge health. |
| `GAMEFLOW_UPDATE` | `{ phase: "Lobby" \| "Matchmaking" \| "ReadyCheck" \| "ChampSelect" \| ... }` | Real-time gameflow phase changes. |
| `READY_CHECK_UPDATE` | `{ state, playerResponse, timer, numReadyPlayers, numTotalPlayers }` | Matchmaking pop-up updates and countdown. |
| `CHAMP_SELECT_UPDATE` | `{ localPlayerCellId, isMyTurnToPick, isMyTurnToBan, activeActionId, ... }` | Pre-parsed draft summary and raw session. |
| `ACTION_RESULT` | `{ success, action, data, error }` | Command response status. |
| `ERROR` | `{ code, message }` | Error notifications. |

---

### REST API Endpoints

The bridge exposes HTTP REST endpoints on the same port:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Web Pairing & Diagnostic Dashboard |
| `GET` | `/health` | Server uptime and health check |
| `GET` | `/api/status` | Bridge status and LCU connection metadata |
| `GET` | `/api/state` | Cached gameflow, ready-check, and champ-select state |
| `POST` | `/api/matchmaking/accept` | Accepts matchmaking ready-check |
| `POST` | `/api/matchmaking/decline` | Declines matchmaking ready-check |
| `POST` | `/api/champ-select/pick` | Body: `{"championId": number, "completed"?: boolean}` |
| `POST` | `/api/champ-select/ban` | Body: `{"championId": number, "completed"?: boolean}` |
| `POST` | `/api/champ-select/intent` | Body: `{"championId": number}` |
| `POST` | `/api/champ-select/action` | Body: `{"actionId": number, "championId": number, "completed"?: boolean}` |

---

## Troubleshooting

### Windows Firewall Blocking LAN Connections
If your phone cannot reach the bridge:
1. Open **PowerShell as Administrator**.
2. Run this command to permit incoming TCP traffic on port 3589:
   ```powershell
   New-NetFirewallRule -DisplayName "LoL Draft Bridge LAN" -Direction Inbound -LocalPort 3589 -Protocol TCP -Action Allow
   ```
3. Ensure your Windows Network Profile is set to **Private Network** rather than Public.

### Custom Installation Paths or Permissions
The bridge inspects standard directories and running processes. If League of Legends is installed on a separate drive and not detected:
1. Specify the path to `lockfile` in `.env`:
   ```env
   LOL_LOCKFILE_PATH=E:\Riot Games\League of Legends\lockfile
   ```
2. If process inspection is blocked by security software, launch the bridge terminal as Administrator.

---

## Project Structure

```text
lol-draft-bridge/
├── assets/                  # Application icons (.ico and .png)
├── src/
│   ├── helpers/             # Champ select actionId resolver logic
│   ├── lcu/                 # LCU credentials discovery & HTTPS/WSS client
│   ├── server/              # Unified HTTP REST + WebSocket server & dashboard
│   ├── tray/                # Windows System Tray manager
│   ├── types/               # TypeScript interfaces (LCU & Bridge protocol)
│   ├── utils/               # Network & IP utilities
│   ├── config.ts            # Environment settings
│   └── index.ts             # Application entrypoint & lifecycle
├── Start-Bridge.bat         # Windows terminal launcher
├── Start-Bridge-Hidden.vbs  # Windows background/tray launcher (silent)
├── package.json             # NPM project configuration
└── tsconfig.json            # TypeScript compiler configuration
```

---

## Disclaimer

LoL Draft Bridge is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

---

## License

This project is licensed under the [MIT License](LICENSE).
