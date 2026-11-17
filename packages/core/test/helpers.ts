import { NEUTRAL_INPUT } from '../src/player.js';
import type { ArenaMap, PlayerInput } from '../src/types.js';

let nextSeq = 1;

/** Builds an input; unspecified fields are neutral. */
export const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({
  ...NEUTRAL_INPUT,
  seq: nextSeq++,
  aim: 0,
  ...over,
});

/** An empty box arena, so tests only meet the walls they put there. */
export const emptyMap = (walls: ArenaMap['walls'] = []): ArenaMap => ({
  size: { x: 2000, y: 2000 },
  walls,
  spawns: [
    { x: 100, y: 100 },
    { x: 400, y: 100 },
  ],
  pickupSpots: [],
});

/** Repeats a step n times. */
export const times = (n: number, fn: (i: number) => void) => {
  for (let i = 0; i < n; i++) fn(i);
};
