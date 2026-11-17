import {
  type ArenaMap,
  distance,
  hasLineOfSight,
  type MatchState,
  type PlayerInput,
  type PlayerState,
  type Vec2,
  WEAPONS,
  wrapAngle,
} from '@lag-switch/core';
import type { NavGrid } from './nav.js';

export interface BotSkill {
  /** Standard deviation of the aim error, in radians. 0 = aimbot. */
  aimErrorRad: number;
  /** How long the bot needs to see you before it starts shooting. */
  reactionMs: number;
  /** Chance per second of firing a sabotage without seeing you. */
  sabotageEagerness: number;
}

export const DEFAULT_SKILL: BotSkill = {
  aimErrorRad: 0.11,
  reactionMs: 280,
  sabotageEagerness: 0.15,
};

type Mode = 'hunt' | 'fight' | 'retreat' | 'grab';
type Intent = Omit<PlayerInput, 'seq'>;

/** Small seeded PRNG (mulberry32): reproducible bots in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Decides what the bot presses, from what it can see: the last snapshot it
 * received (possibly late or missing, if it is being sabotaged). It never
 * reads the server's live state, so it is exactly as handicapped by bad
 * networking as a human would be.
 *
 * Behaviour, in plain words:
 * - hunt:    no line of sight → walk to a spot that has one (or grab a pickup)
 * - fight:   line of sight → strafe, keep a comfortable range, shoot after a
 *            reaction delay with a drifting aim error
 * - retreat: low on health or ammo → break line of sight, reload
 */
export class BotBrain {
  private mode: Mode = 'hunt';
  private path: Vec2[] = [];
  private repathAt = 0;
  private modeUntil = 0;
  private seenSince: number | null = null;
  private strafeDir = 1;
  private strafeUntil = 0;
  private aimOffset = 0;
  private aimOffsetUntil = 0;
  private lastPos: Vec2 | null = null;
  private stuckTicks = 0;
  private readonly spots: Vec2[];

  constructor(
    private readonly map: ArenaMap,
    private readonly nav: NavGrid,
    private readonly rng: () => number,
    private readonly skill: BotSkill = DEFAULT_SKILL,
  ) {
    this.spots = nav.freeCells();
  }

  get currentMode(): Mode {
    return this.mode;
  }

  decide(s: MatchState, me: PlayerState, rival: PlayerState | undefined): Intent {
    const now = s.time;
    const idle: Intent = {
      move: { x: 0, y: 0 },
      aim: rival ? angleTo(me.pos, rival.pos) : me.aim,
      shoot: false,
      reload: false,
      switchWeapon: false,
      useSabotage: false,
    };
    if (s.phase !== 'playing' || !rival || me.hp <= 0) {
      this.path = [];
      this.seenSince = null;
      return { ...idle, reload: me.ammo[me.weapon] < WEAPONS[me.weapon].magazine };
    }

    const walls = this.map.walls;
    const los = rival.hp > 0 && hasLineOfSight(me.pos, rival.pos, walls);
    const dist = distance(me.pos, rival.pos);
    this.seenSince = los ? (this.seenSince ?? now) : null;
    this.trackStuck(me);

    // --- choose a mode ---
    const lowHp = me.hp <= 30 && rival.hp > me.hp;
    const empty = me.ammo[me.weapon] === 0;
    if (this.mode !== 'retreat' && los && (lowHp || empty)) this.enter('retreat', now, 2200);
    else if (this.mode === 'retreat' && now > this.modeUntil) this.enter('hunt', now);
    else if (this.mode !== 'retreat') {
      const pickup = !me.sabotageSlot && !los ? this.nearestPickup(s, me) : null;
      if (los) this.mode = 'fight';
      else if (pickup) this.mode = 'grab';
      else this.mode = 'hunt';
    }

    const intent: Intent = { ...idle };

    // --- weapon: shotgun up close, pistol at range (with hysteresis) ---
    const wantShotgun = me.weapon === 'shotgun' ? dist < 240 : dist < 170;
    if (wantShotgun !== (me.weapon === 'shotgun') && me.reloadMsLeft === 0) {
      intent.switchWeapon = true;
    }

    // --- sabotage: when the rival is in sight, or now and then ---
    if (me.sabotageSlot && (los || this.rng() < this.skill.sabotageEagerness / 30)) {
      intent.useSabotage = true;
    }

    switch (this.mode) {
      case 'fight': {
        this.path = [];
        intent.aim = this.aimAt(me.pos, rival.pos, now);
        const reacted = this.seenSince !== null && now - this.seenSince >= this.skill.reactionMs;
        intent.shoot = reacted && me.reloadMsLeft === 0 && !intent.switchWeapon;
        intent.move = this.strafe(me, rival, dist, now);
        break;
      }
      case 'retreat': {
        if (now >= this.repathAt || this.path.length === 0) {
          this.planTo(me.pos, this.pickSpot(me, rival, false), now);
        }
        intent.move = this.follow(me.pos);
        intent.aim = los ? angleTo(me.pos, rival.pos) : this.travelAim(me);
        intent.reload = me.ammo[me.weapon] < WEAPONS[me.weapon].magazine;
        break;
      }
      case 'grab': {
        const pickup = this.nearestPickup(s, me);
        if (pickup && (now >= this.repathAt || this.path.length === 0)) {
          this.planTo(me.pos, pickup, now);
        }
        intent.move = this.follow(me.pos);
        intent.aim = this.travelAim(me);
        break;
      }
      case 'hunt': {
        if (now >= this.repathAt || this.path.length === 0) {
          this.planTo(me.pos, this.pickSpot(me, rival, true), now);
        }
        intent.move = this.follow(me.pos);
        intent.aim = angleTo(me.pos, rival.pos);
        // Top up the magazine while walking around.
        intent.reload = me.ammo[me.weapon] <= WEAPONS[me.weapon].magazine / 2;
        break;
      }
    }

    if (this.stuckTicks > 20) {
      // Wedged against something: wander to a random nearby free spot.
      const spot = this.spots[Math.floor(this.rng() * this.spots.length)];
      if (spot) this.planTo(me.pos, spot, now);
      this.strafeDir *= -1;
      this.stuckTicks = 0;
    }
    return intent;
  }

  // ------------------------------------------------------------- helpers

  private enter(mode: Mode, now: number, forMs = 0): void {
    this.mode = mode;
    this.modeUntil = now + forMs;
    this.path = [];
    this.repathAt = 0;
  }

  /** Aim with a human-ish error that drifts every ~400 ms. */
  private aimAt(from: Vec2, target: Vec2, now: number): number {
    if (now >= this.aimOffsetUntil) {
      this.aimOffset = gaussian(this.rng) * this.skill.aimErrorRad;
      this.aimOffsetUntil = now + 300 + this.rng() * 300;
    }
    return wrapAngle(angleTo(from, target) + this.aimOffset);
  }

  /** Side-steps around the rival while drifting to a comfortable range. */
  private strafe(me: PlayerState, rival: PlayerState, dist: number, now: number): Vec2 {
    if (now >= this.strafeUntil) {
      this.strafeDir = this.rng() < 0.5 ? -1 : 1;
      this.strafeUntil = now + 500 + this.rng() * 700;
    }
    const to = angleTo(me.pos, rival.pos);
    const ideal = me.weapon === 'shotgun' ? 110 : 320;
    const radial = dist > ideal + 60 ? 0.6 : dist < ideal - 60 ? -0.6 : 0;
    const side = to + (Math.PI / 2) * this.strafeDir;
    const x = Math.cos(side) + Math.cos(to) * radial;
    const y = Math.sin(side) + Math.sin(to) * radial;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  /**
   * Scores a sample of free spots. `exposed` = we want line of sight to the
   * rival at a decent range (to attack); otherwise we want cover from them.
   */
  private pickSpot(me: PlayerState, rival: PlayerState, exposed: boolean): Vec2 {
    let best: Vec2 = me.pos;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 160; i++) {
      const p = this.spots[Math.floor(this.rng() * this.spots.length)];
      if (!p) continue;
      const toRival = distance(p, rival.pos);
      const sees = hasLineOfSight(p, rival.pos, this.map.walls);
      if (exposed && (!sees || toRival < 140 || toRival > 520)) continue;
      if (!exposed && (sees || toRival < 220)) continue;
      const score = distance(p, me.pos) + (exposed ? Math.abs(toRival - 320) * 0.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private nearestPickup(s: MatchState, me: PlayerState): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = 520;
    for (const pk of s.pickups) {
      if (pk.respawnAt !== null) continue;
      const d = distance(pk.pos, me.pos);
      if (d < bestD) {
        bestD = d;
        best = pk.pos;
      }
    }
    return best;
  }

  private planTo(from: Vec2, to: Vec2, now: number): void {
    this.path = this.nav.findPath(from, to) ?? [];
    this.repathAt = now + 500;
  }

  private follow(pos: Vec2): Vec2 {
    while (this.path.length > 0 && distance(pos, this.path[0] as Vec2) < 12) this.path.shift();
    const next = this.path[0];
    if (!next) return { x: 0, y: 0 };
    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  private travelAim(me: PlayerState): number {
    const next = this.path[0];
    return next ? angleTo(me.pos, next) : me.aim;
  }

  private trackStuck(me: PlayerState): void {
    if (this.lastPos && distance(this.lastPos, me.pos) < 0.5 && this.path.length > 0) {
      this.stuckTicks++;
    } else {
      this.stuckTicks = 0;
    }
    this.lastPos = { ...me.pos };
  }
}

const angleTo = (from: Vec2, to: Vec2) => Math.atan2(to.y - from.y, to.x - from.x);

/** Standard normal sample (Box–Muller). */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
