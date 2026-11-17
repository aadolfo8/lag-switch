/**
 * The game's data model. Everything here is plain, JSON-serialisable data:
 * the server sends it as-is in snapshots and the client feeds it straight back
 * into the same simulation functions for prediction.
 */

export type Vec2 = { x: number; y: number };
export type WeaponId = 'pistol' | 'shotgun';
export type SabotageId = 'lagSpike' | 'packetLoss' | 'wifiReset' | 'deadBattery';
export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'roundEnd' | 'matchEnd';

export interface ActiveEffect {
  id: SabotageId;
  /** Match time (ms) at which the effect wears off. */
  until: number;
}

export interface PlayerState {
  id: string;
  name: string;
  pos: Vec2;
  vel: Vec2;
  /** Aim angle in radians, 0 = +x, growing clockwise (screen space, y down). */
  aim: number;
  hp: number;
  weapon: WeaponId;
  /**
   * Rounds left in each weapon's magazine. Each weapon keeps its own count, so
   * switching with Q never refills or empties anything.
   */
  ammo: Record<WeaponId, number>;
  /**
   * Weapon timers count down per simulated input step, not against a wall
   * clock. That is what makes them predictable: when the client replays its
   * pending inputs during reconciliation, reload and cooldown progress exactly
   * as they did on the server. 0 means "not reloading" / "ready to fire".
   */
  reloadMsLeft: number;
  cooldownMsLeft: number;
  sabotageSlot: SabotageId | null;
  activeEffects: ActiveEffect[];
  /** False while the player's socket is gone (Wi-Fi reset, closed tab…). */
  connected: boolean;
}

export interface Pickup {
  id: string;
  kind: SabotageId;
  pos: Vec2;
  /** Match time (ms) at which a taken pickup comes back; null while available. */
  respawnAt: number | null;
}

export interface Wall {
  min: Vec2;
  max: Vec2;
}

export interface ArenaMap {
  size: Vec2;
  walls: Wall[];
  spawns: Vec2[];
  pickupSpots: { pos: Vec2; kind: SabotageId }[];
}

export interface MatchState {
  tick: number;
  /** Match clock in ms. Always `tick * tickMs`; stored so clients don't need the formula. */
  time: number;
  phase: MatchPhase;
  /** Match time (ms) at which the current phase ends; null when it has no timer. */
  phaseEndsAt: number | null;
  round: number;
  scores: Record<string, number>;
  players: PlayerState[];
  pickups: Pickup[];
  /** Winner of the last finished round (null on a draw) and of the match. */
  lastRoundWinner: string | null;
  matchWinner: string | null;
}

/**
 * One fixed simulation step worth of player intent. The client produces one
 * per tick (30 Hz) and tags it with an increasing `seq`, which the server
 * echoes back as `lastProcessedSeq` for reconciliation.
 */
export interface PlayerInput {
  seq: number;
  /** Desired direction; length is clamped to 1. */
  move: Vec2;
  aim: number;
  /** Trigger held. Pistol and shotgun are semi-auto-ish: held = fire on cooldown. */
  shoot: boolean;
  reload: boolean;
  switchWeapon: boolean;
  useSabotage: boolean;
}

/**
 * Things that happened during a tick. They are cosmetic (tracers, ink splats,
 * sounds): every gameplay fact is also in the state, so a lost snapshot never
 * desyncs the game, it only loses a visual.
 */
export type GameEvent =
  | { type: 'shot'; by: string; weapon: WeaponId; from: Vec2; to: Vec2[] }
  | { type: 'hit'; by: string; target: string; damage: number; pos: Vec2 }
  | { type: 'kill'; by: string; target: string }
  | { type: 'reload'; by: string }
  | { type: 'pickup'; by: string; kind: SabotageId }
  | { type: 'sabotage'; by: string; target: string; kind: SabotageId; durationMs: number }
  | { type: 'roundStart'; round: number }
  | {
      type: 'roundEnd';
      round: number;
      winner: string | null;
      reason: 'kill' | 'timeout' | 'forfeit';
    }
  | { type: 'matchEnd'; winner: string | null };
