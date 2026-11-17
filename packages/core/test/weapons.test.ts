import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/config.js';
import { pelletAngles, traceShot } from '../src/weapons.js';

describe('pelletAngles', () => {
  it('pistol fires one pellet straight', () => {
    expect(pelletAngles('pistol', 1)).toEqual([1]);
  });

  it('shotgun fans its pellets symmetrically across the spread', () => {
    const angles = pelletAngles('shotgun', 0);
    expect(angles).toHaveLength(WEAPONS.shotgun.pellets);
    expect(angles[0]).toBeCloseTo(-WEAPONS.shotgun.spreadRad / 2);
    expect(angles.at(-1)).toBeCloseTo(WEAPONS.shotgun.spreadRad / 2);
    expect(angles[2]).toBeCloseTo(0);
  });
});

describe('traceShot', () => {
  const target = { id: 'b', pos: { x: 200, y: 0 } };

  it('hits a target in the line of fire', () => {
    const [p] = traceShot({ x: 0, y: 0 }, 0, 'pistol', [], [target]);
    expect(p?.hit).toBe('b');
    expect(p?.end.x).toBeCloseTo(184);
  });

  it('is stopped by a wall in between', () => {
    const wall = { min: { x: 100, y: -50 }, max: { x: 120, y: 50 } };
    const [p] = traceShot({ x: 0, y: 0 }, 0, 'pistol', [wall], [target]);
    expect(p?.hit).toBeNull();
    expect(p?.end.x).toBeCloseTo(100);
  });

  it('stops at max range', () => {
    const [p] = traceShot({ x: 0, y: 0 }, Math.PI, 'pistol', [], [target]);
    expect(p?.hit).toBeNull();
    expect(p?.end.x).toBeCloseTo(-WEAPONS.pistol.range);
  });

  it('shotgun up close lands every pellet, far away only some', () => {
    const near = traceShot({ x: 0, y: 0 }, 0, 'shotgun', [], [{ id: 'b', pos: { x: 40, y: 0 } }]);
    expect(near.filter((p) => p.hit).length).toBe(WEAPONS.shotgun.pellets);
    const far = traceShot({ x: 0, y: 0 }, 0, 'shotgun', [], [{ id: 'b', pos: { x: 300, y: 0 } }]);
    expect(far.filter((p) => p.hit).length).toBeLessThan(WEAPONS.shotgun.pellets);
  });
});
