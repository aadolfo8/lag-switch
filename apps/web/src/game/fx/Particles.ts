import { Container, Sprite, type Texture } from 'pixi.js';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  maxLife: number;
  /** Stays on the floor afterwards (ink stains) instead of fading out fully. */
  stain: boolean;
}

/**
 * Ink splatter. A fixed pool of sprites (no allocation while playing): a hit
 * throws a handful of blobs in the shot's direction; they slow down, shrink a
 * little and leave faint stains on the paper that fade over a few seconds.
 */
export class InkParticles {
  readonly root = new Container();
  private readonly pool: Particle[] = [];
  private next = 0;

  constructor(size = 160) {
    for (let i = 0; i < size; i++) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.root.addChild(sprite);
      this.pool.push({ sprite, vx: 0, vy: 0, spin: 0, life: 0, maxLife: 1, stain: false });
    }
  }

  /** Splashes `count` blobs at (x, y), mostly along `angle`. */
  splash(x: number, y: number, angle: number, textures: Texture[], count = 7, speed = 260): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.next] as Particle;
      this.next = (this.next + 1) % this.pool.length;
      const a = angle + (Math.random() - 0.5) * 1.6;
      const v = speed * (0.35 + Math.random() * 0.75);
      p.sprite.texture = textures[Math.floor(Math.random() * textures.length)] as Texture;
      p.sprite.position.set(x, y);
      p.sprite.rotation = Math.random() * Math.PI * 2;
      p.sprite.scale.set(0.4 + Math.random() * 0.7);
      p.sprite.alpha = 1;
      p.sprite.visible = true;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.spin = (Math.random() - 0.5) * 8;
      p.stain = i < 3; // the first few stay as stains
      p.maxLife = p.stain ? 4 : 0.35 + Math.random() * 0.25;
      p.life = p.maxLife;
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const drag = Math.exp(-dt * 9);
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vx *= drag;
      p.vy *= drag;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt * (Math.abs(p.vx) + Math.abs(p.vy) > 10 ? 1 : 0);
      const k = p.life / p.maxLife;
      p.sprite.alpha = p.stain ? Math.min(0.55, k * 1.5) : k;
    }
  }

  clear(): void {
    for (const p of this.pool) p.sprite.visible = false;
  }
}
