import {
  type ArenaMap,
  lerpVec,
  MATCH,
  type PlayerInput,
  TICK_MS,
  type Vec2,
} from '@lag-switch/core';
import { describe, expect, it } from 'vitest';
import type { Peer } from './peer.js';
import { Room } from './Room.js';

const openField: ArenaMap = {
  size: { x: 2000, y: 2000 },
  walls: [],
  spawns: [
    { x: 100, y: 500 },
    { x: 600, y: 500 },
  ],
  pickupSpots: [],
};

const silent: Peer = { send: () => {}, close: () => {} };
const input = (seq: number, over: Partial<PlayerInput>): PlayerInput => ({
  seq,
  move: { x: 0, y: 0 },
  aim: 0,
  shoot: false,
  reload: false,
  switchWeapon: false,
  useSabotage: false,
  ...over,
});

/**
 * B runs straight down past A. A fires at where B was 150 ms ago, which is
 * what A's screen showed with a 100 ms RTT and 100 ms of interpolation.
 */
function duel(shooterRtt: number, shooterViewDelay: number) {
  const room = new Room({ code: 'ABCDE', map: openField });
  const a = room.join(silent, 'Ana');
  const b = room.join(silent, 'Bo');
  if (!a.ok || !b.ok) throw new Error();
  a.seat.rtt = shooterRtt;
  a.seat.viewDelayMs = shooterViewDelay;
  for (let i = 0; i < Math.ceil(MATCH.countdownMs / TICK_MS); i++) room.tick();

  const trail: { time: number; pos: Vec2 }[] = [];
  let seq = 0;
  for (let i = 0; i < 20; i++) {
    room.receive(b.seat.playerId, {
      type: 'input',
      inputs: [input(++seq, { move: { x: 0, y: 1 } })],
    });
    room.tick();
    const pb = room.state.players.find((p) => p.id === b.seat.playerId);
    if (pb) trail.push({ time: room.state.time, pos: { ...pb.pos } });
  }

  // Where B was 150 ms before the tick that will process A's shot.
  const shotTime = room.state.time + TICK_MS - (100 / 2 + 100);
  const i = trail.findIndex((f) => f.time > shotTime);
  const f0 = trail[i - 1] as { time: number; pos: Vec2 };
  const f1 = trail[i] as { time: number; pos: Vec2 };
  const seen = lerpVec(f0.pos, f1.pos, (shotTime - f0.time) / (f1.time - f0.time));
  const pa = room.state.players.find((p) => p.id === a.seat.playerId) as { pos: Vec2 };
  const aim = Math.atan2(seen.y - pa.pos.y, seen.x - pa.pos.x);

  room.receive(b.seat.playerId, {
    type: 'input',
    inputs: [input(++seq, { move: { x: 0, y: 1 } })],
  });
  room.receive(a.seat.playerId, { type: 'input', inputs: [input(1, { aim, shoot: true })] });
  room.tick();
  return room.state.players.find((p) => p.id === b.seat.playerId)?.hp;
}

describe('lag compensation', () => {
  it('hits where the shooter saw the target (rewound 150 ms)', () => {
    expect(duel(100, 100)).toBe(75);
  });

  it('the same shot misses without rewinding: the target has moved on', () => {
    expect(duel(0, 0)).toBe(100);
  });
});
