import {
  ARENA,
  type ArenaMap,
  type ClientMessage,
  type GameEvent,
  type MatchState,
  type PlayerInput,
  type ServerMessage,
} from '@lag-switch/core';
import { initialNetStats, RateMeter, useNet } from './netStore';
import type { GameSession, RenderFrame } from './session';

const PING_EVERY_MS = 1000;
const STATS_EVERY_MS = 250;

export const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * Talks to the authoritative server.
 *
 * This first version is deliberately naive: it sends inputs and draws the
 * latest snapshot exactly as received. Your own movement therefore lags by a
 * full round trip and everything moves at 20 Hz. The next step (prediction,
 * reconciliation and interpolation) fixes exactly that.
 */
export class NetSession implements GameSession {
  readonly map: ArenaMap = ARENA;
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private latest: MatchState | null = null;
  private events: GameEvent[] = [];
  private rtt: number | null = null;
  private disposed = false;
  private readonly timers: number[] = [];

  private readonly bytesIn = new RateMeter();
  private readonly bytesOut = new RateMeter();
  private readonly msgsIn = new RateMeter();
  private readonly msgsOut = new RateMeter();
  private readonly snapshots = new RateMeter();

  constructor(
    private readonly code: string,
    private readonly name: string,
  ) {
    useNet.setState({ ...initialNetStats, roomCode: code });
    this.connect();
    this.timers.push(
      window.setInterval(() => this.ping(), PING_EVERY_MS),
      window.setInterval(() => this.publishStats(), STATS_EVERY_MS),
    );
  }

  youId() {
    return this.playerId;
  }

  // ------------------------------------------------------------ connection

  private connect(): void {
    useNet.setState({ status: 'connecting' });
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.send({ type: 'join', code: this.code, name: this.name });
    });
    ws.addEventListener('message', (e) => this.onMessage(String(e.data)));
    ws.addEventListener('close', () => {
      if (this.ws === ws && !this.disposed) useNet.setState({ status: 'closed' });
    });
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const raw = JSON.stringify(msg);
    this.ws.send(raw);
    this.bytesOut.add(raw.length);
    this.msgsOut.add();
  }

  private onMessage(raw: string): void {
    this.bytesIn.add(raw.length);
    this.msgsIn.add();
    const msg = JSON.parse(raw) as ServerMessage;

    switch (msg.type) {
      case 'welcome':
        this.playerId = msg.playerId;
        break;
      case 'snapshot':
        this.snapshots.add();
        this.latest = msg.state;
        this.events.push(...msg.events);
        useNet.setState({
          serverTick: msg.tick,
          status: msg.state.players.length < 2 ? 'waiting' : 'playing',
        });
        break;
      case 'pong':
        this.rtt = performance.now() - msg.t;
        break;
      case 'error':
        useNet.setState({ status: 'error', error: msg.code });
        break;
      case 'sabotage':
        break;
    }
  }

  private ping(): void {
    this.send({ type: 'ping', t: performance.now(), ...(this.rtt !== null && { rtt: this.rtt }) });
  }

  private publishStats(): void {
    useNet.setState({
      pingMs: this.rtt === null ? null : Math.round(this.rtt),
      snapshotsPerSec: this.snapshots.perSecond(),
      bytesInPerSec: this.bytesIn.perSecond(),
      bytesOutPerSec: this.bytesOut.perSecond(),
      messagesInPerSec: this.msgsIn.perSecond(),
      messagesOutPerSec: this.msgsOut.perSecond(),
    });
  }

  // --------------------------------------------------------- game session

  step(input: PlayerInput): void {
    if (!this.playerId) return;
    this.send({ type: 'input', inputs: [input] });
  }

  frame(): RenderFrame | null {
    const s = this.latest;
    if (!s) return null;
    return {
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        pos: p.pos,
        aim: p.aim,
        hp: p.hp,
        weapon: p.weapon,
        isYou: p.id === this.playerId,
        connected: p.connected,
        effects: p.activeEffects.map((e) => e.id),
      })),
      pickups: s.pickups,
    };
  }

  state(): MatchState | null {
    return this.latest;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  rematch(): void {
    this.send({ type: 'rematch' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers) window.clearInterval(t);
    this.ws?.close(1000, 'left');
    this.ws = null;
  }
}
