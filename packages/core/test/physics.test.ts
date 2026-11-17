import { describe, expect, it } from 'vitest';
import { hasLineOfSight, rayVsBox, rayVsCircle, resolveCircleVsWalls } from '../src/physics.js';

const wall = { min: { x: 100, y: 0 }, max: { x: 200, y: 100 } };

describe('resolveCircleVsWalls', () => {
  it('leaves a circle that does not touch anything alone', () => {
    expect(resolveCircleVsWalls({ x: 50, y: 50 }, 16, [wall])).toEqual({ x: 50, y: 50 });
  });

  it('pushes a circle out along the face normal', () => {
    const out = resolveCircleVsWalls({ x: 90, y: 50 }, 16, [wall]);
    expect(out.x).toBeCloseTo(84);
    expect(out.y).toBeCloseTo(50);
  });

  it('pushes out diagonally at a corner', () => {
    const out = resolveCircleVsWalls({ x: 95, y: 105 }, 16, [wall]);
    const d = Math.hypot(out.x - 100, out.y - 100);
    expect(d).toBeCloseTo(16);
  });

  it('gets a tunnelled circle out by the nearest face', () => {
    const out = resolveCircleVsWalls({ x: 195, y: 50 }, 16, [wall]);
    expect(out.x).toBeCloseTo(216);
  });
});

describe('rays', () => {
  it('hits a box in front and misses one behind', () => {
    expect(rayVsBox({ x: 0, y: 50 }, { x: 1, y: 0 }, wall)).toBeCloseTo(100);
    expect(rayVsBox({ x: 300, y: 50 }, { x: 1, y: 0 }, wall)).toBeNull();
  });

  it('handles rays parallel to a slab', () => {
    expect(rayVsBox({ x: 150, y: 200 }, { x: 0, y: -1 }, wall)).toBeCloseTo(100);
    expect(rayVsBox({ x: 50, y: 200 }, { x: 0, y: -1 }, wall)).toBeNull();
  });

  it('hits a circle at its near edge', () => {
    expect(rayVsCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 }, 16)).toBeCloseTo(84);
    expect(rayVsCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 40 }, 16)).toBeNull();
  });

  it('computes line of sight through walls', () => {
    expect(hasLineOfSight({ x: 0, y: 50 }, { x: 300, y: 50 }, [wall])).toBe(false);
    expect(hasLineOfSight({ x: 0, y: 150 }, { x: 300, y: 150 }, [wall])).toBe(true);
  });
});
