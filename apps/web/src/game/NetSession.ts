import {
  ARENA,
  type ArenaMap,
  type ClientMessage,
  clonePlayer,
  type GameEvent,
  interpolatePlayer,
  lerpVec,
  MAX_INPUTS_PER_MESSAGE,
  type MatchState,
  muzzleOf,
  NET,
  type PlayerInput,
  type PlayerState,
  PredictionBuffer,
  predictStep,
  reconcile,
  ServerClock,
  type ServerMessage,
  SnapshotBuffer,
  traceShot,
  type Vec2,
} from '@lag-switch/core';
import { initialNetStats, RateMeter, useNet } from './netStore';
import type { GameSession, RenderFrame, RenderPlayer } from './session';

const PING_EVERY_MS = 1000;
const STATS_EVERY_MS = 250;
/** Inputs (re)sent in every packet: the newest unacknowledged ones. */
const REDUNDANCY = 3;
/** Corrections smaller than this are smoothed out; bigger ones snap (respawn, teleport). */
const SMOOTH_MAX_PX = 64;
/** Time constant of the correction smoothing. */
const SMOOTH_MS = 80;
/** Close code the server uses for the Wi-Fi reset sabotage (see server peer.ts). */
const CLOSE_WIFI_RESET = 4001;
/** How long we keep trying to get our seat back (the server keeps it 10 s). */
const RECONNECT_FOR_MS = 12_000;
const RECONNECT_EVERY_MS = 500;

export const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export interface NetSessionOptions {
  code: string;
  name: string;
  /** Simulated round-trip latency for testing (?lag=150). */
  lagMs?: number;
}

/**
 * Client side of the netcode. Three ideas, each a few lines below:
 *
 * 1. PREDICTION: our own inputs are applied locally the moment they are
 *    sampled, with the same `core` code the server runs, so our character
 *    reacts instantly whatever the ping.
 * 2. RECONCILIATION: every snapshot tells us which of our inputs the server
 *    has applied. We restart from the server's version of us and replay the
 *    rest. Small disagreements are smoothed visually; big ones snap.
 * 3. INTERPOLATION: the rival is drawn 100 ms in the past, blending the two
 *    snapshots around that moment, so it moves smoothly at 60 fps out of 20
 *    snapshots per second and survives a lost one.
 */
export class NetSession implements GameSession {
  readonly map: ArenaMap = ARENA;
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private reconnectToken: string | null = null;
  private disposed = false;
  private readonly timers: number[] = [];
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;

  // --- authoritative view ---
  private latest: MatchState | null = null;
  private readonly snapshots = new SnapshotBuffer();
  private readonly clock = new ServerClock();

  // --- prediction ---
  private readonly pending = new PredictionBuffer();
  private predicted: PlayerState | null = null;
  private prevPredicted: PlayerState | null = null;
  /** Visual offset left by the last correction; decays towards zero. */
  private correction: Vec2 = { x: 0, y: 0 };
  private lastFrameAt = performance.now();

  private events: GameEvent[] = [];
  private rtt: number | null = null;

  // --- stats for F3 ---
  private readonly bytesIn = new RateMeter();
  private readonly bytesOut = new RateMeter();
  private readonly msgsIn = new RateMeter();
  private readonly msgsOut = new RateMeter();
  private readonly snapshotRate = new RateMeter();
  private lastCorrectionPx = 0;

  constructor(private readonly opts: NetSessionOptions) {
    useNet.setState({ ...initialNetStats, roomCode: opts.code });
    // Open the socket on the next task: if the page unmounts us straight
    // away (React StrictMode does in dev) no connection is ever started.
    this.timers.push(window.setTimeout(() => this.connect(), 0));
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
      this.send({
        type: 'join',
        code: this.opts.code,
        name: this.opts.name,
        ...(this.reconnectToken && { reconnectToken: this.reconnectToken }),
        ...(this.opts.lagMs && { lagMs: this.opts.lagMs }),
      });
    });
    ws.addEventListener('message', (e) => this.onMessage(String(e.data)));
    ws.addEventListener('close', (e) => this.onClose(ws, e.code));
  }

  /**
   * RECONNECTION. Any unexpected close (a real network drop, or the server
   * cutting us off for the Wi-Fi reset sabotage) starts a retry loop with the
   * reconnect token from `welcome`. The server keeps our seat for 10 s; when
   * it lets us back in it sends `welcome { resumed: true }` and a full
   * snapshot, and we rebuild everything from it.
   */
  private onClose(ws: WebSocket, code: number): void {
    if (this.ws !== ws || this.disposed) return;
    const { status } = useNet.getState();
    if (status === 'error' || !this.reconnectToken) {
      // Never joined, or the room refused us: nothing to resume.
      if (status !== 'error') useNet.setState({ status: 'closed' });
      return;
    }
    const offline = useNet.getState().offline ?? {
      since: performance.now(),
      reason: code === CLOSE_WIFI_RESET ? 'wifiReset' : 'dropped',
    };
    if (performance.now() - offline.since > RECONNECT_FOR_MS) {
      useNet.setState({ status: 'closed', offline: null });
      return;
    }
    this.reconnectAttempt += 1;
    useNet.setState({ status: 'reconnecting', offline, reconnectAttempt: this.reconnectAttempt });
    this.reconnectTimer = window.setTimeout(() => this.connect(), RECONNECT_EVERY_MS);
  }

  /** Called on `welcome { resumed: true }`: drop everything derived from the old connection. */
  private resync(): void {
    this.pending.clear(); // the server discarded our queued inputs
    this.snapshots.clear();
    this.clock.reset();
    this.prevPredicted = null;
    this.correction = { x: 0, y: 0 };
    this.reconnectAttempt = 0;
    useNet.setState({ offline: null, reconnectAttempt: 0 });
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
        this.reconnectToken = msg.reconnectToken;
        if (msg.resumed) this.resync();
        break;
      case 'snapshot':
        this.onSnapshot(msg);
        break;
      case 'pong':
        this.rtt = performance.now() - msg.t;
        break;
      case 'error':
        // 'offline' = still inside the Wi-Fi reset: the server closes the
        // socket and our reconnect loop simply tries again.
        if (msg.code !== 'offline') useNet.setState({ status: 'error', error: msg.code });
        break;
      case 'sabotage':
        break;
    }
  }

  private onSnapshot(msg: Extract<ServerMessage, { type: 'snapshot' }>): void {
    const now = performance.now();
    this.snapshotRate.add();
    this.latest = msg.state;
    this.snapshots.push(msg.state);
    this.clock.observe(msg.state.time, now);

    // Our own shots were already drawn when we fired them (prediction).
    this.events.push(...msg.events.filter((e) => !(e.type === 'shot' && e.by === this.playerId)));

    // --- reconciliation ---
    if (this.playerId) {
      this.pending.acknowledge(msg.lastProcessedSeq);
      const fresh = reconcile(msg.state, this.playerId, this.pending.unacknowledged(), this.map);
      if (fresh) {
        if (this.predicted) {
          // How far our prediction was from the corrected truth.
          const dx = this.predicted.pos.x - fresh.pos.x;
          const dy = this.predicted.pos.y - fresh.pos.y;
          const err = Math.hypot(dx, dy);
          this.lastCorrectionPx = err;
          if (err < SMOOTH_MAX_PX) {
            // Keep drawing where we were and glide to the corrected position.
            this.correction = { x: this.correction.x + dx, y: this.correction.y + dy };
          } else {
            this.correction = { x: 0, y: 0 };
            this.prevPredicted = null;
          }
        }
        this.predicted = fresh;
      }
    }

    useNet.setState({
      serverTick: msg.tick,
      status: msg.state.players.length < 2 ? 'waiting' : 'playing',
    });
  }

  private ping(): void {
    this.send({ type: 'ping', t: performance.now(), ...(this.rtt !== null && { rtt: this.rtt }) });
  }

  private publishStats(): void {
    const me = this.latest?.players.find((p) => p.id === this.playerId);
    useNet.setState({
      pingMs: this.rtt === null ? null : Math.round(this.rtt),
      snapshotsPerSec: this.snapshotRate.perSecond(),
      bytesInPerSec: this.bytesIn.perSecond(),
      bytesOutPerSec: this.bytesOut.perSecond(),
      messagesInPerSec: this.msgsIn.perSecond(),
      messagesOutPerSec: this.msgsOut.perSecond(),
      pendingInputs: this.pending.size,
      correctionPx: this.lastCorrectionPx,
      interpolationMs: NET.interpolationDelayMs,
      effects:
        me?.activeEffects.map((e) => ({
          id: e.id,
          leftMs: Math.max(0, e.until - (this.latest?.time ?? 0)),
        })) ?? [],
    });
  }

  // --------------------------------------------------------- game session

  /** 30 Hz: predict the input locally, then send it (with a few previous ones). */
  step(input: PlayerInput): void {
    if (!this.playerId || !this.predicted || !this.latest) return;
    // While offline the game freezes for us (it doesn't for the rival).
    if (useNet.getState().offline) return;

    this.prevPredicted = clonePlayer(this.predicted);
    const out = predictStep(this.predicted, input, this.latest, this.map);
    this.pending.push(input);
    if (out.fired) this.events.push(this.localShot(this.predicted));

    this.send({
      type: 'input',
      inputs: this.pending.newest(Math.min(REDUNDANCY, MAX_INPUTS_PER_MESSAGE)),
    });
  }

  /**
   * Draws our own tracer immediately. Where it ENDS is only a guess (the
   * server decides hits with lag compensation), but nobody can tell: the
   * shot leaves the gun the instant you click.
   */
  private localShot(me: PlayerState): GameEvent {
    const origin = muzzleOf(me.pos, me.aim);
    const targets = this.remotePlayers(performance.now()).map((p) => ({ id: p.id, pos: p.pos }));
    const pellets = traceShot(origin, me.aim, me.weapon, this.map.walls, targets);
    return {
      type: 'shot',
      by: me.id,
      weapon: me.weapon,
      from: origin,
      to: pellets.map((p) => p.end),
    };
  }

  /** Everybody else, interpolated NET.interpolationDelayMs in the past. */
  private remotePlayers(now: number): PlayerState[] {
    const serverNow = this.clock.now(now);
    const sample =
      serverNow === null ? null : this.snapshots.sample(serverNow - NET.interpolationDelayMs);
    if (!sample) return [];
    return sample.to.players
      .filter((p) => p.id !== this.playerId)
      .map((to) => {
        const from = sample.from.players.find((p) => p.id === to.id);
        return interpolatePlayer(from, to, sample.t);
      });
  }

  frame(alpha: number, now: number): RenderFrame | null {
    const s = this.latest;
    if (!s) return null;

    // Decay the correction offset (frame-rate independent).
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    const k = Math.exp(-dt / SMOOTH_MS);
    this.correction = { x: this.correction.x * k, y: this.correction.y * k };

    const players: RenderPlayer[] = this.remotePlayers(now).map((p) => toRender(p, false));

    const me = this.predicted;
    if (me) {
      const base = this.prevPredicted ? lerpVec(this.prevPredicted.pos, me.pos, alpha) : me.pos;
      const authoritative = s.players.find((p) => p.id === me.id);
      players.push({
        ...toRender(me, true),
        pos: { x: base.x + this.correction.x, y: base.y + this.correction.y },
        // hp and connection always come from the server: never predicted.
        hp: authoritative?.hp ?? me.hp,
        connected: authoritative?.connected ?? true,
        effects: authoritative?.activeEffects.map((e) => e.id) ?? [],
      });
    }

    return { players, pickups: s.pickups };
  }

  /** Latest snapshot, with our predicted ammo/weapon/reload for an instant HUD. */
  state(): MatchState | null {
    const s = this.latest;
    const me = this.predicted;
    if (!s || !me) return s;
    return {
      ...s,
      players: s.players.map((p) =>
        p.id === me.id
          ? { ...p, weapon: me.weapon, ammo: me.ammo, reloadMsLeft: me.reloadMsLeft }
          : p,
      ),
    };
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
    for (const t of this.timers) {
      window.clearInterval(t);
      window.clearTimeout(t);
    }
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'left');
    this.ws = null;
  }
}

const toRender = (p: PlayerState, isYou: boolean): RenderPlayer => ({
  id: p.id,
  name: p.name,
  pos: p.pos,
  aim: p.aim,
  hp: p.hp,
  weapon: p.weapon,
  isYou,
  connected: p.connected,
  effects: p.activeEffects.map((e) => e.id),
});
