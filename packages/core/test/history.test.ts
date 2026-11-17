import { describe, expect, it } from 'vitest';
import { NET } from '../src/config.js';
import { createMatch } from '../src/match.js';
import { PositionHistory, rewindMsFor } from '../src/netcode/history.js';
import { createPlayer } from '../src/player.js';
import { emptyMap } from './helpers.js';

describe('PositionHistory', () => {
  const at = (time: number, x: number) => {
    const s = createMatch(emptyMap());
    s.time = time;
    s.players = [createPlayer('b', 'Bo', { x, y: 0 })];
    return s;
  };

  it('returns past positions, interpolated between ticks', () => {
    const h = new PositionHistory();
    h.record(at(0, 0));
    h.record(at(100, 100));
    h.record(at(200, 300));
    expect(h.positionAt('b', 150)?.x).toBeCloseTo(200);
    expect(h.positionAt('b', 500)?.x).toBe(300);
    expect(h.positionAt('nobody', 150)).toBeUndefined();
  });

  it('forgets frames older than its window', () => {
    const h = new PositionHistory(300);
    for (let t = 0; t <= 1000; t += 100) h.record(at(t, t));
    expect(h.positionAt('b', 0)?.x).toBe(700);
  });
});

describe('rewindMsFor', () => {
  it('rewinds half the RTT plus the interpolation delay', () => {
    expect(rewindMsFor(60)).toBe(30 + NET.interpolationDelayMs);
  });

  it('is capped for very laggy shooters', () => {
    expect(rewindMsFor(2000)).toBe(NET.maxRewindMs);
  });
});
