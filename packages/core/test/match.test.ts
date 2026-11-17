import { describe, expect, it } from 'vitest';
import { MATCH, PICKUPS, SABOTAGE_DURATION_MS, TICK_MS, WEAPONS } from '../src/config.js';
import { ARENA } from '../src/map.js';
import {
  addPlayer,
  createMatch,
  endRound,
  findPlayer,
  resetMatch,
  stepMatch,
} from '../src/match.js';
import { resolveCircleVsWalls } from '../src/physics.js';
import type { ArenaMap, GameEvent, MatchState, PlayerInput } from '../src/types.js';
import { emptyMap, input } from './helpers.js';

const ticksFor = (ms: number) => Math.ceil(ms / TICK_MS);

function setup(map: ArenaMap = emptyMap()) {
  const s = createMatch(map);
  addPlayer(s, map, 'a', 'Ana');
  addPlayer(s, map, 'b', 'Bo');
  return s;
}

function run(
  s: MatchState,
  map: ArenaMap,
  n: number,
  inputsFor: (tick: number) => Record<string, PlayerInput[]> = () => ({}),
): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    all.push(...stepMatch(s, new Map(Object.entries(inputsFor(i))), { map }));
  }
  return all;
}

/** Skips the countdown so tests start in 'playing'. */
const toPlaying = (s: MatchState, map: ArenaMap) => run(s, map, ticksFor(MATCH.countdownMs));

describe('match flow', () => {
  it('waits for two players, then counts down, then plays', () => {
    const map = emptyMap();
    const s = createMatch(map);
    addPlayer(s, map, 'a', 'Ana');
    expect(s.phase).toBe('waiting');
    addPlayer(s, map, 'b', 'Bo');
    expect(s.phase).toBe('countdown');
    expect(s.round).toBe(1);
    const events = toPlaying(s, map);
    expect(s.phase).toBe('playing');
    expect(events).toContainEqual({ type: 'roundStart', round: 1 });
  });

  it('nobody moves during the countdown', () => {
    const map = emptyMap();
    const s = setup(map);
    const start = { ...findPlayer(s, 'a')?.pos };
    run(s, map, 10, () => ({ a: [input({ move: { x: 1, y: 0 } })] }));
    expect(findPlayer(s, 'a')?.pos).toEqual(start);
  });

  it('a kill ends the round and scores it', () => {
    const map = emptyMap();
    const s = setup(map);
    toPlaying(s, map);
    const b = findPlayer(s, 'b');
    if (!b) throw new Error('no b');
    b.hp = WEAPONS.pistol.damage; // one shot left
    // a (100,100) aims at b (400,100): angle 0
    const events = run(s, map, 1, () => ({ a: [input({ shoot: true, aim: 0 })] }));
    expect(events.map((e) => e.type)).toEqual(['shot', 'hit', 'kill', 'roundEnd']);
    expect(s.phase).toBe('roundEnd');
    expect(s.scores).toEqual({ a: 1, b: 0 });
  });

  it('after roundEnd a fresh round starts with full health', () => {
    const map = emptyMap();
    const s = setup(map);
    toPlaying(s, map);
    endRound(s, 'a', 'kill');
    run(s, map, ticksFor(MATCH.roundEndMs));
    expect(s.phase).toBe('countdown');
    expect(s.round).toBe(2);
    expect(s.players.every((p) => p.hp === 100)).toBe(true);
  });

  it('the healthier player wins on timeout; equal health is a draw', () => {
    const map = emptyMap();
    const s = setup(map);
    toPlaying(s, map);
    const a = findPlayer(s, 'a');
    if (a) a.hp = 60;
    const events = run(s, map, ticksFor(MATCH.roundDurationMs) + 1);
    expect(events).toContainEqual({ type: 'roundEnd', round: 1, winner: 'b', reason: 'timeout' });

    const s2 = setup(map);
    toPlaying(s2, map);
    const ev2 = run(s2, map, ticksFor(MATCH.roundDurationMs) + 1);
    expect(ev2).toContainEqual({ type: 'roundEnd', round: 1, winner: null, reason: 'timeout' });
  });

  it('first to three rounds wins the match (best of 5)', () => {
    const map = emptyMap();
    const s = setup(map);
    endRound(s, 'a', 'kill');
    endRound(s, 'b', 'kill');
    endRound(s, 'a', 'kill');
    expect(s.phase).toBe('roundEnd');
    const events = endRound(s, 'a', 'kill');
    expect(s.phase).toBe('matchEnd');
    expect(s.matchWinner).toBe('a');
    expect(events).toContainEqual({ type: 'matchEnd', winner: 'a' });
  });

  it('a rematch resets scores and starts round 1', () => {
    const map = emptyMap();
    const s = setup(map);
    for (let i = 0; i < 3; i++) endRound(s, 'a', 'kill');
    resetMatch(s, map);
    expect(s.scores).toEqual({ a: 0, b: 0 });
    expect(s.round).toBe(1);
    expect(s.phase).toBe('countdown');
  });
});

describe('pickups and sabotage', () => {
  const pickupMap = (): ArenaMap => ({
    ...emptyMap(),
    pickupSpots: [{ pos: { x: 130, y: 100 }, kind: 'lagSpike' }],
  });

  it('walking over a pickup fills the slot and starts its respawn timer', () => {
    const map = pickupMap();
    const s = setup(map);
    // Player a spawns on top of it: collected on the first 'playing' tick.
    const events = [...toPlaying(s, map), ...run(s, map, 1)];
    expect(events).toContainEqual({ type: 'pickup', by: 'a', kind: 'lagSpike' });
    expect(findPlayer(s, 'a')?.sabotageSlot).toBe('lagSpike');
    expect(s.pickups[0]?.respawnAt).toBeGreaterThan(s.time);
    expect(s.pickups[0]?.respawnAt).toBeLessThanOrEqual(s.time + PICKUPS.respawnMs);
  });

  it('using a sabotage puts a timed effect on the opponent', () => {
    const map = pickupMap();
    const s = setup(map);
    toPlaying(s, map);
    run(s, map, 1);
    const events = run(s, map, 1, () => ({ a: [input({ useSabotage: true })] }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'sabotage', by: 'a', target: 'b', kind: 'lagSpike' }),
    );
    expect(findPlayer(s, 'a')?.sabotageSlot).toBeNull();
    expect(findPlayer(s, 'b')?.activeEffects).toHaveLength(1);
    run(s, map, ticksFor(SABOTAGE_DURATION_MS.lagSpike));
    expect(findPlayer(s, 'b')?.activeEffects).toHaveLength(0);
  });

  it('a dead battery freezes the victim', () => {
    const map = emptyMap();
    const s = setup(map);
    toPlaying(s, map);
    const b = findPlayer(s, 'b');
    if (!b) throw new Error('no b');
    b.activeEffects.push({ id: 'deadBattery', until: s.time + 1000 });
    const start = { ...b.pos };
    run(s, map, 5, () => ({ b: [input({ move: { x: 0, y: 1 } })] }));
    expect(findPlayer(s, 'b')?.pos).toEqual(start);
  });
});

describe('the arena', () => {
  it('spawns and pickups are not inside walls', () => {
    const points = [...ARENA.spawns, ...ARENA.pickupSpots.map((p) => p.pos)];
    for (const p of points) {
      expect(resolveCircleVsWalls(p, 24, ARENA.walls)).toEqual(p);
    }
  });

  it('is point-symmetric so both spawns are fair', () => {
    const key = (w: { min: { x: number; y: number }; max: { x: number; y: number } }) =>
      `${w.min.x},${w.min.y},${w.max.x},${w.max.y}`;
    const set = new Set(ARENA.walls.map(key));
    for (const w of ARENA.walls) {
      const m = {
        min: { x: ARENA.size.x - w.max.x, y: ARENA.size.y - w.max.y },
        max: { x: ARENA.size.x - w.min.x, y: ARENA.size.y - w.min.y },
      };
      expect(set.has(key(m))).toBe(true);
    }
  });
});
