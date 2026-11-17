import { randomBytes } from 'node:crypto';
import {
  ARENA,
  type ArenaMap,
  addPlayer,
  type ClientMessage,
  createMatch,
  endRound,
  type GameEvent,
  type MatchState,
  NET,
  opponentOf,
  type PlayerInput,
  type PlayerState,
  PositionHistory,
  removePlayer,
  resetMatch,
  rewindMsFor,
  type ServerMessage,
  type ShotTarget,
  stepMatch,
} from '@lag-switch/core';
import { NetworkConditioner } from '../net/NetworkConditioner.js';
import { CloseCode, type Peer } from './peer.js';

/**
 * Input budget (anti speed-hack). Each tick a player earns slightly more than
 * one input's worth of budget and each applied input spends one. A client
 * that sends inputs faster than 30 Hz can't move faster than everybody else:
 * extra inputs just wait in the queue. The 5 % slack absorbs clock drift
 * between the browser's frame loop and our timer, so honest clients never
 * build up a backlog (which would show up as growing input latency).
 */
const BUDGET_PER_TICK = 1.05;
/** Max inputs applied in one tick after a burst (e.g. a stalled tab catching up). */
const MAX_BUDGET = 8;
/** Inputs waiting beyond this are dropped, oldest first. */
const MAX_QUEUE = 32;
/** No message at all for this long means the connection is dead. */
const SILENCE_TIMEOUT_MS = 5000;

export interface Seat {
  playerId: string;
  name: string;
  reconnectToken: string;
  peer: Peer | null;
  /** Inputs received but not applied yet, sorted by seq. */
  queue: PlayerInput[];
  /** Highest seq applied; echoed in every snapshot for reconciliation. */
  lastProcessedSeq: number;
  budget: number;
  /** Total inputs applied (stats and tests). */
  inputsApplied: number;
  /** Events accumulated since the last snapshot sent to this seat. */
  pendingEvents: GameEvent[];
  /** Smoothed round-trip time reported by the client (ms). */
  rtt: number;
  lastHeardAt: number;
  disconnectedAt: number | null;
  isBot: boolean;
  /**
   * How far in the past this client draws the rival (its interpolation
   * delay). Humans: NET.interpolationDelayMs. The bot reads the latest
   * snapshot directly, so 0. Used by lag compensation.
   */
  viewDelayMs: number;
  /** Every message to and from this player goes through here. */
  conditioner: NetworkConditioner<ClientMessage>;
}

export interface JoinOptions {
  reconnectToken?: string;
  isBot?: boolean;
  /** Simulated round-trip latency for testing (?lag=150): half each way. */
  lagMs?: number;
}

export type JoinResult =
  | { ok: true; seat: Seat; resumed: boolean }
  | { ok: false; code: 'room_full' };

export interface RoomOptions {
  code: string;
  map?: ArenaMap;
  /** Injected clock (ms) so tests can fast-forward. */
  now?: () => number;
}

/**
 * One match between two seats. Plain TypeScript, no Nest: the gateway feeds
 * it messages, the registry calls `tick()` 30 times a second.
 */
export class Room {
  readonly code: string;
  readonly map: ArenaMap;
  readonly state: MatchState;
  private readonly seats = new Map<string, Seat>();
  private readonly now: () => number;
  private rematchVotes = new Set<string>();
  /** One second of positions, for lag-compensated hit detection. */
  private readonly history = new PositionHistory();
  /** Last time at least one human was connected; drives room expiry. */
  lastOccupiedAt: number;

  constructor(opts: RoomOptions) {
    this.code = opts.code;
    this.map = opts.map ?? ARENA;
    this.now = opts.now ?? Date.now;
    this.state = createMatch(this.map);
    this.lastOccupiedAt = this.now();
  }

  // ------------------------------------------------------------------ seats

  /**
   * Seats a peer. With a valid reconnect token it takes back its old seat
   * (same player, same score) instead of becoming a new player.
   */
  join(peer: Peer, name: string, opts: JoinOptions = {}): JoinResult {
    const { reconnectToken, isBot = false, lagMs } = opts;
    const existing = reconnectToken
      ? [...this.seats.values()].find((s) => s.reconnectToken === reconnectToken)
      : undefined;

    if (existing) {
      existing.peer?.close(CloseCode.replaced, 'replaced by a newer connection');
      // Whatever was in flight was addressed to the old socket.
      existing.conditioner.inbound.clear();
      existing.conditioner.outbound.clear();
      existing.peer = peer;
      existing.disconnectedAt = null;
      existing.lastHeardAt = this.now();
      // Inputs from before the drop are stale; the client starts a new seq run
      // above lastProcessedSeq, which it learns from the next snapshot.
      existing.queue = [];
      this.player(existing.playerId).connected = true;
      this.welcome(existing, true);
      return { ok: true, seat: existing, resumed: true };
    }

    if (this.seats.size >= 2) return { ok: false, code: 'room_full' };

    const seat: Seat = {
      playerId: randomBytes(4).toString('hex'),
      name,
      reconnectToken: randomBytes(16).toString('hex'),
      peer,
      queue: [],
      lastProcessedSeq: 0,
      budget: MAX_BUDGET,
      inputsApplied: 0,
      pendingEvents: [],
      rtt: 0,
      lastHeardAt: this.now(),
      disconnectedAt: null,
      isBot,
      viewDelayMs: isBot ? 0 : NET.interpolationDelayMs,
      conditioner: new NetworkConditioner<ClientMessage>(),
    };
    if (lagMs) seat.conditioner.setBase({ delayMs: lagMs / 2 });
    this.seats.set(seat.playerId, seat);
    this.broadcastEvents(addPlayer(this.state, this.map, seat.playerId, name));
    this.welcome(seat, false);
    return { ok: true, seat, resumed: false };
  }

  /** The socket went away. The seat is kept for NET.reconnectGraceMs. */
  disconnect(playerId: string, peer: Peer): void {
    const seat = this.seats.get(playerId);
    // A stale socket closing after its seat was taken over must not kick the new one.
    if (!seat || seat.peer !== peer) return;
    seat.peer = null;
    seat.disconnectedAt = this.now();
    this.player(playerId).connected = false;
  }

  get humanCount(): number {
    return [...this.seats.values()].filter((s) => !s.isBot && s.peer).length;
  }

  get isFull(): boolean {
    return this.seats.size >= 2;
  }

  seat(playerId: string): Seat | undefined {
    return this.seats.get(playerId);
  }

  // --------------------------------------------------------------- messages

  /**
   * A validated message arrived from a player's socket. It goes through that
   * player's network conditioner first (it may be delayed or lost there).
   */
  receive(playerId: string, msg: ClientMessage): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    seat.conditioner.inbound.push(msg, (m) => this.handle(seat, m));
  }

  private handle(seat: Seat, msg: ClientMessage): void {
    const playerId = seat.playerId;
    seat.lastHeardAt = this.now();

    switch (msg.type) {
      case 'input':
        for (const input of msg.inputs) this.enqueue(seat, input);
        break;
      case 'ping':
        if (msg.rtt !== undefined) {
          // Exponential smoothing: one slow ping shouldn't swing lag compensation.
          seat.rtt = seat.rtt === 0 ? msg.rtt : seat.rtt * 0.8 + msg.rtt * 0.2;
        }
        this.send(seat, { type: 'pong', t: msg.t, serverTime: this.state.time });
        break;
      case 'rematch':
        if (this.state.phase !== 'matchEnd') break;
        this.rematchVotes.add(playerId);
        if (this.rematchVotes.size >= 2 || this.allOthersAreBots(playerId)) {
          this.rematchVotes.clear();
          this.broadcastEvents(resetMatch(this.state, this.map));
        }
        break;
      case 'join':
        this.send(seat, { type: 'error', code: 'already_joined' });
        break;
    }
  }

  /** Inserts an input in seq order, ignoring duplicates and already-applied ones. */
  private enqueue(seat: Seat, input: PlayerInput): void {
    if (input.seq <= seat.lastProcessedSeq) return; // redundant copy of an applied input
    const q = seat.queue;
    if (q.some((i) => i.seq === input.seq)) return; // redundant copy of a queued input
    const at = q.findIndex((i) => i.seq > input.seq);
    if (at === -1) q.push(input);
    else q.splice(at, 0, input);
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
  }

  // ------------------------------------------------------------------- tick

  /** One authoritative step. Called at NET.tickRate by the registry. */
  tick(): void {
    const now = this.now();
    this.handleConnectionTimeouts(now);

    // Pick this tick's inputs for every seat, within budget.
    const inputs = new Map<string, PlayerInput[]>();
    for (const seat of this.seats.values()) {
      seat.budget = Math.min(MAX_BUDGET, seat.budget + BUDGET_PER_TICK);
      const batch: PlayerInput[] = [];
      while (seat.queue.length > 0 && seat.budget >= 1) {
        const input = seat.queue.shift() as PlayerInput;
        batch.push(input);
        seat.lastProcessedSeq = input.seq;
        seat.budget -= 1;
        seat.inputsApplied += 1;
      }
      inputs.set(seat.playerId, batch);
    }

    const events = stepMatch(this.state, inputs, {
      map: this.map,
      rewindTargets: (shooter) => this.rewoundTargets(shooter),
    });
    this.broadcastEvents(events);
    this.history.record(this.state);

    if (this.humanCount > 0) this.lastOccupiedAt = now;
    if (isSnapshotTick(this.state.tick)) this.sendSnapshots();
  }

  /**
   * Lag compensation: where the OTHER players were at the moment this shooter
   * saw them (see PositionHistory). The shooter itself is never rewound.
   */
  private rewoundTargets(shooter: PlayerState): ShotTarget[] {
    const seat = this.seats.get(shooter.id);
    const rewind = seat ? rewindMsFor(seat.rtt, seat.viewDelayMs) : 0;
    const time = this.state.time - rewind;
    return this.state.players
      .filter((p) => p.id !== shooter.id && p.hp > 0)
      .map((p) => ({ id: p.id, pos: this.history.positionAt(p.id, time) ?? { ...p.pos } }));
  }

  private sendSnapshots(): void {
    // Serialise the state once; only seq and events differ per seat.
    const state = JSON.stringify(this.state);
    for (const seat of this.seats.values()) {
      if (!seat.peer) continue;
      const events = JSON.stringify(seat.pendingEvents);
      seat.pendingEvents = [];
      this.transmit(
        seat,
        `{"type":"snapshot","tick":${this.state.tick},"lastProcessedSeq":${seat.lastProcessedSeq},"state":${state},"events":${events}}`,
      );
    }
  }

  private handleConnectionTimeouts(now: number): void {
    for (const seat of this.seats.values()) {
      if (seat.peer && !seat.isBot && now - seat.lastHeardAt > SILENCE_TIMEOUT_MS) {
        const peer = seat.peer;
        this.disconnect(seat.playerId, peer);
        peer.close(CloseCode.timeout, 'no messages for too long');
      }
      if (seat.disconnectedAt === null || now - seat.disconnectedAt < NET.reconnectGraceMs) {
        continue;
      }
      // Gone for longer than the grace period.
      if (this.state.phase === 'waiting') {
        // Nobody to play against yet: free the seat for someone else.
        this.seats.delete(seat.playerId);
        removePlayer(this.state, seat.playerId);
      } else if (this.state.phase === 'playing' || this.state.phase === 'countdown') {
        const other = opponentOf(this.state, seat.playerId);
        this.broadcastEvents(endRound(this.state, other?.id ?? null, 'forfeit'));
        seat.disconnectedAt = now; // another full grace period before the next forfeit
      }
    }
  }

  // ---------------------------------------------------------------- helpers

  private welcome(seat: Seat, resumed: boolean): void {
    this.send(seat, {
      type: 'welcome',
      playerId: seat.playerId,
      reconnectToken: seat.reconnectToken,
      map: this.map,
      tickRate: NET.tickRate,
      snapshotRate: NET.snapshotRate,
      resumed,
    });
    // Resync immediately with a full snapshot instead of waiting for the next one.
    if (seat.peer) {
      this.transmit(
        seat,
        JSON.stringify({
          type: 'snapshot',
          tick: this.state.tick,
          lastProcessedSeq: seat.lastProcessedSeq,
          state: this.state,
          events: [],
        } satisfies ServerMessage),
      );
    }
  }

  send(seat: Seat, msg: ServerMessage): void {
    this.transmit(seat, JSON.stringify(msg));
  }

  /** Every outgoing frame goes through the seat's conditioner. */
  private transmit(seat: Seat, raw: string): void {
    seat.conditioner.outbound.push(raw, (r) => seat.peer?.send(r));
  }

  private broadcastEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    for (const seat of this.seats.values()) seat.pendingEvents.push(...events);
  }

  private player(id: string) {
    const p = this.state.players.find((pl) => pl.id === id);
    if (!p) throw new Error(`player ${id} not in match`);
    return p;
  }

  private allOthersAreBots(playerId: string): boolean {
    return [...this.seats.values()].every((s) => s.playerId === playerId || s.isBot);
  }
}

/**
 * 20 snapshots/s out of 30 ticks/s: send on the ticks where the snapshot
 * counter (tick × 20 / 30) rolls over, i.e. two ticks out of every three.
 */
export const isSnapshotTick = (tick: number): boolean =>
  Math.floor((tick * NET.snapshotRate) / NET.tickRate) !==
  Math.floor(((tick - 1) * NET.snapshotRate) / NET.tickRate);
