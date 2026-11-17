import {
  ARENA,
  type ArenaMap,
  addPlayer,
  createMatch,
  type GameEvent,
  lerpAngle,
  lerpVec,
  type MatchState,
  type PlayerInput,
  stepMatch,
  type Vec2,
} from '@lag-switch/core';
import type { GameSession, RenderFrame } from './session';

/**
 * Runs the whole simulation in the browser against a dummy that never moves.
 * No network at all: it exists to prove the shared `core` simulation works on
 * its own, and it is handy for tuning weapons.
 */
export class LocalSession implements GameSession {
  readonly map: ArenaMap = ARENA;
  private readonly match: MatchState;
  private prevPos = new Map<string, { pos: Vec2; aim: number }>();
  private events: GameEvent[] = [];

  constructor(name: string) {
    this.match = createMatch(this.map);
    addPlayer(this.match, this.map, 'you', name);
    addPlayer(this.match, this.map, 'dummy', 'practice dummy');
  }

  youId() {
    return 'you';
  }

  step(input: PlayerInput): void {
    this.prevPos = new Map(
      this.match.players.map((p) => [p.id, { pos: { ...p.pos }, aim: p.aim }]),
    );
    const events = stepMatch(this.match, new Map([['you', [input]]]), { map: this.map });
    this.events.push(...events);
  }

  frame(alpha: number): RenderFrame {
    return {
      players: this.match.players.map((p) => {
        const prev = this.prevPos.get(p.id);
        return {
          id: p.id,
          name: p.name,
          pos: prev ? lerpVec(prev.pos, p.pos, alpha) : p.pos,
          aim: prev ? lerpAngle(prev.aim, p.aim, alpha) : p.aim,
          hp: p.hp,
          weapon: p.weapon,
          isYou: p.id === 'you',
          connected: true,
          effects: p.activeEffects.map((e) => e.id),
        };
      }),
      pickups: this.match.pickups,
    };
  }

  state(): MatchState {
    return this.match;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  dispose(): void {}
}
