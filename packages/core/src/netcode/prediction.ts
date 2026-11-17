import { isInputBlocked } from '../match.js';
import { applyInput, clonePlayer, type InputOutcome } from '../player.js';
import type { ArenaMap, MatchState, PlayerInput, PlayerState } from '../types.js';

/**
 * CLIENT-SIDE PREDICTION AND RECONCILIATION
 *
 * Problem: with a 150 ms round trip, waiting for the server to tell you where
 * you are makes your own character react 150 ms after every key press.
 *
 * Idea: the client runs the very same `applyInput` the server runs, right
 * away, and remembers every input the server hasn't confirmed yet.
 *
 *   you press D ──► predict locally (instant) ──► send input #42
 *                                                    │
 *   snapshot arrives: "state after input #39" ◄──────┘ (one RTT later)
 *
 * When a snapshot says "this is you after input #39", the client:
 *   1. forgets inputs ≤ 39 (the server has them),
 *   2. starts from the server's version of the player (authoritative),
 *   3. re-applies inputs #40, #41, #42 on top of it.
 *
 * If nothing unexpected happened, the result equals what we had already
 * predicted and nothing visibly changes. If the server disagreed (we got
 * hit, a dead battery froze us, packets were lost…), we end up exactly where
 * the server says plus our not-yet-acknowledged movement: corrected without
 * losing responsiveness.
 */
export class PredictionBuffer {
  private pending: PlayerInput[] = [];

  /** Remembers an input that was just applied locally and sent. */
  push(input: PlayerInput): void {
    this.pending.push(input);
  }

  /** Drops every input the server has confirmed (seq ≤ lastProcessedSeq). */
  acknowledge(lastProcessedSeq: number): void {
    let i = 0;
    while (i < this.pending.length && (this.pending[i] as PlayerInput).seq <= lastProcessedSeq) i++;
    if (i > 0) this.pending = this.pending.slice(i);
  }

  /** Inputs sent but not confirmed, oldest first. */
  unacknowledged(): readonly PlayerInput[] {
    return this.pending;
  }

  /** The newest `n` unacknowledged inputs: what we (re)send in every packet. */
  newest(n: number): PlayerInput[] {
    return this.pending.slice(-n);
  }

  get size(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending = [];
  }
}

/**
 * Rebuilds the local player's predicted state from an authoritative snapshot
 * plus the inputs the server hasn't processed yet. Pure: returns a new player.
 *
 * The freeze rule (countdown, dead battery…) is evaluated with the snapshot's
 * state, the best knowledge the client has of what the server will decide.
 */
export function reconcile(
  serverState: MatchState,
  playerId: string,
  pending: readonly PlayerInput[],
  map: ArenaMap,
): PlayerState | null {
  const authoritative = serverState.players.find((p) => p.id === playerId);
  if (!authoritative) return null;
  const predicted = clonePlayer(authoritative);
  const frozen = isInputBlocked(serverState, authoritative);
  for (const input of pending) applyInput(predicted, input, map, { frozen });
  return predicted;
}

/** Applies one freshly sampled input to the predicted player (mutates it). */
export function predictStep(
  predicted: PlayerState,
  input: PlayerInput,
  lastKnownState: MatchState,
  map: ArenaMap,
): InputOutcome {
  return applyInput(predicted, input, map, { frozen: isInputBlocked(lastKnownState, predicted) });
}
