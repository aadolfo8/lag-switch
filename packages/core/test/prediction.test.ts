import { describe, expect, it } from 'vitest';
import { MATCH, TICK_MS } from '../src/config.js';
import { addPlayer, createMatch, findPlayer, stepMatch } from '../src/match.js';
import { PredictionBuffer, predictStep, reconcile } from '../src/netcode/prediction.js';
import { clonePlayer } from '../src/player.js';
import type { MatchState, PlayerInput } from '../src/types.js';
import { emptyMap, input } from './helpers.js';

const map = emptyMap([{ min: { x: 300, y: 0 }, max: { x: 320, y: 2000 } }]);
const clone = (s: MatchState): MatchState => JSON.parse(JSON.stringify(s));

/** A server match in the 'playing' phase with players a and b. */
function playingMatch(): MatchState {
  const s = createMatch(map);
  addPlayer(s, map, 'a', 'Ana');
  addPlayer(s, map, 'b', 'Bo');
  for (let i = 0; i < Math.ceil(MATCH.countdownMs / TICK_MS); i++) stepMatch(s, new Map(), { map });
  return s;
}

/** Some wiggly movement, including running into the wall at x=300. */
const moves = (n: number, firstSeq = 1): PlayerInput[] =>
  Array.from({ length: n }, (_, i) =>
    input({ seq: firstSeq + i, move: { x: 1, y: Math.sin(i / 4) }, aim: i / 10 }),
  );

describe('PredictionBuffer', () => {
  it('forgets acknowledged inputs and keeps the rest in order', () => {
    const buf = new PredictionBuffer();
    for (const i of moves(5)) buf.push(i);
    buf.acknowledge(3);
    expect(buf.unacknowledged().map((i) => i.seq)).toEqual([4, 5]);
    expect(buf.newest(1).map((i) => i.seq)).toEqual([5]);
    buf.acknowledge(10);
    expect(buf.size).toBe(0);
  });
});

describe('reconciliation', () => {
  it('when the server agrees, reconciling changes nothing', () => {
    const server = playingMatch();
    const lastKnown = clone(server);
    const predicted = clonePlayer(findPlayer(server, 'a') as never);
    const buffer = new PredictionBuffer();
    const latencyTicks = 5; // inputs reach the server 5 ticks after the client applies them
    const inputs = moves(40);

    let reconciledAtLeastOnce = false;
    for (let tick = 0; tick < inputs.length; tick++) {
      // client: predict and send
      const mine = inputs[tick] as PlayerInput;
      predictStep(predicted, mine, lastKnown, map);
      buffer.push(mine);

      // server: processes the input sent `latencyTicks` ago
      const arriving = inputs[tick - latencyTicks];
      stepMatch(server, new Map([['a', arriving ? [arriving] : []]]), { map });

      // a snapshot (sent now, also delayed, but we only care about content)
      if (arriving && tick % 3 === 0) {
        buffer.acknowledge(arriving.seq);
        const snapshot = clone(server);
        const result = reconcile(snapshot, 'a', buffer.unacknowledged(), map);
        expect(result?.pos.x).toBeCloseTo(predicted.pos.x, 6);
        expect(result?.pos.y).toBeCloseTo(predicted.pos.y, 6);
        expect(result?.vel.x).toBeCloseTo(predicted.vel.x, 6);
        reconciledAtLeastOnce = true;
      }
    }
    expect(reconciledAtLeastOnce).toBe(true);
    expect(predicted.pos.x).toBeCloseTo(300 - 16); // and we did hit the wall
  });

  it('when the server disagrees, the client adopts the server and replays on top', () => {
    const server = playingMatch();
    const predicted = clonePlayer(findPlayer(server, 'a') as never);
    const lastKnown = clone(server);
    const buffer = new PredictionBuffer();
    const inputs = moves(10);
    for (const i of inputs) {
      predictStep(predicted, i, lastKnown, map);
      buffer.push(i);
    }

    // The server applied the first 4 inputs, but something we didn't predict
    // happened: we were knocked 50 px down (think: a correction).
    for (const i of inputs.slice(0, 4)) stepMatch(server, new Map([['a', [i]]]), { map });
    const a = findPlayer(server, 'a');
    if (!a) throw new Error();
    a.pos.y += 50;
    buffer.acknowledge(4);

    const result = reconcile(clone(server), 'a', buffer.unacknowledged(), map);
    // Same x (horizontal movement agreed), y shifted by the server's correction.
    expect(result?.pos.x).toBeCloseTo(predicted.pos.x, 6);
    expect(result?.pos.y).toBeCloseTo(predicted.pos.y + 50, 0);
  });

  it('predicts the dead-battery freeze from the last snapshot', () => {
    const server = playingMatch();
    const a = findPlayer(server, 'a');
    if (!a) throw new Error();
    a.activeEffects.push({ id: 'deadBattery', until: server.time + 2000 });
    const result = reconcile(clone(server), 'a', moves(10), map);
    expect(result?.pos).toEqual(a.pos);
  });

  it('predicted ammo and reload replay identically', () => {
    const server = playingMatch();
    const lastKnown = clone(server);
    const predicted = clonePlayer(findPlayer(server, 'a') as never);
    const shots = Array.from({ length: 30 }, (_, i) => input({ seq: i + 1, shoot: true }));
    for (const i of shots) predictStep(predicted, i, lastKnown, map);
    const result = reconcile(lastKnown, 'a', shots, map);
    expect(result?.ammo).toEqual(predicted.ammo);
    expect(result?.reloadMsLeft).toBe(predicted.reloadMsLeft);
  });
});
