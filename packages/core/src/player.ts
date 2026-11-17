import { PLAYER, RELOAD_MS, TICK_MS, WEAPONS } from './config.js';
import { clampLength, wrapAngle } from './math.js';
import { resolveCircleVsWalls } from './physics.js';
import type { ArenaMap, PlayerInput, PlayerState, Vec2, WeaponId } from './types.js';

export const NEUTRAL_INPUT: Omit<PlayerInput, 'seq' | 'aim'> = {
  move: { x: 0, y: 0 },
  shoot: false,
  reload: false,
  switchWeapon: false,
  useSabotage: false,
};

export function createPlayer(id: string, name: string, spawn: Vec2): PlayerState {
  return {
    id,
    name,
    pos: { ...spawn },
    vel: { x: 0, y: 0 },
    aim: 0,
    hp: PLAYER.maxHp,
    weapon: 'pistol',
    ammo: { pistol: WEAPONS.pistol.magazine, shotgun: WEAPONS.shotgun.magazine },
    reloadMsLeft: 0,
    cooldownMsLeft: 0,
    sabotageSlot: null,
    activeEffects: [],
    connected: true,
  };
}

/** Deep copy without structuredClone (core has no DOM or Node globals). */
export function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    pos: { ...p.pos },
    vel: { ...p.vel },
    ammo: { ...p.ammo },
    activeEffects: p.activeEffects.map((e) => ({ ...e })),
  };
}

export const isAlive = (p: PlayerState): boolean => p.hp > 0;

export interface InputOutcome {
  /** The weapon went off this step; the caller resolves the hitscan. */
  fired: boolean;
  /** A reload started this step. */
  reloadStarted: boolean;
}

export interface ApplyOptions {
  /**
   * The player can aim but not move or act: countdown, round over, or a dead
   * controller battery. The client knows all of these from the last snapshot,
   * so it predicts the freeze too instead of fighting the server.
   */
  frozen?: boolean;
}

/**
 * Advances ONE player by ONE fixed step using ONE input.
 *
 * This is the function client-side prediction is built on: the server calls
 * it for every input it receives, and the client calls it immediately for
 * every input it sends (and again, during reconciliation, for every input the
 * server has not acknowledged yet). Same code, same inputs, same result.
 *
 * It mutates `p` in place; callers that need the old state clone first.
 * It is deliberately blind to other players: hits are resolved by the caller,
 * which is authoritative on the server and cosmetic on the client.
 */
export function applyInput(
  p: PlayerState,
  input: PlayerInput,
  map: ArenaMap,
  opts: ApplyOptions = {},
): InputOutcome {
  const outcome: InputOutcome = { fired: false, reloadStarted: false };
  if (!isAlive(p)) return outcome;

  // Never trust the wire: the schema already validated types, here we clamp ranges.
  if (Number.isFinite(input.aim)) p.aim = wrapAngle(input.aim);

  const dt = TICK_MS / 1000;
  const move = opts.frozen ? { x: 0, y: 0 } : clampLength(input.move, 1);

  // --- movement: ease velocity towards the target, integrate, collide ---
  const k = Math.min(1, PLAYER.acceleration * dt);
  p.vel.x += (move.x * PLAYER.speed - p.vel.x) * k;
  p.vel.y += (move.y * PLAYER.speed - p.vel.y) * k;
  if (Math.abs(p.vel.x) < 0.5) p.vel.x = 0;
  if (Math.abs(p.vel.y) < 0.5) p.vel.y = 0;

  const before = p.pos;
  const next = resolveCircleVsWalls(
    { x: before.x + p.vel.x * dt, y: before.y + p.vel.y * dt },
    PLAYER.radius,
    map.walls,
  );
  // If a wall stopped us on an axis, kill that axis' velocity so we don't
  // keep "pressing" into it and bounce on release.
  if (Math.abs(next.x - (before.x + p.vel.x * dt)) > 1e-6) p.vel.x = 0;
  if (Math.abs(next.y - (before.y + p.vel.y * dt)) > 1e-6) p.vel.y = 0;
  p.pos = next;

  // --- weapon timers tick down by exactly one step ---
  p.cooldownMsLeft = Math.max(0, p.cooldownMsLeft - TICK_MS);
  if (p.reloadMsLeft > 0) {
    p.reloadMsLeft = Math.max(0, p.reloadMsLeft - TICK_MS);
    if (p.reloadMsLeft === 0) p.ammo[p.weapon] = WEAPONS[p.weapon].magazine;
  }

  if (opts.frozen) return outcome;

  // --- actions ---
  if (input.switchWeapon) {
    p.weapon = otherWeapon(p.weapon);
    p.reloadMsLeft = 0; // switching cancels a reload, like in most shooters
    p.cooldownMsLeft = Math.max(p.cooldownMsLeft, PLAYER.switchMs);
  }

  const w = WEAPONS[p.weapon];
  const reloading = p.reloadMsLeft > 0;
  const wantsReload = input.reload || (input.shoot && p.ammo[p.weapon] === 0);

  if (wantsReload && !reloading && p.ammo[p.weapon] < w.magazine) {
    p.reloadMsLeft = RELOAD_MS;
    outcome.reloadStarted = true;
  } else if (input.shoot && !reloading && p.cooldownMsLeft === 0 && p.ammo[p.weapon] > 0) {
    p.ammo[p.weapon] -= 1;
    p.cooldownMsLeft = w.cooldownMs;
    outcome.fired = true;
  }

  return outcome;
}

export const otherWeapon = (w: WeaponId): WeaponId => (w === 'pistol' ? 'shotgun' : 'pistol');
