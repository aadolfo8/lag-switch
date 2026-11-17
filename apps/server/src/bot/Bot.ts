import type { ClientMessage, MatchState, PlayerInput, ServerMessage } from '@lag-switch/core';
import type { Peer } from '../game/peer.js';
import type { Room } from '../game/Room.js';
import { BotBrain, type BotSkill, DEFAULT_SKILL, mulberry32 } from './BotBrain.js';
import { NavGrid } from './nav.js';

/** Ticks between reconnection attempts after a Wi-Fi reset (~0.5 s). */
const REJOIN_EVERY_TICKS = 15;
const PING_EVERY_TICKS = 30;

export interface BotOptions {
  name?: string;
  skill?: Partial<BotSkill>;
  seed?: number;
}

/**
 * A virtual client living inside the server process.
 *
 * It is a Peer like any WebSocket: the room sends it the same JSON strings,
 * through the same per-seat NetworkConditioner, and it answers with the same
 * `input` messages a browser sends. So sabotages hit the bot for real: a lag
 * spike makes it react to the past, packet loss eats its inputs, a Wi-Fi
 * reset disconnects it and it has to rejoin with its token.
 */
export class Bot implements Peer {
  readonly name: string;
  private playerId: string | null = null;
  private reconnectToken: string | null = null;
  private view: MatchState | null = null;
  private seq = 0;
  private pending: PlayerInput[] = [];
  private offline = false;
  private rejoinIn = 0;
  private ticks = 0;
  private rtt = 0;
  private readonly brain: BotBrain;

  constructor(
    private readonly room: Room,
    opts: BotOptions = {},
  ) {
    this.name = opts.name ?? 'lagbot';
    this.brain = new BotBrain(
      room.map,
      new NavGrid(room.map),
      mulberry32(opts.seed ?? Date.now()),
      { ...DEFAULT_SKILL, ...opts.skill },
    );
  }

  /** Takes a seat in the room. */
  join(): boolean {
    const r = this.room.join(this, this.name, {
      isBot: true,
      ...(this.reconnectToken && { reconnectToken: this.reconnectToken }),
    });
    return r.ok;
  }

  get id(): string | null {
    return this.playerId;
  }

  get mode() {
    return this.brain.currentMode;
  }

  // ---------------------------------------------------------------- Peer

  send(raw: string): void {
    const msg = JSON.parse(raw) as ServerMessage;
    switch (msg.type) {
      case 'welcome':
        this.playerId = msg.playerId;
        this.reconnectToken = msg.reconnectToken;
        this.offline = false;
        this.pending = [];
        break;
      case 'snapshot':
        this.view = msg.state;
        this.pending = this.pending.filter((i) => i.seq > msg.lastProcessedSeq);
        break;
      case 'pong':
        this.rtt = performance.now() - msg.t;
        break;
      default:
        break;
    }
  }

  /** The room hung up on us (Wi-Fi reset): try to come back every half second. */
  close(): void {
    this.offline = true;
    this.rejoinIn = REJOIN_EVERY_TICKS;
  }

  // ---------------------------------------------------------------- loop

  /** Called by the room once per tick, before it applies inputs. */
  think(): void {
    this.ticks++;
    if (this.offline) {
      if (--this.rejoinIn <= 0) {
        if (!this.join()) this.rejoinIn = REJOIN_EVERY_TICKS;
      }
      return;
    }
    const s = this.view;
    if (!s || !this.playerId) return;

    if (this.ticks % PING_EVERY_TICKS === 0) {
      this.transmit({ type: 'ping', t: performance.now(), rtt: this.rtt });
    }

    const me = s.players.find((p) => p.id === this.playerId);
    if (!me) return;
    const rival = s.players.find((p) => p.id !== this.playerId);
    if (s.phase === 'matchEnd') {
      this.transmit({ type: 'rematch' });
      return;
    }

    const intent = this.brain.decide(s, me, rival);
    const input: PlayerInput = { seq: ++this.seq, ...intent };
    this.pending.push(input);
    if (this.pending.length > 30) this.pending.shift();
    // Same redundancy as the browser client: the newest 3 unacknowledged inputs.
    this.transmit({ type: 'input', inputs: this.pending.slice(-3) });
  }

  private transmit(msg: ClientMessage): void {
    if (this.playerId) this.room.receive(this.playerId, msg);
  }
}
