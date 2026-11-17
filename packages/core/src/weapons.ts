import { PLAYER, WEAPONS } from './config.js';
import { add, fromAngle, scale } from './math.js';
import { castAgainstWalls, rayVsCircle } from './physics.js';
import type { Vec2, Wall, WeaponId } from './types.js';

export interface ShotTarget {
  id: string;
  pos: Vec2;
}

export interface PelletResult {
  end: Vec2;
  /** Id of the player hit by this pellet, if any. */
  hit: string | null;
}

/**
 * Pellet directions for a weapon. The shotgun uses a FIXED fan instead of
 * random spread: no RNG to keep in sync between client and server, and players
 * can learn the pattern (several competitive shooters do the same).
 */
export function pelletAngles(weapon: WeaponId, aim: number): number[] {
  const w = WEAPONS[weapon];
  if (w.pellets === 1) return [aim];
  const step = w.spreadRad / (w.pellets - 1);
  return Array.from({ length: w.pellets }, (_, i) => aim - w.spreadRad / 2 + i * step);
}

/** Where bullets leave the gun: on the edge of the player's circle. */
export const muzzleOf = (pos: Vec2, aim: number): Vec2 =>
  add(pos, fromAngle(aim, PLAYER.radius + 2));

/**
 * Instant (hitscan) shot. Each pellet travels until the first wall or player
 * it touches. `targets` are the positions to test against: on the server they
 * are the lag-compensated (rewound) positions of everybody but the shooter.
 */
export function traceShot(
  origin: Vec2,
  aim: number,
  weapon: WeaponId,
  walls: readonly Wall[],
  targets: readonly ShotTarget[],
): PelletResult[] {
  const range = WEAPONS[weapon].range;
  return pelletAngles(weapon, aim).map((angle) => {
    const dir = fromAngle(angle);
    let dist = castAgainstWalls(origin, dir, walls, range);
    let hit: string | null = null;
    for (const t of targets) {
      const d = rayVsCircle(origin, dir, t.pos, PLAYER.radius);
      if (d !== null && d < dist) {
        dist = d;
        hit = t.id;
      }
    }
    return { end: add(origin, scale(dir, dist)), hit };
  });
}
