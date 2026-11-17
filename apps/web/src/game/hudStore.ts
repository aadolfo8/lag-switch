import {
  type GameEvent,
  type MatchPhase,
  type MatchState,
  phaseSecondsLeft,
  type SabotageId,
  WEAPONS,
  type WeaponId,
} from '@lag-switch/core';
import { create } from 'zustand';

/**
 * Bridge between the game loop and React. The loop WRITES here (at most once
 * per simulation step); React components READ with narrow selectors, so a
 * changing timer only re-renders the timer.
 */
export interface PlayerHud {
  id: string;
  name: string;
  hp: number;
  weapon: WeaponId;
  ammo: number;
  magazine: number;
  reloading: boolean;
  slot: SabotageId | null;
  effects: SabotageId[];
  connected: boolean;
}

export interface HudState {
  phase: MatchPhase;
  round: number;
  secondsLeft: number;
  you: PlayerHud | null;
  rival: PlayerHud | null;
  score: { you: number; rival: number };
  lastRoundWinner: 'you' | 'rival' | 'draw' | null;
  matchWinner: 'you' | 'rival' | null;
  /** Sabotages used on you this round, in order: the "What just happened?" card explains them. */
  suffered: SabotageId[];
  /** Short-lived announcements ("lagbot used LAG SPIKE on you"). */
  toasts: Toast[];
}

export interface Toast {
  id: number;
  what: 'sabotage' | 'pickup';
  by: 'you' | 'rival';
  kind: SabotageId;
}

let toastId = 0;

const initial: HudState = {
  phase: 'waiting',
  round: 0,
  secondsLeft: 0,
  you: null,
  rival: null,
  score: { you: 0, rival: 0 },
  lastRoundWinner: null,
  matchWinner: null,
  suffered: [],
  toasts: [],
};

export const useHud = create<HudState>(() => initial);

export const resetHud = () => useHud.setState(initial, true);

const toHud = (p: MatchState['players'][number]): PlayerHud => ({
  id: p.id,
  name: p.name,
  hp: p.hp,
  weapon: p.weapon,
  ammo: p.ammo[p.weapon],
  magazine: WEAPONS[p.weapon].magazine,
  reloading: p.reloadMsLeft > 0,
  slot: p.sabotageSlot,
  effects: p.activeEffects.map((e) => e.id),
  connected: p.connected,
});

/** Keeps the per-round list of sabotages suffered up to date. */
export function recordEvent(e: GameEvent, youId: string | null): void {
  if (e.type === 'roundStart') useHud.setState({ suffered: [] });
  if (e.type === 'sabotage' && e.target === youId) {
    useHud.setState((s) => ({
      suffered: s.suffered.includes(e.kind) ? s.suffered : [...s.suffered, e.kind],
    }));
  }
  if (e.type === 'sabotage' || (e.type === 'pickup' && e.by === youId)) {
    const toast: Toast = {
      id: ++toastId,
      what: e.type,
      by: e.by === youId ? 'you' : 'rival',
      kind: e.kind,
    };
    useHud.setState((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
  }
}

export const dismissToast = (id: number) =>
  useHud.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

/** Commands the UI can send to the running session (set by GameCanvas). */
export const useActions = create<{ rematch: (() => void) | null }>(() => ({ rematch: null }));

/** Projects a match state (seen from `youId`) into the HUD store. */
export function publishHud(s: MatchState, youId: string | null): void {
  const you = s.players.find((p) => p.id === youId);
  const rival = s.players.find((p) => p.id !== youId);
  const side = (id: string | null) => (id === null ? null : id === youId ? 'you' : 'rival');
  useHud.setState({
    phase: s.phase,
    round: s.round,
    secondsLeft: phaseSecondsLeft(s),
    you: you ? toHud(you) : null,
    rival: rival ? toHud(rival) : null,
    score: {
      you: (youId && s.scores[youId]) || 0,
      rival: (rival && s.scores[rival.id]) || 0,
    },
    lastRoundWinner:
      s.phase === 'roundEnd' || s.phase === 'matchEnd' ? (side(s.lastRoundWinner) ?? 'draw') : null,
    matchWinner: side(s.matchWinner),
  });
}
