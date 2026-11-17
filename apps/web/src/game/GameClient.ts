import { type GameEvent, type SabotageId, TICK_MS, type Vec2 } from '@lag-switch/core';
import { Application, Container } from 'pixi.js';
import { Sketchbook } from './art/Sketchbook';
import { play, toggleMute, unlockAudio } from './audio';
import { Camera } from './Camera';
import { ScreenFx } from './fx/ScreenFx';
import { publishHud, recordEvent } from './hudStore';
import { InputController } from './InputController';
import { useNet } from './netStore';
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
  private readonly fx: ScreenFx;
  private readonly input: InputController;
  private accumulator = 0;
  private seq = 0;
  private youDrawnAt: Vec2 = { x: 0, y: 0 };
  private youEffects = new Set<SabotageId>();
  private extraKey: ((code: string) => void) | null = null;

  private constructor(
    private readonly app: Application,
    private readonly session: GameSession,
    host: HTMLElement,
  ) {
    const art = new Sketchbook(app.renderer, session.map);
    this.renderer = new WorldRenderer(art);
    this.world.addChild(this.renderer.root);
    this.fx = new ScreenFx(this.world);
    app.stage.addChild(this.world, this.fx.flashLayer);
    this.camera = new Camera(this.world);
    this.input = new InputController(host);
    this.input.onKey = (code) => {
      unlockAudio();
      if (code === 'KeyM') toggleMute();
      this.extraKey?.(code);
    };
    host.addEventListener('pointerdown', unlockAudio, { once: true });
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  static async create(host: HTMLElement, session: GameSession): Promise<GameClient> {
    // Canvas text (pickup labels) needs the handwriting font before first use.
    await Promise.race([
      Promise.all([document.fonts.load('700 22px Caveat'), document.fonts.load('500 22px Caveat')]),
      new Promise((r) => setTimeout(r, 1500)), // never block the game on a font
    ]);
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
    this.extraKey = fn;
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

    const view = { x: this.app.screen.width, y: this.app.screen.height };
    this.camera.fit(view, this.session.map.size);

    const frame = this.session.frame(this.accumulator / TICK_MS, now);
    if (frame) {
      const you = frame.players.find((p) => p.isYou);
      if (you) {
        this.youDrawnAt = you.pos;
        this.youEffects = new Set(you.effects);
      }
      this.renderer.render(frame, now);
    }

    const youId = this.session.youId();
    for (const e of this.session.drainEvents()) {
      this.renderer.onEvent(e, now, youId);
      recordEvent(e, youId);
      this.react(e, youId);
    }
    this.camera.update(deltaMs);
    this.fx.update(
      now,
      { w: view.x, h: view.y },
      this.youEffects,
      useNet.getState().offline !== null,
    );

    const state = this.session.state();
    if (stepped && state) publishHud(state, youId);
  }

  /** Sound and screen feedback for things that just happened. */
  private react(e: GameEvent, youId: string | null): void {
    const mine = 'by' in e && e.by === youId;
    switch (e.type) {
      case 'shot':
        play(e.weapon, { volume: mine ? 0.55 : 0.25 });
        if (mine && e.weapon === 'shotgun') this.camera.shake(0.15);
        break;
      case 'hit':
        if (e.target === youId) {
          play('hurt');
          this.camera.shake(0.4);
          this.fx.flash();
        } else if (mine) {
          play('hit');
        }
        break;
      case 'reload':
        if (mine) play('reload', { volume: 0.4 });
        break;
      case 'pickup':
        if (mine) play('pickup');
        break;
      case 'sabotage':
        play('sabotage', { volume: e.target === youId ? 0.6 : 0.35 });
        if (e.target === youId) this.camera.shake(0.25);
        break;
      case 'roundStart':
        play('roundStart', { volume: 0.4 });
        break;
      case 'roundEnd':
        play('roundEnd', { volume: 0.4 });
        break;
      default:
        break;
    }
  }

  destroy(): void {
    this.input.dispose();
    this.session.dispose();
    this.app.destroy(true, { children: true, texture: true });
  }
}
