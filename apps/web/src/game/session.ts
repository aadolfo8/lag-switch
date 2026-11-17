import type {
  ArenaMap,
  GameEvent,
  MatchState,
  Pickup,
  PlayerInput,
  SabotageId,
  Vec2,
  WeaponId,
} from '@lag-switch/core';

/** What the renderer needs for one player in one frame. */
export interface RenderPlayer {
  id: string;
  name: string;
  pos: Vec2;
  aim: number;
  hp: number;
  weapon: WeaponId;
  isYou: boolean;
  connected: boolean;
  effects: SabotageId[];
}

export interface RenderFrame {
  players: RenderPlayer[];
  pickups: Pickup[];
}

/**
 * Where the game state comes from. The canvas, input and HUD don't care
 * whether it is a local simulation (LocalSession) or an authoritative server
 * reached over a WebSocket (NetSession).
 */
export interface GameSession {
  readonly map: ArenaMap;
  /** Id of the local player, once known. */
  youId(): string | null;
  /** Called once per fixed 30 Hz step with the local player's input. */
  step(input: PlayerInput): void;
  /**
   * State to draw this frame. `alpha` is how far we are between the last
   * step and the next one (0..1), used to smooth 30 Hz motion at 60+ fps.
   */
  frame(alpha: number, nowMs: number): RenderFrame | null;
  /** Latest authoritative-ish state, for the HUD. */
  state(): MatchState | null;
  /** Events that happened since the last call (shots, hits, pickups…). */
  drainEvents(): GameEvent[];
  dispose(): void;
}
