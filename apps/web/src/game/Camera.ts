import type { Vec2 } from '@lag-switch/core';
import type { Container } from 'pixi.js';

/**
 * Fits the whole arena on screen (it is small enough to see at once, which
 * suits a 1v1 duel) and adds screen shake on top.
 */
export class Camera {
  private scale = 1;
  private offset: Vec2 = { x: 0, y: 0 };
  private trauma = 0;

  constructor(private readonly world: Container) {}

  /**
   * Scales the arena into the view, leaving room for the React HUD above
   * (scoreboard) and below (sabotage slot and keys).
   */
  fit(view: Vec2, arena: Vec2, pad = { top: 112, bottom: 64, side: 24 }): void {
    const w = view.x - pad.side * 2;
    const h = view.y - pad.top - pad.bottom;
    this.scale = Math.max(0.1, Math.min(w / arena.x, h / arena.y));
    this.offset = {
      x: (view.x - arena.x * this.scale) / 2,
      y: pad.top + (h - arena.y * this.scale) / 2,
    };
  }

  /** Adds shake; stacking hits shake harder, capped at 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dtMs: number): void {
    this.trauma = Math.max(0, this.trauma - dtMs / 400);
    // Shake grows with trauma squared: small hits wobble, big ones jolt.
    const s = this.trauma * this.trauma * 14;
    const t = performance.now() / 1000;
    const jx = s * (Math.sin(t * 91) + Math.sin(t * 57)) * 0.5;
    const jy = s * (Math.cos(t * 83) + Math.sin(t * 43)) * 0.5;
    this.world.position.set(this.offset.x + jx, this.offset.y + jy);
    this.world.scale.set(this.scale);
  }

  toWorld(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.offset.x) / this.scale,
      y: (screen.y - this.offset.y) / this.scale,
    };
  }
}
