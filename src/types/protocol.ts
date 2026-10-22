import { ChampSelectAction, ChampSelectSession, GameflowPhase, ReadyCheckSession } from './lcu.js';

/**
 * Mobile-friendly computed summary of the champ select state.
 */
export interface ChampSelectSummary {
  rawSession: ChampSelectSession;
  localPlayerCellId: number;
  localPlayerMember: any | null;
  activePhaseIndex: number;
  currentPickAction: ChampSelectAction | null;
  currentBanAction: ChampSelectAction | null;
  isMyTurnToPick: boolean;
  isMyTurnToBan: boolean;
  activeActionId: number | null;
  phaseTimer: {
    timeLeftMs: number;
    totalTimeInPhase: number;
    phase: string;
  };
}

/**
 * Inbound messages: from Mobile Client -> Bridge Server
 */
export type InboundMessageType =
  | 'PING'
  | 'GET_STATE'
  | 'MATCH_ACCEPT'
  | 'MATCH_DECLINE'
  | 'ACTION_PICK'
  | 'ACTION_BAN'
  | 'ACTION_INTENT'
  | 'ACTION_CUSTOM';

export interface InboundBaseMessage {
  type: InboundMessageType;
  id?: string; // Request correlation ID
}

export interface InboundPingMessage extends InboundBaseMessage {
  type: 'PING';
}

export interface InboundGetStateMessage extends InboundBaseMessage {
  type: 'GET_STATE';
}

export interface InboundMatchAcceptMessage extends InboundBaseMessage {
  type: 'MATCH_ACCEPT';
}

export interface InboundMatchDeclineMessage extends InboundBaseMessage {
  type: 'MATCH_DECLINE';
}

export interface InboundActionPickMessage extends InboundBaseMessage {
  type: 'ACTION_PICK';
  payload: {
    championId: number;
    completed?: boolean; // Default true
    actionId?: number; // Optional; if omitted, resolved automatically
  };
}

export interface InboundActionBanMessage extends InboundBaseMessage {
  type: 'ACTION_BAN';
  payload: {
    championId: number;
    completed?: boolean; // Default true
    actionId?: number; // Optional; if omitted, resolved automatically
  };
}

export interface InboundActionIntentMessage extends InboundBaseMessage {
  type: 'ACTION_INTENT';
  payload: {
    championId: number;
  };
}

export interface InboundActionCustomMessage extends InboundBaseMessage {
  type: 'ACTION_CUSTOM';
  payload: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    endpoint: string;
    body?: any;
  };
}

export type InboundMessage =
  | InboundPingMessage
  | InboundGetStateMessage
  | InboundMatchAcceptMessage
  | InboundMatchDeclineMessage
  | InboundActionPickMessage
  | InboundActionBanMessage
  | InboundActionIntentMessage
  | InboundActionCustomMessage;

/**
 * Outbound messages: from Bridge Server -> Mobile Client
 */
export type OutboundMessageType =
  | 'PONG'
  | 'BRIDGE_STATUS'
  | 'GAMEFLOW_UPDATE'
  | 'READY_CHECK_UPDATE'
  | 'CHAMP_SELECT_UPDATE'
  | 'ACTION_RESULT'
  | 'ERROR';

export interface OutboundBaseMessage {
  type: OutboundMessageType;
  timestamp: number;
  replyTo?: string; // Corresponds to InboundBaseMessage.id if applicable
}

export interface OutboundPongMessage extends OutboundBaseMessage {
  type: 'PONG';
}

export interface OutboundBridgeStatusMessage extends OutboundBaseMessage {
  type: 'BRIDGE_STATUS';
  payload: {
    bridgeVersion: string;
    isLcuConnected: boolean;
    lcuPort?: number;
    activeClients: number;
    currentPhase: GameflowPhase;
    localIpList: string[];
    serverPort: number;
  };
}

export interface OutboundGameflowUpdateMessage extends OutboundBaseMessage {
  type: 'GAMEFLOW_UPDATE';
  payload: {
    phase: GameflowPhase;
  };
}

export interface OutboundReadyCheckUpdateMessage extends OutboundBaseMessage {
  type: 'READY_CHECK_UPDATE';
  payload: ReadyCheckSession | null;
}

export interface OutboundChampSelectUpdateMessage extends OutboundBaseMessage {
  type: 'CHAMP_SELECT_UPDATE';
  payload: ChampSelectSummary | null;
}

export interface OutboundActionResultMessage extends OutboundBaseMessage {
  type: 'ACTION_RESULT';
  payload: {
    success: boolean;
    action: string;
    data?: any;
    error?: string;
  };
}

export interface OutboundErrorMessage extends OutboundBaseMessage {
  type: 'ERROR';
  payload: {
    code: string;
    message: string;
    details?: any;
  };
}

export type OutboundMessage =
  | OutboundPongMessage
  | OutboundBridgeStatusMessage
  | OutboundGameflowUpdateMessage
  | OutboundReadyCheckUpdateMessage
  | OutboundChampSelectUpdateMessage
  | OutboundActionResultMessage
  | OutboundErrorMessage;
