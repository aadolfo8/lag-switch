import { clamp } from './math.js';
import type { Vec2, Wall } from './types.js';

/**
 * Pushes a circle out of every wall it overlaps.
 *
 * For each AABB we find the point of the box closest to the circle centre; if
 * it is closer than the radius, we push the centre away along that direction.
 * Because the push is along the contact normal, a player running diagonally
 * into a wall keeps the tangential part of the motion: it slides.
 *
 * Two passes are enough to settle corners where two walls meet.
 */
export function resolveCircleVsWalls(pos: Vec2, radius: number, walls: readonly Wall[]): Vec2 {
  let { x, y } = pos;
  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls) {
      const cx = clamp(x, w.min.x, w.max.x);
      const cy = clamp(y, w.min.y, w.max.y);
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;

      if (d2 > 1e-9) {
        // Centre is outside the box: push along the contact normal.
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        y = cy + (dy / d) * radius;
      } else {
        // Centre is inside the box (tunnelled in): leave by the nearest face.
        const left = x - w.min.x;
        const right = w.max.x - x;
        const top = y - w.min.y;
        const bottom = w.max.y - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = w.min.x - radius;
        else if (m === right) x = w.max.x + radius;
        else if (m === top) y = w.min.y - radius;
        else y = w.max.y + radius;
      }
    }
  }
  return { x, y };
}

/**
 * Ray vs AABB using the slab method. Returns the distance along the
 * (normalised) direction to the first hit, or null.
 */
export function rayVsBox(origin: Vec2, dir: Vec2, w: Wall): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (const axis of ['x', 'y'] as const) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = w.min[axis];
    const hi = w.max[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null; // parallel and outside this slab
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null; // box is behind the ray
  return Math.max(tmin, 0); // origin inside the box counts as an immediate hit
}

/** Ray vs circle. Returns the distance to the first intersection, or null. */
export function rayVsCircle(origin: Vec2, dir: Vec2, center: Vec2, radius: number): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const b = ox * dir.x + oy * dir.y;
  const c = ox * ox + oy * oy - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  if (t1 >= 0) return t1;
  const t2 = -b + sq;
  return t2 >= 0 ? 0 : null; // origin inside the circle
}

/** Distance to the nearest wall along a ray, capped at `maxDist`. */
export function castAgainstWalls(
  origin: Vec2,
  dir: Vec2,
  walls: readonly Wall[],
  maxDist: number,
): number {
  let best = maxDist;
  for (const w of walls) {
    const t = rayVsBox(origin, dir, w);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/** True when nothing blocks the straight line between two points. */
export function hasLineOfSight(a: Vec2, b: Vec2, walls: readonly Wall[]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return true;
  const dir = { x: dx / dist, y: dy / dist };
  return castAgainstWalls(a, dir, walls, dist) >= dist;
}
