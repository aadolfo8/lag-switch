import { describe, expect, it } from 'vitest';
import { createMatch } from '../src/match.js';
import { interpolatePlayer, ServerClock, SnapshotBuffer } from '../src/netcode/interpolation.js';
import { createPlayer } from '../src/player.js';
import type { MatchState } from '../src/types.js';
import { emptyMap } from './helpers.js';

const snap = (time: number, x: number): MatchState => {
  const s = createMatch(emptyMap());
  s.time = time;
  s.players = [createPlayer('b', 'Bo', { x, y: 0 })];
  return s;
};

describe('SnapshotBuffer', () => {
  it('finds the two snapshots around the render time', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0));
    buf.push(snap(50, 100));
    buf.push(snap(100, 200));
    const r = buf.sample(75);
    expect(r?.from.time).toBe(50);
    expect(r?.to.time).toBe(100);
    expect(r?.t).toBeCloseTo(0.5);
  });

  it('holds the newest snapshot instead of extrapolating', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0));
    buf.push(snap(50, 100));
    expect(buf.sample(500)).toMatchObject({ t: 0, from: { time: 50 } });
  });

  it('survives a lost snapshot: interpolates across the gap', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0));
    // the one at 50 was lost
    buf.push(snap(100, 40));
    const r = buf.sample(50);
    const p = interpolatePlayer(r?.from.players[0], r?.to.players[0] as never, r?.t ?? 0);
    expect(p.pos.x).toBeCloseTo(20);
  });

  it('ignores duplicates and out-of-order snapshots', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(100, 0));
    buf.push(snap(50, 999));
    buf.push(snap(100, 999));
    expect(buf.newest?.players[0]?.pos.x).toBe(0);
  });

  it('drops snapshots older than its window', () => {
    const buf = new SnapshotBuffer(200);
    for (let t = 0; t <= 1000; t += 50) buf.push(snap(t, t));
    expect(buf.sample(0)?.from.time).toBeGreaterThanOrEqual(800);
  });
});

describe('interpolatePlayer', () => {
  it('does not slide across the map on a respawn', () => {
    const a = createPlayer('b', 'Bo', { x: 0, y: 0 });
    const b = createPlayer('b', 'Bo', { x: 1000, y: 0 });
    expect(interpolatePlayer(a, b, 0.3).pos.x).toBe(0);
    expect(interpolatePlayer(a, b, 0.7).pos.x).toBe(1000);
  });
});

describe('ServerClock', () => {
  it('follows the server timeline smoothly and snaps after big jumps', () => {
    const clock = new ServerClock();
    clock.observe(1000, 5000);
    expect(clock.now(5000)).toBe(1000);
    clock.observe(1050, 5060); // 10 ms late: small adjustment only
    expect(clock.now(5060)).toBeGreaterThan(1048);
    expect(clock.now(5060)).toBeLessThan(1060);
    clock.observe(1100, 5600); // 450 ms late (lag spike): snap
    expect(clock.now(5600)).toBe(1100);
  });
});
