import {
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
}

const initial: HudState = {
  phase: 'waiting',
  round: 0,
  secondsLeft: 0,
  you: null,
  rival: null,
  score: { you: 0, rival: 0 },
  lastRoundWinner: null,
  matchWinner: null,
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
