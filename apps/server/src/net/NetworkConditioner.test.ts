import { describe, expect, it } from 'vitest';
import { combine, NetworkConditioner, type Scheduler } from './NetworkConditioner.js';

/** A fake clock: timers only fire when the test advances time. */
class FakeScheduler implements Scheduler {
  private t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((x) => x.id !== id);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}

/** Deterministic "random": cycles through the given values. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

function setup(random = () => 0.5) {
  const scheduler = new FakeScheduler();
  const c = new NetworkConditioner<string>({ scheduler, random });
  const got: { msg: string; at: number }[] = [];
  const deliver = (msg: string) => got.push({ msg, at: scheduler.now() });
  return { c, scheduler, got, deliver };
}

describe('NetworkConditioner', () => {
  it('a clean link delivers synchronously, adding no latency', () => {
    const { c, got, deliver } = setup();
    c.outbound.push('a', deliver);
    expect(got).toEqual([{ msg: 'a', at: 0 }]);
  });

  it('delays messages by delayMs', () => {
    const { c, scheduler, got, deliver } = setup();
    c.apply('lagSpike', { delayMs: 200 });
    c.outbound.push('a', deliver);
    scheduler.advance(199);
    expect(got).toHaveLength(0);
    scheduler.advance(1);
    expect(got).toEqual([{ msg: 'a', at: 200 }]);
  });

  it('applies to both directions independently', () => {
    const { c, scheduler, got, deliver } = setup();
    c.apply('lag', { delayMs: 100 });
    c.inbound.push('in', deliver);
    scheduler.advance(50);
    c.outbound.push('out', deliver);
    scheduler.advance(200);
    expect(got).toEqual([
      { msg: 'in', at: 100 },
      { msg: 'out', at: 150 },
    ]);
  });

  it('never reorders, even with jitter (like TCP)', () => {
    // First message gets the max jitter, the second none: the second must wait.
    const { c, scheduler, got, deliver } = setup(sequence(0.99, 0));
    c.apply('jitter', { delayMs: 10, jitterMs: 100 });
    c.outbound.push('first', deliver);
    scheduler.advance(5);
    c.outbound.push('second', deliver);
    scheduler.advance(500);
    expect(got.map((g) => g.msg)).toEqual(['first', 'second']);
    expect(got[1]?.at).toBeGreaterThanOrEqual(got[0]?.at ?? 0);
  });

  it('drops roughly lossRate of the messages', () => {
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 2 ** 32;
      return seed / 2 ** 32;
    };
    const { c, got, deliver } = setup(lcg);
    c.apply('packetLoss', { lossRate: 0.25 });
    for (let i = 0; i < 4000; i++) c.outbound.push(String(i), deliver);
    expect(got.length / 4000).toBeGreaterThan(0.72);
    expect(got.length / 4000).toBeLessThan(0.78);
    expect(c.outbound.dropped + c.outbound.sent).toBe(4000);
  });

  it('blocks everything while blocked, and recovers when the overlay is removed', () => {
    const { c, got, deliver } = setup();
    c.apply('wifiReset', { blocked: true });
    c.inbound.push('lost', deliver);
    c.outbound.push('lost', deliver);
    expect(got).toHaveLength(0);
    c.remove('wifiReset');
    c.outbound.push('back', deliver);
    expect(got.map((g) => g.msg)).toEqual(['back']);
  });

  it('stacks a base condition with sabotage overlays', () => {
    const { c } = setup();
    c.setBase({ delayMs: 75 });
    c.apply('lagSpike', { delayMs: 200 });
    c.apply('packetLoss', { lossRate: 0.25 });
    expect(c.conditions).toEqual({ delayMs: 275, jitterMs: 0, lossRate: 0.25, blocked: false });
    c.remove('lagSpike');
    expect(c.conditions.delayMs).toBe(75);
  });

  it('clear() throws away messages in flight', () => {
    const { c, scheduler, got, deliver } = setup();
    c.apply('lag', { delayMs: 100 });
    c.outbound.push('stale', deliver);
    c.outbound.clear();
    scheduler.advance(1000);
    expect(got).toHaveLength(0);
  });
});

describe('combine', () => {
  it('adds delays and compounds independent losses', () => {
    const r = combine([{ lossRate: 0.5 }, { lossRate: 0.5, delayMs: 10 }, { delayMs: 5 }]);
    expect(r.lossRate).toBeCloseTo(0.75);
    expect(r.delayMs).toBe(15);
  });
});
