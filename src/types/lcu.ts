export interface LcuCredentials {
  port: number;
  token: string;
  protocol: 'https' | 'http';
  pid: number;
  source: 'process' | 'lockfile';
}

export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'InProgress'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'
  | 'TerminatedInError'
  | string;

export interface ReadyCheckSession {
  declinerIds: number[];
  dodgeWarning: string;
  numReadyPlayers: number;
  numTotalPlayers: number;
  playerResponse: 'None' | 'Accepted' | 'Declined' | string;
  state: 'Invalid' | 'InProgress' | 'EveryoneReady' | 'StrangerNotReady' | 'PartyNotReady' | 'Error' | string;
  suppress示Alert?: boolean;
  timer: number;
}

export type ChampSelectActionType = 'pick' | 'ban' | 'vote' | 'ten_bans_reveal' | string;

export interface ChampSelectAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  type: ChampSelectActionType;
  isInProgress: boolean;
  pickTurn: number;
}

export interface ChampSelectMember {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: 'top' | 'jungle' | 'middle' | 'bottom' | 'utility' | '' | string;
  summonerId: number;
  spell1Id: number;
  spell2Id: number;
  team: number;
  displayName?: string;
}

export interface ChampSelectTimer {
  adjustedTimeLeftInPhase: number;
  internalNowInEpochMs: number;
  isInfinite: boolean;
  phase: string;
  totalTimeInPhase: number;
}

export interface ChampSelectBans {
  myTeamBans: number[];
  theirTeamBans: number[];
  numBans: number;
}

export interface ChampSelectSession {
  id: string;
  isCustomGame: boolean;
  localPlayerCellId: number;
  actions: ChampSelectAction[][];
  myTeam: ChampSelectMember[];
  theirTeam: ChampSelectMember[];
  bans: ChampSelectBans;
  timer: ChampSelectTimer;
  benchChampions?: Array<{ championId: number; isKennel: boolean }>;
  benchEnabled?: boolean;
  hasSimultaneousBans?: boolean;
  hasSimultaneousPicks?: boolean;
}

export interface LcuWsEventPayload<T = any> {
  data: T;
  eventType: 'Create' | 'Update' | 'Delete' | string;
  uri: string;
}

export interface LcuRunePage {
  id: number;
  name: string;
  isEditable: boolean;
  isActive?: boolean;
  current?: boolean;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  [key: string]: any;
}
