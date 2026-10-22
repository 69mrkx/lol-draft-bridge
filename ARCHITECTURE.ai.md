# System Architecture & Protocol Specification: LoL Draft Bridge

Document type: Machine-readable specification for AI agents, code generators, and client implementers.
Target environment: Node.js 18+ / TypeScript / WebSocket / REST.

---

## 1. System Contract (WebSocket & REST JSON Schemas)

Communication model: Full-duplex WebSocket framing over `ws://<HOST>:<PORT>` (default port `3589`).
JSON is the serialization format for all payloads. Inbound requests may optionally include a correlation `id` string; outbound responses and result notifications reflect this value via `replyTo`.

### 1.1 Inbound Messages (Client Mobile -> Bridge)

#### `PING`
Health check packet.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type"],
  "properties": {
    "type": { "type": "string", "const": "PING" },
    "id": { "type": "string" }
  }
}
```

#### `GET_STATE`
Requests full dump of current bridge connection status, gameflow phase, ready check, and champ select session.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type"],
  "properties": {
    "type": { "type": "string", "const": "GET_STATE" },
    "id": { "type": "string" }
  }
}
```

#### `MATCH_ACCEPT`
Accepts active matchmaking ready-check popup.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type"],
  "properties": {
    "type": { "type": "string", "const": "MATCH_ACCEPT" },
    "id": { "type": "string" }
  }
}
```

#### `MATCH_DECLINE`
Declines active matchmaking ready-check popup.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type"],
  "properties": {
    "type": { "type": "string", "const": "MATCH_DECLINE" },
    "id": { "type": "string" }
  }
}
```

#### `ACTION_PICK`
Picks (locks in or hovers) a champion for local player.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "payload"],
  "properties": {
    "type": { "type": "string", "const": "ACTION_PICK" },
    "id": { "type": "string" },
    "payload": {
      "type": "object",
      "required": ["championId"],
      "properties": {
        "championId": { "type": "integer", "description": "Riot Champion ID (e.g., 103 for Ahri)" },
        "completed": { "type": "boolean", "default": true, "description": "true to lock in, false to hover" },
        "actionId": { "type": "integer", "description": "Optional explicit actionId; if omitted, bridge resolves it automatically" }
      }
    }
  }
}
```

#### `ACTION_BAN`
Bans a champion for local player.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "payload"],
  "properties": {
    "type": { "type": "string", "const": "ACTION_BAN" },
    "id": { "type": "string" },
    "payload": {
      "type": "object",
      "required": ["championId"],
      "properties": {
        "championId": { "type": "integer", "description": "Riot Champion ID" },
        "completed": { "type": "boolean", "default": true },
        "actionId": { "type": "integer", "description": "Optional explicit actionId; resolved automatically if omitted" }
      }
    }
  }
}
```

#### `ACTION_INTENT`
Declares champion pick intent (pre-pick hover) in Champ Select.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "payload"],
  "properties": {
    "type": { "type": "string", "const": "ACTION_INTENT" },
    "id": { "type": "string" },
    "payload": {
      "type": "object",
      "required": ["championId"],
      "properties": {
        "championId": { "type": "integer" }
      }
    }
  }
}
```

---

### 1.2 Outbound Messages (Bridge -> Client Mobile)

#### `BRIDGE_STATUS`
Emitted upon connection and on LCU lifecycle events (client open/close).
```json
{
  "type": "BRIDGE_STATUS",
  "timestamp": 1774283400000,
  "payload": {
    "bridgeVersion": "1.0.0",
    "isLcuConnected": true,
    "lcuPort": 52341,
    "activeClients": 1,
    "currentPhase": "ChampSelect",
    "localIpList": ["192.168.1.54"],
    "serverPort": 3589
  }
}
```

#### `GAMEFLOW_UPDATE`
Emitted immediately whenever the gameflow phase changes in Riot client.
```json
{
  "type": "GAMEFLOW_UPDATE",
  "timestamp": 1774283401000,
  "payload": {
    "phase": "ReadyCheck"
  }
}
```

#### `READY_CHECK_UPDATE`
Emitted during matchmaking ready-check lifecycle.
```json
{
  "type": "READY_CHECK_UPDATE",
  "timestamp": 1774283402000,
  "payload": {
    "state": "InProgress",
    "playerResponse": "None",
    "timer": 12.0,
    "numReadyPlayers": 7,
    "numTotalPlayers": 10,
    "declinerIds": [],
    "dodgeWarning": "None"
  }
}
```

#### `CHAMP_SELECT_UPDATE`
Emitted on each tick / action update during champion selection. Contains both raw session and pre-computed helper fields.
```json
{
  "type": "CHAMP_SELECT_UPDATE",
  "timestamp": 1774283403000,
  "payload": {
    "localPlayerCellId": 2,
    "isMyTurnToPick": true,
    "isMyTurnToBan": false,
    "activeActionId": 14,
    "currentPickAction": {
      "id": 14,
      "actorCellId": 2,
      "championId": 0,
      "completed": false,
      "type": "pick",
      "isInProgress": true,
      "pickTurn": 2
    },
    "currentBanAction": null,
    "phaseTimer": {
      "timeLeftMs": 24500,
      "totalTimeInPhase": 27000,
      "phase": "PLANNING"
    },
    "localPlayerMember": {
      "cellId": 2,
      "assignedPosition": "middle",
      "championId": 0,
      "championPickIntent": 103,
      "spell1Id": 4,
      "spell2Id": 14
    },
    "rawSession": { "..." : "..." }
  }
}
```

#### `ACTION_RESULT`
Synchronous or asynchronous acknowledgment of a command.
```json
{
  "type": "ACTION_RESULT",
  "timestamp": 1774283404000,
  "replyTo": "req-1234",
  "payload": {
    "success": true,
    "action": "ACTION_PICK",
    "data": { "actionId": 14, "response": {} }
  }
}
```

#### `ERROR`
```json
{
  "type": "ERROR",
  "timestamp": 1774283405000,
  "replyTo": "req-1234",
  "payload": {
    "code": "ACTION_FAILED",
    "message": "No active pick turn found for local player in current Champ Select"
  }
}
```

---

## 2. LCU Endpoint Mapping Table

| Bridge Command (WS / REST) | HTTP Verb | Riot LCU Internal Endpoint | Request Body | Description |
|---|---|---|---|---|
| `MATCH_ACCEPT` | `POST` | `/lol-matchmaking/v1/ready-check/accept` | `null` | Accepts queue pop |
| `MATCH_DECLINE` | `POST` | `/lol-matchmaking/v1/ready-check/decline` | `null` | Declines queue pop |
| `ACTION_PICK` | `PATCH` | `/lol-champ-select/v1/session/actions/{actionId}` | `{"championId": N, "completed": true}` | Locks in champion pick |
| `ACTION_BAN` | `PATCH` | `/lol-champ-select/v1/session/actions/{actionId}` | `{"championId": N, "completed": true}` | Locks in champion ban |
| `ACTION_INTENT` | `PATCH` | `/lol-champ-select/v1/session/my-selection` | `{"championId": N}` | Hovers pick intent |
| `GET_STATE` (Gameflow) | `GET` | `/lol-gameflow/v1/gameflow-phase` | `null` | Initial phase poll |
| `GET_STATE` (ReadyCheck) | `GET` | `/lol-matchmaking/v1/ready-check` | `null` | Initial ready check poll |
| `GET_STATE` (ChampSelect) | `GET` | `/lol-champ-select/v1/session` | `null` | Initial draft state poll |
| *WAMP Subscription 1* | WS Sub | `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase` | `[5, topic]` | Phase change stream |
| *WAMP Subscription 2* | WS Sub | `OnJsonApiEvent_lol-matchmaking_v1_ready-check` | `[5, topic]` | Match found stream |
| *WAMP Subscription 3* | WS Sub | `OnJsonApiEvent_lol-champ-select_v1_session` | `[5, topic]` | Draft updates stream |

---

## 3. Gameflow State Machine

```
               ┌───────────────────────┐
               │         None          │ ◄─────────────────────────┐
               └──────────┬────────────┘                           │
                          │ Enter lobby                            │
                          ▼                                        │
               ┌───────────────────────┐                           │
               │         Lobby         │                           │
               └──────────┬────────────┘                           │
                          │ Start queue                            │
                          ▼                                        │
               ┌───────────────────────┐                           │
               │      Matchmaking      │                           │
               └──────────┬────────────┘                           │
                          │ Match found                            │
                          ▼                                        │
               ┌───────────────────────┐                           │
               │      ReadyCheck       │ ── Decline / Timeout ─────┤
               └──────────┬────────────┘                           │
                          │ All 10 Accept                          │
                          ▼                                        │
               ┌───────────────────────┐                           │
               │      ChampSelect      │ ── Player Dodge ──────────┤
               └──────────┬────────────┘                           │
                          │ Draft ends                             │
                          ▼                                        │
               ┌───────────────────────┐                           │
               │      InProgress       │ (Game running on PC)      │
               └──────────┬────────────┘                           │
                          │ Nexus destroyed                        │
                          ▼                                        │
               ┌───────────────────────┐                           │
               │    WaitingForStats    │ ──────────────────────────┘
               └───────────────────────┘
```

### Phase Transition Matrix

| Current Phase | Trigger Event | Next Phase | Mobile App Actionable UI |
|---|---|---|---|
| `None` | Player creates lobby | `Lobby` | Show party status |
| `Lobby` | Match search clicked | `Matchmaking` | Show queue timer |
| `Matchmaking` | 10 players found | `ReadyCheck` | **Display ACCEPT button prominently** |
| `ReadyCheck` | Accept pressed, 10 ready | `ChampSelect` | **Display Draft UI (Picks, Bans, Timers)** |
| `ReadyCheck` | Player declines or times out | `Matchmaking` / `Lobby` | Return to queue search |
| `ChampSelect` | Dodge occurs | `Lobby` / `None` | Show dodge notification |
| `ChampSelect` | All picks complete | `InProgress` | Hide draft controls; show in-game banner |
| `InProgress` | Game completes | `WaitingForStats` / `EndOfGame` | Reset mobile state |

---

## 4. Active `actionId` Resolution Algorithm

### Context & Problem Definition
In Riot's LCU API, `/lol-champ-select/v1/session` returns a 2-dimensional array of actions:
`actions: ChampSelectAction[][]`.
- The outer array represents sequential or grouping phases (e.g. index 0 = bans, index 1 = pick round 1, etc.).
- The inner array contains action objects for various players across both teams.
- To execute a pick or ban via `PATCH /lol-champ-select/v1/session/actions/{actionId}`, the client must supply the specific, currently active `actionId` bound to the local user (`localPlayerCellId`). Supplying the wrong `actionId` results in `404` or `400 Bad Request`.

### Deterministic Pseudo-Code Specification

```typescript
function resolveActiveActionId(
    session: ChampSelectSession, 
    requestedType: "pick" | "ban"
): number | null {
    // 1. Invariant validations
    if (!session || !session.actions || !Array.isArray(session.actions)) {
        return null;
    }
    const localCellId = session.localPlayerCellId;
    if (typeof localCellId !== "number") {
        return null;
    }

    // 2. Scan Phase Arrays
    for (let phaseIndex = 0; phaseIndex < session.actions.length; phaseIndex++) {
        const phaseActions = session.actions[phaseIndex];
        if (!Array.isArray(phaseActions)) continue;

        // An action phase is active if at least one action has isInProgress === true
        const isPhaseActive = phaseActions.some(action => action.isInProgress === true);

        if (isPhaseActive) {
            // Find candidate for local cell in this active phase
            const candidate = phaseActions.find(action => 
                action.actorCellId === localCellId &&
                action.completed === false &&
                action.type.toLowerCase() === requestedType.toLowerCase() &&
                action.isInProgress === true
            );

            if (candidate) {
                return candidate.id;
            }

            // Fallback inside active phase: allow action without strict isInProgress if timer is ticking
            const phaseFallback = phaseActions.find(action =>
                action.actorCellId === localCellId &&
                action.completed === false &&
                action.type.toLowerCase() === requestedType.toLowerCase()
            );

            if (phaseFallback) {
                return phaseFallback.id;
            }
        }
    }

    // 3. Global Fallback Scan
    // If no phase has isInProgress flag set yet (transitional frame), return the earliest uncompleted action of type
    for (const phaseActions of session.actions) {
        if (!Array.isArray(phaseActions)) continue;
        const candidate = phaseActions.find(action =>
            action.actorCellId === localCellId &&
            action.completed === false &&
            action.type.toLowerCase() === requestedType.toLowerCase()
        );
        if (candidate) {
            return candidate.id;
        }
    }

    return null;
}
```

### Execution Rules for Dispatcher:
1. When receiving `ACTION_PICK`:
   - If `payload.actionId` is provided by caller, use it directly.
   - Otherwise, execute `resolveActiveActionId(session, "pick")`.
   - If resolved `actionId` is `null`, emit `ERROR` with code `NO_ACTIVE_PICK_TURN`.
   - Dispatch `PATCH /lol-champ-select/v1/session/actions/{actionId}` with `{ championId, completed }`.
2. When receiving `ACTION_BAN`:
   - If `payload.actionId` is provided by caller, use it directly.
   - Otherwise, execute `resolveActiveActionId(session, "ban")`.
   - If resolved `actionId` is `null`, emit `ERROR` with code `NO_ACTIVE_BAN_TURN`.
   - Dispatch `PATCH /lol-champ-select/v1/session/actions/{actionId}` with `{ championId, completed }`.
