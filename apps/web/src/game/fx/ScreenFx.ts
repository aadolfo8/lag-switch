import type { SabotageId } from '@lag-switch/core';
import { ColorMatrixFilter, type Container, type Filter, Graphics } from 'pixi.js';
import { GlitchFilter, RGBSplitFilter } from 'pixi-filters';

/**
 * What a sabotage looks like from the victim's chair. These filters only
 * dramatise what the netcode is already doing for real (the delay, the lost
 * snapshots, the closed socket); they never fake it.
 *
 *   lag spike     → soft RGB split, slowly breathing
 *   packet loss   → glitch slices in bursts, clean frames in between
 *   Wi-Fi reset   → desaturated and dark (your game is frozen)
 *   dead battery  → no filter; a blinking controller over the player instead
 */
export class ScreenFx {
  /** Full-screen white quad for the one-frame hit flash (screen space). */
  readonly flashLayer = new Graphics();
  private readonly rgb = new RGBSplitFilter({ red: [-2, 0], green: [0, 1], blue: [2, 0] });
  private readonly glitch = new GlitchFilter({
    slices: 10,
    offset: 22,
    fillMode: 2,
    average: false,
  });
  private readonly dim = new ColorMatrixFilter();
  private flashFrames = 0;
  private nextGlitchAt = 0;
  private glitching = false;
  private applied = '';

  constructor(private readonly world: Container) {
    this.dim.desaturate();
    this.dim.brightness(0.45, true);
    this.flashLayer.alpha = 0;
  }

  /** One frame of white when you get hit. */
  flash(): void {
    this.flashFrames = 1;
  }

  update(
    now: number,
    view: { w: number; h: number },
    effects: ReadonlySet<SabotageId>,
    offline: boolean,
  ): void {
    // --- flash ---
    if (this.flashFrames > 0) {
      this.flashLayer.clear().rect(0, 0, view.w, view.h).fill(0xffffff);
      this.flashLayer.alpha = 0.55;
      this.flashFrames--;
    } else {
      this.flashLayer.alpha = 0;
    }

    // --- sabotage filters ---
    const filters: Filter[] = [];
    if (effects.has('lagSpike')) {
      const wobble = 1.5 + Math.sin(now / 180) * 1.2;
      this.rgb.red = { x: -wobble, y: 0 };
      this.rgb.blue = { x: wobble, y: 0.5 };
      filters.push(this.rgb);
    }
    if (effects.has('packetLoss')) {
      // Bursts of glitch with clean stretches in between, like dropped packets.
      if (now >= this.nextGlitchAt) {
        this.glitching = Math.random() < 0.45;
        this.nextGlitchAt =
          now + (this.glitching ? 60 + Math.random() * 90 : 120 + Math.random() * 260);
        if (this.glitching) {
          this.glitch.seed = Math.random();
          this.glitch.offset = 10 + Math.random() * 30;
          this.glitch.refresh();
        }
      }
      if (this.glitching) filters.push(this.glitch);
    }
    if (offline || effects.has('wifiReset')) filters.push(this.dim);

    // Only touch .filters when the set changes: assigning it allocates.
    const key = filters.map((f) => f.constructor.name).join('+');
    if (key !== this.applied) {
      this.world.filters = filters.length > 0 ? filters : null;
      this.applied = key;
    }
  }
}
