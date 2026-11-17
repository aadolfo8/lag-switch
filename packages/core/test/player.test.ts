import { describe, expect, it } from 'vitest';
import { PLAYER, RELOAD_MS, TICK_MS, WEAPONS } from '../src/config.js';
import { applyInput, clonePlayer, createPlayer } from '../src/player.js';
import { emptyMap, input, times } from './helpers.js';

const map = emptyMap();

describe('movement', () => {
  it('accelerates towards top speed and never exceeds it', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    times(60, () => applyInput(p, input({ move: { x: 1, y: 0 } }), map));
    expect(p.vel.x).toBeCloseTo(PLAYER.speed, 0);
    expect(p.vel.x).toBeLessThanOrEqual(PLAYER.speed);
  });

  it('normalises diagonal input so diagonals are not faster', () => {
    const p = createPlayer('a', 'a', { x: 500, y: 500 });
    times(60, () => applyInput(p, input({ move: { x: 1, y: 1 } }), map));
    expect(Math.hypot(p.vel.x, p.vel.y)).toBeLessThanOrEqual(PLAYER.speed + 1e-6);
  });

  it('stops at walls and slides along them', () => {
    const wallMap = emptyMap([{ min: { x: 200, y: 0 }, max: { x: 300, y: 1000 } }]);
    const p = createPlayer('a', 'a', { x: 150, y: 500 });
    times(60, () => applyInput(p, input({ move: { x: 1, y: 1 } }), wallMap));
    expect(p.pos.x).toBeCloseTo(200 - PLAYER.radius);
    expect(p.pos.y).toBeGreaterThan(550); // kept moving down
  });

  it('is deterministic: same inputs, same result', () => {
    const inputs = Array.from({ length: 90 }, (_, i) =>
      input({ move: { x: Math.sin(i / 7), y: Math.cos(i / 5) }, aim: i / 10 }),
    );
    const a = createPlayer('a', 'a', { x: 300, y: 300 });
    const b = clonePlayer(a);
    for (const i of inputs) applyInput(a, i, map);
    for (const i of inputs) applyInput(b, i, map);
    expect(a).toEqual(b);
  });

  it('ignores movement but still aims while frozen', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    applyInput(p, input({ move: { x: 1, y: 0 }, aim: 1.5, shoot: true }), map, { frozen: true });
    expect(p.pos).toEqual({ x: 100, y: 100 });
    expect(p.aim).toBeCloseTo(1.5);
    expect(p.ammo.pistol).toBe(WEAPONS.pistol.magazine);
  });
});

describe('weapons', () => {
  it('fires, then respects the cooldown', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    expect(applyInput(p, input({ shoot: true }), map).fired).toBe(true);
    expect(applyInput(p, input({ shoot: true }), map).fired).toBe(false);
    const stepsToReady = Math.ceil(WEAPONS.pistol.cooldownMs / TICK_MS);
    let fired = 0;
    times(stepsToReady, () => {
      if (applyInput(p, input({ shoot: true }), map).fired) fired++;
    });
    expect(fired).toBe(1);
    expect(p.ammo.pistol).toBe(WEAPONS.pistol.magazine - 2);
  });

  it('auto-reloads on an empty trigger pull and refills after RELOAD_MS', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    p.ammo.pistol = 0;
    expect(applyInput(p, input({ shoot: true }), map).reloadStarted).toBe(true);
    times(Math.ceil(RELOAD_MS / TICK_MS), () => applyInput(p, input(), map));
    expect(p.ammo.pistol).toBe(WEAPONS.pistol.magazine);
    expect(p.reloadMsLeft).toBe(0);
  });

  it('does not reload a full magazine', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    expect(applyInput(p, input({ reload: true }), map).reloadStarted).toBe(false);
  });

  it('switching weapons keeps each magazine and cancels a reload', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    p.ammo.pistol = 3;
    applyInput(p, input({ reload: true }), map);
    applyInput(p, input({ switchWeapon: true }), map);
    expect(p.weapon).toBe('shotgun');
    expect(p.reloadMsLeft).toBe(0);
    expect(p.ammo).toEqual({ pistol: 3, shotgun: WEAPONS.shotgun.magazine });
    // and the switch delay blocks an instant shot
    expect(applyInput(p, input({ shoot: true }), map).fired).toBe(false);
  });

  it('dead players do nothing', () => {
    const p = createPlayer('a', 'a', { x: 100, y: 100 });
    p.hp = 0;
    expect(applyInput(p, input({ shoot: true, move: { x: 1, y: 0 } }), map)).toEqual({
      fired: false,
      reloadStarted: false,
    });
    expect(p.pos).toEqual({ x: 100, y: 100 });
  });
});
