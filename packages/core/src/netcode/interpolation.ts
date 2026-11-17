import { lerpAngle, lerpVec } from '../math.js';
import type { MatchState, PlayerState } from '../types.js';

/**
 * ENTITY INTERPOLATION
 *
 * Snapshots arrive 20 times a second, with jitter, and sometimes not at all.
 * Drawing the rival at the latest snapshot would make it move in 50 ms jumps
 * and stutter whenever a packet is late.
 *
 * Instead we draw remote entities a little in the PAST (NET.interpolationDelayMs
 * = 100 ms, two snapshot intervals) and blend between the two snapshots that
 * surround that moment:
 *
 *   snapshots:   s1 ────── s2 ────── s3 ────── s4      (server time)
 *                               ▲                ▲
 *                          render time        newest
 *                       (now − 100 ms)
 *
 * With 100 ms of buffer, one lost or late snapshot is invisible: there is
 * still a later one to interpolate towards. The price is that you see your
 * rival 100 ms late, which lag compensation on the server pays back.
 */
export class SnapshotBuffer {
  private readonly snapshots: MatchState[] = [];

  constructor(private readonly maxAgeMs = 1000) {}

  push(state: MatchState): void {
    const last = this.snapshots.at(-1);
    if (last && state.time <= last.time) return; // duplicate or out of order: ignore
    this.snapshots.push(state);
    const oldest = state.time - this.maxAgeMs;
    while (this.snapshots.length > 2 && (this.snapshots[0] as MatchState).time < oldest) {
      this.snapshots.shift();
    }
  }

  get newest(): MatchState | undefined {
    return this.snapshots.at(-1);
  }

  clear(): void {
    this.snapshots.length = 0;
  }

  /**
   * The two snapshots around `renderTime` and how far between them it is.
   * Before the first snapshot it holds the oldest; past the newest it holds
   * the newest (no extrapolation: guessing wrong looks worse than pausing).
   */
  sample(renderTime: number): { from: MatchState; to: MatchState; t: number } | null {
    const s = this.snapshots;
    if (s.length === 0) return null;
    const first = s[0] as MatchState;
    const last = s.at(-1) as MatchState;
    if (renderTime <= first.time) return { from: first, to: first, t: 0 };
    if (renderTime >= last.time) return { from: last, to: last, t: 0 };
    for (let i = s.length - 1; i > 0; i--) {
      const from = s[i - 1] as MatchState;
      const to = s[i] as MatchState;
      if (renderTime >= from.time) {
        return { from, to, t: (renderTime - from.time) / (to.time - from.time) };
      }
    }
    return { from: first, to: first, t: 0 };
  }
}

/**
 * Blends one player between two snapshots. Positions and aim are blended;
 * discrete things (hp, weapon) come from the newer snapshot.
 * A jump bigger than `teleportPx` (respawn) is not blended.
 */
export function interpolatePlayer(
  from: PlayerState | undefined,
  to: PlayerState,
  t: number,
  teleportPx = 120,
): PlayerState {
  if (!from || t <= 0) return from ?? to;
  const dx = to.pos.x - from.pos.x;
  const dy = to.pos.y - from.pos.y;
  if (dx * dx + dy * dy > teleportPx * teleportPx) return t < 0.5 ? from : to;
  return {
    ...to,
    pos: lerpVec(from.pos, to.pos, t),
    aim: lerpAngle(from.aim, to.aim, t),
  };
}

/**
 * Estimates the server's clock from snapshot arrivals.
 *
 * Every snapshot carries the server time at which it was produced. When it
 * arrives we learn "server time ≈ local time + offset" (late by one-way
 * latency, which is fine: we only need a steady timeline to interpolate on).
 * The offset is smoothed so jitter doesn't shake the timeline, and reset
 * outright after a big jump (a lag spike starting or ending, a reconnect).
 */
export class ServerClock {
  private offset: number | null = null;

  constructor(
    private readonly smoothing = 0.1,
    private readonly snapThresholdMs = 250,
  ) {}

  observe(serverTime: number, localNow: number): void {
    const sample = serverTime - localNow;
    if (this.offset === null || Math.abs(sample - this.offset) > this.snapThresholdMs) {
      this.offset = sample;
      return;
    }
    // Snapshots that arrive early pull the clock forward faster than late
    // ones drag it back: the earliest arrivals are the least delayed ones.
    const k = sample > this.offset ? this.smoothing * 3 : this.smoothing;
    this.offset += (sample - this.offset) * k;
  }

  now(localNow: number): number | null {
    return this.offset === null ? null : localNow + this.offset;
  }

  reset(): void {
    this.offset = null;
  }
}
