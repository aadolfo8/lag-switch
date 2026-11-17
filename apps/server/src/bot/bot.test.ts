import { ARENA, MATCH, type PlayerInput, TICK_MS } from '@lag-switch/core';
import { describe, expect, it } from 'vitest';
import type { Peer } from '../game/peer.js';
import { Room } from '../game/Room.js';
import { Bot } from './Bot.js';
import { NavGrid } from './nav.js';

describe('NavGrid', () => {
  const nav = new NavGrid(ARENA);

  it('finds a walkable path between the two spawns', () => {
    const [a, b] = ARENA.spawns as [{ x: number; y: number }, { x: number; y: number }];
    const path = nav.findPath(a, b);
    expect(path).not.toBeNull();
    let from = a;
    for (const p of path ?? []) {
      expect(nav.canWalk(from, p)).toBe(true);
      from = p;
    }
    expect(from).toEqual(b);
  });

  it('marks cells next to walls as blocked', () => {
    expect(nav.isFreePoint({ x: 368, y: 200 })).toBe(false); // inside the tall pillar
    expect(nav.isFreePoint({ x: 160, y: 800 })).toBe(true); // a spawn
  });
});

/** A human who stands still and only pings (so the server doesn't time them out). */
function arena(seed = 1) {
  let clock = 0;
  const room = new Room({ code: 'BOTTY', now: () => clock });
  const bot = new Bot(room, { seed });
  bot.join();
  room.onTick(() => bot.think());
  const human: Peer = { send: () => {}, close: () => {} };
  const joined = room.join(human, 'Ana');
  if (!joined.ok) throw new Error();
  const humanId = joined.seat.playerId;
  let seq = 0;
  const tick = (n: number, inputs: Partial<PlayerInput> = {}) => {
    for (let i = 0; i < n; i++) {
      clock += TICK_MS;
      room.receive(humanId, {
        type: 'input',
        inputs: [
          {
            seq: ++seq,
            move: { x: 0, y: 0 },
            aim: 0,
            shoot: false,
            reload: false,
            switchWeapon: false,
            useSabotage: false,
            ...inputs,
          },
        ],
      });
      room.tick();
    }
  };
  const player = (id: string | null) => room.state.players.find((p) => p.id === id);
  return { room, bot, humanId, tick, player };
}

describe('Bot', () => {
  it('hunts down a human standing still and shoots them', () => {
    const { tick, player, humanId, room } = arena();
    tick(Math.ceil(MATCH.countdownMs / TICK_MS));
    const before = room.state.round;
    // 20 seconds of game time
    for (let i = 0; i < 600 && room.state.round === before && room.state.phase === 'playing'; i++) {
      tick(1);
    }
    const hp = player(humanId)?.hp ?? 100;
    const roundOver = room.state.phase !== 'playing';
    expect(hp < 100 || roundOver).toBe(true);
  });

  it('uses a sabotage once it has one and can see you', () => {
    const { tick, player, bot, room, humanId } = arena(7);
    tick(Math.ceil(MATCH.countdownMs / TICK_MS));
    const me = player(bot.id);
    if (me) me.sabotageSlot = 'lagSpike';
    for (let i = 0; i < 600 && !player(humanId)?.activeEffects.length; i++) tick(1);
    expect(player(humanId)?.activeEffects.map((e) => e.id)).toContain('lagSpike');
    expect(room.state.phase).not.toBe('waiting');
  });

  it('is really disconnected by a Wi-Fi reset and rejoins with its token', () => {
    const { tick, player, bot, humanId } = arena(3);
    tick(Math.ceil(MATCH.countdownMs / TICK_MS));
    const human = player(humanId);
    if (human) human.sabotageSlot = 'wifiReset';
    tick(1, { useSabotage: true });
    expect(player(bot.id)?.connected).toBe(false);
    tick(Math.ceil(3500 / TICK_MS));
    expect(player(bot.id)?.connected).toBe(true);
  });
});
