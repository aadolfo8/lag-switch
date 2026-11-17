import { TICK_MS, type Vec2 } from '@lag-switch/core';
import { Application, Container } from 'pixi.js';
import { Camera } from './Camera';
import { publishHud } from './hudStore';
import { InputController } from './InputController';
import type { GameSession } from './session';
import { WorldRenderer } from './WorldRenderer';

/** Longest frame we simulate; after a stall we drop time instead of spiralling. */
const MAX_FRAME_MS = 250;

/**
 * Owns the canvas and the game loop.
 *
 * The loop is the classic "fixed timestep, variable render": real time is
 * accumulated and spent in exact 33.3 ms simulation steps (the same step the
 * server uses), while rendering happens every display frame, blending the
 * last two steps with `alpha` so motion stays smooth at 60, 120 or 144 Hz.
 */
export class GameClient {
  private readonly world = new Container();
  private readonly camera: Camera;
  private readonly renderer: WorldRenderer;
  private readonly input: InputController;
  private accumulator = 0;
  private seq = 0;
  private youDrawnAt: Vec2 = { x: 0, y: 0 };

  private constructor(
    private readonly app: Application,
    private readonly session: GameSession,
    host: HTMLElement,
  ) {
    this.renderer = new WorldRenderer(session.map);
    this.world.addChild(this.renderer.root);
    app.stage.addChild(this.world);
    this.camera = new Camera(this.world);
    this.input = new InputController(host);
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  static async create(host: HTMLElement, session: GameSession): Promise<GameClient> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0, // the notebook paper is the page background
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      preference: 'webgpu', // falls back to WebGL2 where WebGPU is missing
    });
    app.canvas.setAttribute('aria-label', 'Lag Switch arena');
    app.canvas.style.display = 'block';
    host.appendChild(app.canvas);
    return new GameClient(app, session, host);
  }

  set onKey(fn: ((code: string) => void) | null) {
    this.input.onKey = fn;
  }

  private tick(deltaMs: number): void {
    const now = performance.now();
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);

    let stepped = false;
    while (this.accumulator >= TICK_MS) {
      this.seq += 1;
      const input = this.input.sample(this.seq, this.youDrawnAt, (s) => this.camera.toWorld(s));
      this.session.step(input);
      this.accumulator -= TICK_MS;
      stepped = true;
    }

    this.camera.fit({ x: this.app.screen.width, y: this.app.screen.height }, this.session.map.size);

    const frame = this.session.frame(this.accumulator / TICK_MS, now);
    if (frame) {
      const you = frame.players.find((p) => p.isYou);
      if (you) this.youDrawnAt = you.pos;
      this.renderer.render(frame, now);
    }

    const youId = this.session.youId();
    for (const e of this.session.drainEvents()) {
      this.renderer.onEvent(e, now);
      if (e.type === 'hit' && e.target === youId) this.camera.shake(0.35);
    }
    this.camera.update(deltaMs);

    const state = this.session.state();
    if (stepped && state) publishHud(state, youId);
  }

  destroy(): void {
    this.input.dispose();
    this.session.dispose();
    this.app.destroy(true, { children: true });
  }
}
