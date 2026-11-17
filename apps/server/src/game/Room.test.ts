import { MATCH, NET, type PlayerInput, type ServerMessage, TICK_MS } from '@lag-switch/core';
import { describe, expect, it } from 'vitest';
import type { Peer } from './peer.js';
import { isSnapshotTick, Room } from './Room.js';

class FakePeer implements Peer {
  received: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  send(raw: string) {
    this.received.push(JSON.parse(raw));
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  last<T extends ServerMessage['type']>(type: T) {
    return this.received
      .filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type)
      .at(-1);
  }
}

const input = (seq: number, over: Partial<PlayerInput> = {}): PlayerInput => ({
  seq,
  move: { x: 0, y: 0 },
  aim: 0,
  shoot: false,
  reload: false,
  switchWeapon: false,
  useSabotage: false,
  ...over,
});

function setup() {
  let clock = 0;
  const room = new Room({ code: 'ABCDE', now: () => clock });
  const a = new FakePeer();
  const b = new FakePeer();
  const ja = room.join(a, 'Ana');
  const jb = room.join(b, 'Bo');
  if (!ja.ok || !jb.ok) throw new Error('join failed');
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      clock += TICK_MS;
      room.tick();
    }
  };
  const toPlaying = () => tick(Math.ceil(MATCH.countdownMs / TICK_MS));
  return {
    room,
    a,
    b,
    seatA: ja.seat,
    seatB: jb.seat,
    tick,
    toPlaying,
    advance: (ms: number) => (clock += ms),
  };
}

describe('Room', () => {
  it('welcomes each player with a token and an immediate snapshot', () => {
    const { a } = setup();
    expect(a.received[0]).toMatchObject({
      type: 'welcome',
      tickRate: NET.tickRate,
      resumed: false,
    });
    expect(a.received[1]?.type).toBe('snapshot');
  });

  it('refuses a third player', () => {
    const { room } = setup();
    expect(room.join(new FakePeer(), 'Cy')).toEqual({ ok: false, code: 'room_full' });
  });

  it('sends 20 snapshots per second out of 30 ticks', () => {
    let n = 0;
    for (let t = 1; t <= NET.tickRate; t++) if (isSnapshotTick(t)) n++;
    expect(n).toBe(NET.snapshotRate);
  });

  it('applies inputs in seq order, ignores duplicates and acks the last one', () => {
    const { room, a, seatA, tick, toPlaying } = setup();
    toPlaying();
    // Redundant batches, like the client sends: [1,2] then [2,3] then [1,2,3].
    room.receive(seatA.playerId, { type: 'input', inputs: [input(1), input(2)] });
    room.receive(seatA.playerId, { type: 'input', inputs: [input(2), input(3)] });
    room.receive(seatA.playerId, { type: 'input', inputs: [input(3), input(1), input(2)] });
    expect(seatA.queue.map((i) => i.seq)).toEqual([1, 2, 3]);
    tick(2);
    expect(a.last('snapshot')?.lastProcessedSeq).toBe(3);
    expect(seatA.queue).toHaveLength(0);
  });

  it('caps how many inputs one player can apply per tick (speed hack)', () => {
    const { room, seatA, tick, toPlaying } = setup();
    toPlaying();
    // Drain the starting budget first.
    room.receive(seatA.playerId, {
      type: 'input',
      inputs: Array.from({ length: 8 }, (_, i) => input(i + 1)),
    });
    tick();
    const before = seatA.inputsApplied;
    // Flood: 8 inputs per tick for 10 ticks.
    let seq = 100;
    for (let t = 0; t < 10; t++) {
      room.receive(seatA.playerId, {
        type: 'input',
        inputs: Array.from({ length: 8 }, () => input(seq++)),
      });
      tick();
    }
    // 80 inputs sent in 10 ticks, but at most ~1 per tick (+ the burst budget) applied.
    const applied = seatA.inputsApplied - before;
    expect(applied).toBeLessThanOrEqual(Math.ceil(10 * 1.05) + 8);
    expect(seatA.queue.length).toBeGreaterThan(0);
    expect(before).toBe(8);
  });

  it('a reconnect token takes back the same seat and resyncs', () => {
    const { room, a, seatA } = setup();
    room.disconnect(seatA.playerId, a);
    expect(room.state.players.find((p) => p.id === seatA.playerId)?.connected).toBe(false);
    const a2 = new FakePeer();
    const r = room.join(a2, 'Ana', { reconnectToken: seatA.reconnectToken });
    expect(r).toMatchObject({ ok: true, resumed: true });
    expect(a2.received[0]).toMatchObject({
      type: 'welcome',
      playerId: seatA.playerId,
      resumed: true,
    });
    expect(a2.received[1]?.type).toBe('snapshot');
    expect(room.state.players.find((p) => p.id === seatA.playerId)?.connected).toBe(true);
  });

  it('a stale socket closing does not kick the reconnected one', () => {
    const { room, a, seatA } = setup();
    const a2 = new FakePeer();
    room.join(a2, 'Ana', { reconnectToken: seatA.reconnectToken });
    expect(a.closed?.code).toBe(4002);
    room.disconnect(seatA.playerId, a); // old socket's close event arrives late
    expect(seatA.peer).toBe(a2);
  });

  it('loses the round if not back within the grace period', () => {
    const { room, a, seatA, seatB, tick, toPlaying, advance } = setup();
    toPlaying();
    room.disconnect(seatA.playerId, a);
    advance(NET.reconnectGraceMs + 1);
    tick();
    expect(room.state.phase).toBe('roundEnd');
    expect(room.state.scores[seatB.playerId]).toBe(1);
  });

  it('cuts a connection that went silent', () => {
    const { b, tick, toPlaying, advance, room, seatA } = setup();
    toPlaying();
    room.receive(seatA.playerId, { type: 'ping', t: 1 });
    advance(6000);
    tick();
    expect(b.closed?.code).toBe(4003);
  });

  it('answers pings with the server time and smooths the reported rtt', () => {
    const { room, a, seatA } = setup();
    room.receive(seatA.playerId, { type: 'ping', t: 123, rtt: 100 });
    room.receive(seatA.playerId, { type: 'ping', t: 124, rtt: 200 });
    expect(a.last('pong')).toMatchObject({ type: 'pong', t: 124 });
    expect(seatA.rtt).toBeCloseTo(120);
  });
});

describe('Room sabotages', () => {
  const useSabotage = (
    ctx: ReturnType<typeof setup>,
    kind: 'lagSpike' | 'packetLoss' | 'wifiReset' | 'deadBattery',
  ) => {
    const pa = ctx.room.state.players.find((p) => p.id === ctx.seatA.playerId);
    if (!pa) throw new Error();
    pa.sabotageSlot = kind;
    ctx.room.receive(ctx.seatA.playerId, {
      type: 'input',
      inputs: [input(ctx.seatA.lastProcessedSeq + 1, { useSabotage: true })],
    });
    ctx.tick();
  };

  it('a lag spike slows the victim’s link, and only for its duration', () => {
    const ctx = setup();
    ctx.toPlaying();
    useSabotage(ctx, 'lagSpike');
    expect(ctx.seatB.conditioner.conditions.delayMs).toBe(200);
    expect(ctx.seatA.conditioner.conditions.delayMs).toBe(0);
    expect(ctx.b.received.some((m) => m.type === 'sabotage')).toBe(true);
    ctx.tick(Math.ceil(5000 / TICK_MS) + 1);
    expect(ctx.seatB.conditioner.conditions.delayMs).toBe(0);
  });

  it('packet loss drops the victim’s traffic', () => {
    const ctx = setup();
    ctx.toPlaying();
    useSabotage(ctx, 'packetLoss');
    expect(ctx.seatB.conditioner.conditions.lossRate).toBeCloseTo(0.25);
  });

  it('a wi-fi reset really closes the socket and refuses to reconnect until it ends', () => {
    const ctx = setup();
    ctx.toPlaying();
    useSabotage(ctx, 'wifiReset');
    expect(ctx.b.closed?.code).toBe(4001);
    expect(ctx.seatB.peer).toBeNull();

    const early = new FakePeer();
    expect(ctx.room.join(early, 'Bo', { reconnectToken: ctx.seatB.reconnectToken })).toEqual({
      ok: false,
      code: 'offline',
    });

    ctx.advance(3000);
    ctx.tick(Math.ceil(3000 / TICK_MS) + 1);
    const back = new FakePeer();
    const r = ctx.room.join(back, 'Bo', { reconnectToken: ctx.seatB.reconnectToken });
    expect(r).toMatchObject({ ok: true, resumed: true });
    // resync: welcome + a full snapshot right away
    expect(back.received.map((m) => m.type)).toEqual(['welcome', 'snapshot']);
  });

  it('effects are lifted when a new round clears them', () => {
    const ctx = setup();
    ctx.toPlaying();
    useSabotage(ctx, 'lagSpike');
    const pb = ctx.room.state.players.find((p) => p.id === ctx.seatB.playerId);
    if (pb) pb.hp = 0; // force the round to end on the next timeout check
    ctx.room.state.phaseEndsAt = ctx.room.state.time; // end the round now
    ctx.tick(Math.ceil((MATCH.roundEndMs + 100) / TICK_MS));
    expect(ctx.seatB.conditioner.conditions.delayMs).toBe(0);
  });
});
