import { NET } from '../config.js';
import { lerpVec } from '../math.js';
import type { MatchState, Vec2 } from '../types.js';

interface Frame {
  time: number;
  positions: Map<string, Vec2>;
}

/**
 * LAG COMPENSATION (server side)
 *
 * The shooter aimed at where they SAW the rival: an interpolated image about
 * RTT/2 + 100 ms old. Testing the shot against the rival's present position
 * would make you miss targets you clearly hit on your screen.
 *
 * So the server keeps one second of position history and, for each shot,
 * rewinds the other players to the moment the shooter was looking at:
 *
 *   rewindTo = now − RTT/2 − interpolationDelay      (capped at 250 ms back)
 *
 * The cap is the classic trade-off: without it, a player on a terrible
 * connection could hit you long after you reached cover on your screen
 * ("I got shot behind the wall!"). 250 ms favours the shooter for normal
 * pings and stops favouring very laggy ones.
 */
export class PositionHistory {
  private frames: Frame[] = [];

  constructor(private readonly keepMs: number = NET.historyMs) {}

  /** Records everybody's position at the end of a tick. */
  record(state: MatchState): void {
    this.frames.push({
      time: state.time,
      positions: new Map(state.players.map((p) => [p.id, { ...p.pos }])),
    });
    const oldest = state.time - this.keepMs;
    while (this.frames.length > 1 && (this.frames[0] as Frame).time < oldest) this.frames.shift();
  }

  /** Where `playerId` was at `time`, interpolated between ticks. */
  positionAt(playerId: string, time: number): Vec2 | undefined {
    const f = this.frames;
    if (f.length === 0) return undefined;
    const first = f[0] as Frame;
    const last = f.at(-1) as Frame;
    if (time <= first.time) return first.positions.get(playerId);
    if (time >= last.time) return last.positions.get(playerId);
    for (let i = f.length - 1; i > 0; i--) {
      const a = f[i - 1] as Frame;
      const b = f[i] as Frame;
      if (time >= a.time) {
        const pa = a.positions.get(playerId);
        const pb = b.positions.get(playerId);
        if (!pa || !pb) return pb ?? pa;
        return lerpVec(pa, pb, (time - a.time) / (b.time - a.time));
      }
    }
    return undefined;
  }

  clear(): void {
    this.frames = [];
  }
}

/**
 * How far back to rewind for a shooter with this round-trip time who draws
 * the rival `viewDelayMs` in the past (their interpolation delay).
 */
export const rewindMsFor = (
  rttMs: number,
  viewDelayMs: number = NET.interpolationDelayMs,
): number => Math.min(NET.maxRewindMs, Math.max(0, rttMs / 2 + viewDelayMs));
