import { z } from 'zod';
import { ROOMS } from './config.js';
import type { ArenaMap, GameEvent, MatchState, PlayerInput, SabotageId } from './types.js';

/**
 * Wire protocol: JSON text frames over a plain WebSocket, one message per
 * frame, discriminated by `type`.
 *
 * Client → server messages are validated with Zod on arrival: the server
 * never trusts the shape, the ranges or the size of anything a client sends.
 * Server → client messages are only typed: the client trusts its server.
 */

// ---------------------------------------------------------------- client → server

const finite = z.number().refine(Number.isFinite, 'must be finite');

export const PlayerInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  move: z.object({ x: finite.min(-1).max(1), y: finite.min(-1).max(1) }),
  aim: finite,
  shoot: z.boolean(),
  reload: z.boolean(),
  switchWeapon: z.boolean(),
  useSabotage: z.boolean(),
}) satisfies z.ZodType<PlayerInput>;

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOMS.codeLength)
  .regex(new RegExp(`^[${ROOMS.codeAlphabet}]+$`), 'not a valid room code');

/** Max inputs per message; see MAX_REDUNDANT_INPUTS. */
export const MAX_INPUTS_PER_MESSAGE = 8;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    code: RoomCodeSchema,
    name: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .regex(/^[\p{L}\p{N} _.-]+$/u, 'letters, numbers, spaces, _ . - only'),
    reconnectToken: z.string().max(64).optional(),
    /**
     * Testing aid (?lag=150 in the URL): the server adds this much simulated
     * round-trip latency to this player's own connection. It can only make
     * things worse for whoever asks for it.
     */
    lagMs: z.number().int().min(0).max(1000).optional(),
  }),
  z.object({
    type: z.literal('input'),
    /**
     * The newest inputs the server has not acknowledged yet, oldest first.
     * Sending a few recent ones in every packet means a lost packet rarely
     * loses an input: the next packet carries it again.
     */
    inputs: z.array(PlayerInputSchema).min(1).max(MAX_INPUTS_PER_MESSAGE),
  }),
  z.object({
    type: z.literal('ping'),
    t: finite,
    /** The client's last measured round trip, used by the server for lag compensation. */
    rtt: finite.min(0).max(5000).optional(),
  }),
  z.object({ type: z.literal('rematch') }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------- server → client

export type ErrorCode =
  | 'bad_message'
  | 'room_not_found'
  | 'room_full'
  | 'already_joined'
  | 'not_joined'
  /** Your connection is "down" (Wi-Fi reset sabotage): try again in a moment. */
  | 'offline';

export type ServerMessage =
  | {
      type: 'welcome';
      playerId: string;
      reconnectToken: string;
      map: ArenaMap;
      tickRate: number;
      snapshotRate: number;
      /** True when this join resumed an existing seat (after a dropped connection). */
      resumed: boolean;
    }
  | {
      type: 'snapshot';
      tick: number;
      /** Highest input seq of THIS client the server has applied. Drives reconciliation. */
      lastProcessedSeq: number;
      state: MatchState;
      /** Everything that happened since the previous snapshot sent to this client. */
      events: GameEvent[];
    }
  | { type: 'sabotage'; kind: SabotageId; by: string; durationMs: number }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'error'; code: ErrorCode; message?: string };

/** Parses and validates one raw frame from a client. Never throws. */
export function parseClientMessage(
  raw: string,
): { ok: true; msg: ClientMessage } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  const result = ClientMessageSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'invalid message' };
  }
  return { ok: true, msg: result.data };
}
