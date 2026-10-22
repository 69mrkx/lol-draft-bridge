import {
  ChampSelectAction,
  ChampSelectMember,
  ChampSelectSession,
} from '../types/lcu.js';
import { ChampSelectSummary } from '../types/protocol.js';

export interface ActionResolutionResult {
  action: ChampSelectAction | null;
  phaseIndex: number;
  reason?: string;
}

/**
 * Searches the 2D actions array of Champ Select to find the active action
 * for the local player.
 *
 * @param session - The full Champ Select session object from LCU
 * @param preferredType - Optional 'pick' or 'ban' filter
 * @returns The resolved ChampSelectAction, or null if no valid active action exists
 */
export function findActivePlayerAction(
  session: ChampSelectSession | null | undefined,
  preferredType?: 'pick' | 'ban'
): ChampSelectAction | null {
  if (!session || !Array.isArray(session.actions) || session.localPlayerCellId === undefined) {
    return null;
  }

  const localCellId = session.localPlayerCellId;

  // 1. Primary Strategy: Check phases that have at least one action marked isInProgress === true
  for (let phaseIndex = 0; phaseIndex < session.actions.length; phaseIndex++) {
    const phaseActions = session.actions[phaseIndex];
    if (!Array.isArray(phaseActions)) continue;

    const isPhaseActive = phaseActions.some((act) => act.isInProgress);

    if (isPhaseActive) {
      // Find candidate action for local player in this active phase
      const candidate = phaseActions.find((act) => {
        if (act.actorCellId !== localCellId) return false;
        if (act.completed) return false;
        if (preferredType && act.type.toLowerCase() !== preferredType.toLowerCase()) return false;
        // In active phase, action must be in progress or ready to be locked
        return act.isInProgress;
      });

      if (candidate) {
        return candidate;
      }

      // Fallback within active phase: check if there's an incomplete action matching type even if isInProgress is lagging
      const fallbackInPhase = phaseActions.find((act) => {
        if (act.actorCellId !== localCellId) return false;
        if (act.completed) return false;
        if (preferredType && act.type.toLowerCase() !== preferredType.toLowerCase()) return false;
        return true;
      });

      if (fallbackInPhase) {
        return fallbackInPhase;
      }
    }
  }

  // 2. Secondary Strategy: If no phase explicitly flagged isInProgress,
  // find the first incomplete action for localPlayer across any phase.
  for (let phaseIndex = 0; phaseIndex < session.actions.length; phaseIndex++) {
    const phaseActions = session.actions[phaseIndex];
    if (!Array.isArray(phaseActions)) continue;

    const candidate = phaseActions.find((act) => {
      if (act.actorCellId !== localCellId) return false;
      if (act.completed) return false;
      if (preferredType && act.type.toLowerCase() !== preferredType.toLowerCase()) return false;
      return true;
    });

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

/**
 * Builds a comprehensive summary for mobile clients from the raw LCU Champ Select session.
 */
export function buildChampSelectSummary(
  session: ChampSelectSession | null | undefined
): ChampSelectSummary | null {
  if (!session) return null;

  const currentPick = findActivePlayerAction(session, 'pick');
  const currentBan = findActivePlayerAction(session, 'ban');

  // Find active phase index
  let activePhaseIndex = -1;
  if (Array.isArray(session.actions)) {
    activePhaseIndex = session.actions.findIndex(
      (phase) => Array.isArray(phase) && phase.some((act) => act.isInProgress)
    );
  }

  // Find local member
  let localMember: ChampSelectMember | null = null;
  if (Array.isArray(session.myTeam)) {
    localMember = session.myTeam.find((m) => m.cellId === session.localPlayerCellId) || null;
  }

  // Calculate adjusted time left
  let timeLeftMs = 0;
  let totalTimeInPhase = 0;
  let phaseName = 'unknown';

  if (session.timer) {
    totalTimeInPhase = session.timer.totalTimeInPhase || 0;
    phaseName = session.timer.phase || 'unknown';
    if (session.timer.adjustedTimeLeftInPhase !== undefined) {
      timeLeftMs = Math.max(0, session.timer.adjustedTimeLeftInPhase);
    }
  }

  const isMyTurnToPick = !!currentPick && currentPick.isInProgress && !currentPick.completed;
  const isMyTurnToBan = !!currentBan && currentBan.isInProgress && !currentBan.completed;

  const activeActionId = isMyTurnToPick
    ? currentPick?.id ?? null
    : isMyTurnToBan
    ? currentBan?.id ?? null
    : null;

  return {
    rawSession: session,
    localPlayerCellId: session.localPlayerCellId,
    localPlayerMember: localMember,
    activePhaseIndex,
    currentPickAction: currentPick,
    currentBanAction: currentBan,
    isMyTurnToPick,
    isMyTurnToBan,
    activeActionId,
    phaseTimer: {
      timeLeftMs,
      totalTimeInPhase,
      phase: phaseName,
    },
  };
}
