import { type ArenaMap, type GameEvent, PICKUPS, PLAYER } from '@lag-switch/core';
import { Container, Graphics } from 'pixi.js';
import { PALETTE } from './palette';
import type { RenderFrame } from './session';

const TRACER_MS = 120;

interface Tracer {
  g: Graphics;
  born: number;
}

interface PlayerView {
  root: Container;
  body: Graphics;
  gun: Graphics;
}

/**
 * Draws the arena with plain Pixi shapes. The hand-drawn Rough.js look
 * replaces these shapes later without touching the game logic.
 */
export class WorldRenderer {
  readonly root = new Container();
  private readonly floor = new Graphics();
  private readonly pickupLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly players = new Map<string, PlayerView>();
  private readonly pickups = new Map<string, Graphics>();
  private tracers: Tracer[] = [];

  constructor(private readonly map: ArenaMap) {
    this.root.addChild(this.floor, this.pickupLayer, this.playerLayer, this.fxLayer);
    this.drawArena();
  }

  private drawArena(): void {
    const { size, walls } = this.map;
    const g = this.floor;
    g.rect(0, 0, size.x, size.y).stroke({ width: 3, color: PALETTE.ink });
    for (const w of walls) {
      // Outer walls sit outside the arena; only draw the inner cover.
      if (w.max.x <= 0 || w.max.y <= 0 || w.min.x >= size.x || w.min.y >= size.y) continue;
      g.rect(w.min.x, w.min.y, w.max.x - w.min.x, w.max.y - w.min.y)
        .fill(PALETTE.wall)
        .stroke({ width: 2, color: PALETTE.ink });
    }
  }

  render(frame: RenderFrame, now: number): void {
    // pickups
    for (const pk of frame.pickups) {
      let g = this.pickups.get(pk.id);
      if (!g) {
        g = new Graphics()
          .circle(0, 0, PICKUPS.radius)
          .stroke({ width: 2, color: PALETTE.inkMuted })
          .rect(-10, -6, 20, 12)
          .stroke({ width: 2, color: PALETTE.highlight });
        g.position.set(pk.pos.x, pk.pos.y);
        this.pickupLayer.addChild(g);
        this.pickups.set(pk.id, g);
      }
      g.visible = pk.respawnAt === null;
    }

    // players
    const seen = new Set<string>();
    for (const p of frame.players) {
      seen.add(p.id);
      const view = this.players.get(p.id) ?? this.createPlayer(p.id, p.isYou);
      view.root.position.set(p.pos.x, p.pos.y);
      view.gun.rotation = p.aim;
      view.root.visible = p.hp > 0;
      view.root.alpha = p.connected ? 1 : 0.4;
    }
    for (const [id, view] of this.players) {
      if (!seen.has(id)) {
        view.root.destroy({ children: true });
        this.players.delete(id);
      }
    }

    // tracers fade out over TRACER_MS
    this.tracers = this.tracers.filter((t) => {
      const age = now - t.born;
      if (age >= TRACER_MS) {
        t.g.destroy();
        return false;
      }
      t.g.alpha = 1 - age / TRACER_MS;
      return true;
    });
  }

  /** Visual reaction to gameplay events. */
  onEvent(e: GameEvent, now: number): void {
    if (e.type === 'shot') {
      const g = new Graphics();
      for (const end of e.to) {
        g.moveTo(e.from.x, e.from.y).lineTo(end.x, end.y);
      }
      g.stroke({ width: 2, color: PALETTE.highlight });
      this.fxLayer.addChild(g);
      this.tracers.push({ g, born: now });
    }
  }

  private createPlayer(id: string, isYou: boolean): PlayerView {
    const color = isYou ? PALETTE.you : PALETTE.rival;
    const root = new Container();
    const gun = new Graphics()
      .moveTo(PLAYER.radius - 4, 0)
      .lineTo(PLAYER.radius + 12, 0)
      .stroke({ width: 6, color: PALETTE.ink, cap: 'round' });
    const body = new Graphics()
      .circle(0, 0, PLAYER.radius)
      .fill(color)
      .stroke({ width: 2.5, color: PALETTE.ink });
    root.addChild(gun, body);
    this.playerLayer.addChild(root);
    const view = { root, body, gun };
    this.players.set(id, view);
    return view;
  }
}
