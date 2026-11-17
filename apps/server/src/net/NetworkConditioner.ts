/**
 * NETWORK CONDITIONER
 *
 * Sits between a player and the room and makes their connection worse, for
 * real: messages in BOTH directions go through it and can be delayed,
 * jittered, dropped or blocked. Sabotages don't animate anything; they only
 * change these four numbers, and the netcode has to cope.
 *
 *   browser ──ws──► [ inbound lane  ] ──► room   (inputs, pings)
 *   browser ◄──ws── [ outbound lane ] ◄── room   (snapshots, pongs)
 *
 * WebSockets run over TCP, which never reorders, so each lane keeps order:
 * a message never overtakes an earlier one even when jitter would allow it.
 * "Loss" is simulated at the message level (TCP would retransmit and stall
 * instead; dropping whole messages is what a UDP game would see, and it is
 * what makes the full-snapshot design visible).
 */

import type { ConditionerControls, NetworkConditions } from '@lag-switch/core';

/** Delay, jitter, loss and blocking: the four knobs (defined in core so sabotages can use them). */
export type LinkConditions = NetworkConditions;

export const CLEAR_LINK: LinkConditions = { delayMs: 0, jitterMs: 0, lossRate: 0, blocked: false };

export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Combines several sources of trouble into one set of conditions. */
export function combine(list: Iterable<Partial<LinkConditions>>): LinkConditions {
  let delayMs = 0;
  let jitterMs = 0;
  let keep = 1; // probability a message survives every source of loss
  let blocked = false;
  for (const c of list) {
    delayMs += c.delayMs ?? 0;
    jitterMs += c.jitterMs ?? 0;
    keep *= 1 - (c.lossRate ?? 0);
    blocked ||= c.blocked ?? false;
  }
  return { delayMs, jitterMs, lossRate: 1 - keep, blocked };
}

/** One direction of the link: an ordered, delayed, lossy queue. */
class Lane<T> {
  private queue: { item: T; at: number; deliver: (item: T) => void }[] = [];
  private timer: unknown = null;
  private lastAt = 0;
  sent = 0;
  dropped = 0;

  constructor(
    private readonly conditions: () => LinkConditions,
    private readonly scheduler: Scheduler,
    private readonly random: () => number,
  ) {}

  push(item: T, deliver: (item: T) => void): void {
    const c = this.conditions();
    if (c.blocked || (c.lossRate > 0 && this.random() < c.lossRate)) {
      this.dropped++;
      return;
    }
    const now = this.scheduler.now();
    const delay = c.delayMs + (c.jitterMs > 0 ? this.random() * c.jitterMs : 0);
    if (delay <= 0 && this.queue.length === 0) {
      this.sent++;
      deliver(item); // fast path: a clean link adds no latency at all
      return;
    }
    // Keep TCP's ordering: never deliver before the previous message.
    const at = Math.max(now + delay, this.lastAt);
    this.lastAt = at;
    this.queue.push({ item, at, deliver });
    if (this.timer === null) this.arm();
  }

  /** Throws away everything in flight (the socket it was for is gone). */
  clear(): void {
    this.queue = [];
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }

  get inFlight(): number {
    return this.queue.length;
  }

  private arm(): void {
    const head = this.queue[0];
    if (!head) {
      this.timer = null;
      return;
    }
    this.timer = this.scheduler.setTimeout(
      () => this.flush(),
      Math.max(0, head.at - this.scheduler.now()),
    );
  }

  private flush(): void {
    const now = this.scheduler.now();
    while (this.queue.length > 0 && (this.queue[0] as { at: number }).at <= now) {
      const { item, deliver } = this.queue.shift() as { item: T; deliver: (item: T) => void };
      this.sent++;
      deliver(item);
    }
    this.arm();
  }
}

export interface ConditionerOptions {
  scheduler?: Scheduler;
  random?: () => number;
}

/**
 * One per player. A base condition (e.g. ?lag=150 for testing) plus any
 * number of named overlays (one per active sabotage) that stack.
 */
export class NetworkConditioner<In = unknown> implements ConditionerControls {
  private base: LinkConditions = CLEAR_LINK;
  private readonly overlays = new Map<string, Partial<LinkConditions>>();
  readonly inbound: Lane<In>;
  readonly outbound: Lane<string>;

  constructor(opts: ConditionerOptions = {}) {
    const scheduler = opts.scheduler ?? realScheduler;
    const random = opts.random ?? Math.random;
    this.inbound = new Lane<In>(() => this.conditions, scheduler, random);
    this.outbound = new Lane<string>(() => this.conditions, scheduler, random);
  }

  get conditions(): LinkConditions {
    return combine([this.base, ...this.overlays.values()]);
  }

  setBase(c: Partial<LinkConditions>): void {
    this.base = { ...CLEAR_LINK, ...c };
  }

  /** Adds (or replaces) a named overlay, e.g. the 'lagSpike' sabotage. */
  apply(id: string, c: Partial<LinkConditions>): void {
    this.overlays.set(id, c);
  }

  remove(id: string): void {
    this.overlays.delete(id);
  }

  has(id: string): boolean {
    return this.overlays.has(id);
  }
}
