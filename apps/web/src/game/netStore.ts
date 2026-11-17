import type { SabotageId } from '@lag-switch/core';
import { create } from 'zustand';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting' // joined, no rival yet
  | 'playing'
  | 'reconnecting'
  | 'closed'
  | 'error';

/** Everything the F3 overlay shows. Written by NetSession about 4 times a second. */
export interface NetStats {
  status: ConnectionStatus;
  error: string | null;
  roomCode: string | null;
  pingMs: number | null;
  serverTick: number;
  snapshotsPerSec: number;
  bytesInPerSec: number;
  bytesOutPerSec: number;
  messagesInPerSec: number;
  messagesOutPerSec: number;
  /** Inputs sent but not yet acknowledged by the server. */
  pendingInputs: number;
  /** Distance between predicted and authoritative position at the last snapshot. */
  correctionPx: number;
  interpolationMs: number;
  effects: { id: SabotageId; leftMs: number }[];
  reconnectAttempt: number;
  /** Set while the socket is gone and we are trying to get our seat back. */
  offline: { since: number; reason: 'wifiReset' | 'dropped' } | null;
}

export const initialNetStats: NetStats = {
  status: 'idle',
  error: null,
  roomCode: null,
  pingMs: null,
  serverTick: 0,
  snapshotsPerSec: 0,
  bytesInPerSec: 0,
  bytesOutPerSec: 0,
  messagesInPerSec: 0,
  messagesOutPerSec: 0,
  pendingInputs: 0,
  correctionPx: 0,
  interpolationMs: 0,
  effects: [],
  reconnectAttempt: 0,
  offline: null,
};

export const useNet = create<NetStats>(() => initialNetStats);

/** UI-only toggles. */
export const useUi = create<{ debugOpen: boolean }>(() => ({ debugOpen: false }));
export const toggleDebug = () => useUi.setState((s) => ({ debugOpen: !s.debugOpen }));

/**
 * Counts events in a sliding one-second window. Used for snapshots/s,
 * bytes/s and messages/s, measured on the client where the user can see
 * the effect of a sabotage on their own traffic.
 */
export class RateMeter {
  private samples: { t: number; v: number }[] = [];

  add(v = 1, t = performance.now()): void {
    this.samples.push({ t, v });
  }

  perSecond(t = performance.now()): number {
    this.samples = this.samples.filter((s) => t - s.t < 1000);
    return this.samples.reduce((sum, s) => sum + s.v, 0);
  }
}
