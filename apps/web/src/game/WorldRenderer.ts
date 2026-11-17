import { type GameEvent, PLAYER, type SabotageId } from '@lag-switch/core';
import { Container, type Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { drawRough, gen } from './art/rough';
import { type Sketchbook, VARIANTS } from './art/Sketchbook';
import { InkParticles } from './fx/Particles';
import { PALETTE } from './palette';
import type { RenderFrame } from './session';

/** The hand-drawn lines "boil" at this rate (frames of a flip book). */
const BOIL_MS = 125;
const TRACER_MS = 120;
const MUZZLE_MS = 70;

const PICKUP_LABEL: Record<SabotageId, string> = {
  lagSpike: 'lag spike',
  packetLoss: 'packet loss',
  wifiReset: 'wi-fi reset',
  deadBattery: 'dead battery',
};

/** A sprite that flips between the variants of one drawing. */
class Boiling extends Sprite {
  constructor(
    private readonly frames: Texture[],
    private readonly phase = Math.floor(Math.random() * VARIANTS),
  ) {
    super(frames[0]);
    this.anchor.set(0.5);
  }

  boil(tick: number): void {
    this.texture = this.frames[(tick + this.phase) % this.frames.length] as Texture;
  }
}

interface PlayerView {
  root: Container;
  body: Boiling;
  gun: Boiling;
  muzzle: Boiling;
  muzzleUntil: number;
  controller: Boiling;
  hurtUntil: number;
}

/**
 * Draws one frame of the arena from pre-baked Rough.js textures: nothing here
 * calls Rough.js per frame except the one-off tracer of a shot.
 */
export class WorldRenderer {
  readonly root = new Container();
  private readonly arena: Boiling;
  private readonly pickupLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly ink = new InkParticles();
  private readonly players = new Map<string, PlayerView>();
  private readonly pickups = new Map<string, { root: Container; icon: Boiling }>();
  private tracers: { g: Graphics; born: number }[] = [];
  private lastNow = performance.now();

  constructor(private readonly art: Sketchbook) {
    this.arena = new Boiling(art.arena, 0);
    this.arena.anchor.set(0);
    this.arena.position.set(-12, -12); // the arena texture has a 12 px margin
    this.root.addChild(this.arena, this.ink.root, this.pickupLayer, this.playerLayer, this.fxLayer);
  }

  render(frame: RenderFrame, now: number): void {
    const dt = Math.min(100, now - this.lastNow);
    this.lastNow = now;
    const tick = Math.floor(now / BOIL_MS);
    this.arena.boil(tick);

    // --- pickups ---
    for (const pk of frame.pickups) {
      let view = this.pickups.get(pk.id);
      if (!view) {
        const root = new Container();
        const icon = new Boiling(this.art.pickup[pk.kind]);
        const label = new Text({
          text: PICKUP_LABEL[pk.kind],
          style: { fontFamily: 'Caveat', fontWeight: '700', fontSize: 22, fill: PALETTE.ink },
          resolution: 2,
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, 26);
        label.alpha = 0.85;
        root.addChild(icon, label);
        root.position.set(pk.pos.x, pk.pos.y);
        this.pickupLayer.addChild(root);
        view = { root, icon };
        this.pickups.set(pk.id, view);
      }
      view.root.visible = pk.respawnAt === null;
      view.icon.boil(tick);
      // a slow bob so pickups read as "grab me"
      view.icon.y = Math.sin(now / 320 + pk.pos.x) * 2;
    }

    // --- players ---
    const seen = new Set<string>();
    for (const p of frame.players) {
      seen.add(p.id);
      const v = this.players.get(p.id) ?? this.createPlayer(p.id, p.isYou);
      v.root.position.set(p.pos.x, p.pos.y);
      v.root.visible = p.hp > 0;
      v.root.alpha = p.connected ? 1 : 0.35;
      v.gun.rotation = p.aim;
      v.muzzle.rotation = p.aim;
      v.body.boil(tick);
      v.gun.boil(tick);
      v.muzzle.boil(tick);
      v.muzzle.visible = now < v.muzzleUntil;
      v.body.alpha = now < v.hurtUntil ? 0.55 + 0.45 * Math.sin(now / 20) ** 2 : 1;
      // Dead battery: a controller blinking over the player's head.
      const dead = p.effects.includes('deadBattery');
      v.controller.visible = dead && Math.floor(now / 250) % 2 === 0;
      v.controller.boil(tick);
    }
    for (const [id, v] of this.players) {
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.players.delete(id);
      }
    }

    // --- effects ---
    this.ink.update(dt);
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
  onEvent(e: GameEvent, now: number, youId: string | null): void {
    switch (e.type) {
      case 'shot': {
        // A pencil stroke per pellet, gone in 120 ms.
        const g = drawRough(
          e.to.map((end, i) =>
            gen.line(e.from.x, e.from.y, end.x, end.y, {
              stroke: e.weapon === 'shotgun' ? '#FFE066' : '#EDE6D6',
              strokeWidth: e.weapon === 'shotgun' ? 1.6 : 2.2,
              roughness: 0.6,
              bowing: 0.4,
              seed: ((Math.floor(now) + i) % 100000) + 1,
            }),
          ),
        );
        this.fxLayer.addChild(g);
        this.tracers.push({ g, born: now });
        const shooter = this.players.get(e.by);
        if (shooter) shooter.muzzleUntil = now + MUZZLE_MS;
        break;
      }
      case 'hit': {
        const target = this.players.get(e.target);
        if (target) target.hurtUntil = now + 140;
        const angle = Math.atan2(
          e.pos.y - (target?.root.y ?? e.pos.y),
          e.pos.x - (target?.root.x ?? e.pos.x),
        );
        const color = e.target === youId ? 'you' : 'rival';
        this.ink.splash(e.pos.x, e.pos.y, angle + Math.PI, this.art.splat[color], 5);
        break;
      }
      case 'kill': {
        const target = this.players.get(e.target);
        if (target) {
          const color = e.target === youId ? 'you' : 'rival';
          this.ink.splash(target.root.x, target.root.y, 0, this.art.splat[color], 16, 420);
          this.ink.splash(target.root.x, target.root.y, Math.PI, this.art.splat.ink, 6, 300);
        }
        break;
      }
      case 'roundStart':
        this.ink.clear();
        break;
      default:
        break;
    }
  }

  private createPlayer(id: string, isYou: boolean): PlayerView {
    const root = new Container();
    const gun = new Boiling(this.art.gun);
    gun.anchor.set(4 / (PLAYER.radius + 20), 0.5); // pivot at the body's centre
    const muzzle = new Boiling(this.art.muzzle);
    // The scribble's texture starts 2 px before its origin; put that origin at the gun tip.
    muzzle.anchor.set((2 - (PLAYER.radius + 14)) / 26, 0.5);
    muzzle.visible = false;
    const body = new Boiling(isYou ? this.art.body.you : this.art.body.rival);
    const controller = new Boiling(this.art.controller);
    controller.position.set(0, -PLAYER.radius - 18);
    controller.visible = false;
    root.addChild(gun, muzzle, body, controller);
    this.playerLayer.addChild(root);
    const view: PlayerView = { root, body, gun, muzzle, muzzleUntil: 0, controller, hurtUntil: 0 };
    this.players.set(id, view);
    return view;
  }
}
