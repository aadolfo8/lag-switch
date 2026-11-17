import type { Vec2 } from './types.js';

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const fromAngle = (rad: number, len = 1): Vec2 => ({
  x: Math.cos(rad) * len,
  y: Math.sin(rad) * len,
});

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** Interpolates angles along the shortest arc (so 350° → 10° doesn't spin the long way). */
export const lerpAngle = (a: number, b: number, t: number): number => {
  const diff = wrapAngle(b - a);
  return a + diff * t;
};

/** Wraps an angle into (-π, π]. */
export const wrapAngle = (rad: number): number => {
  let r = rad % (Math.PI * 2);
  if (r <= -Math.PI) r += Math.PI * 2;
  if (r > Math.PI) r -= Math.PI * 2;
  return r;
};

/** Clamps a vector's length to `max` (used to sanitise analog-ish move input). */
export const clampLength = (a: Vec2, max: number): Vec2 => {
  const len = length(a);
  return len > max ? scale(a, max / len) : a;
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;
