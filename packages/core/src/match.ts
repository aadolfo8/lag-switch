import { MATCH, PICKUPS, PLAYER, TICK_MS, WEAPONS } from './config.js';
import { distance } from './math.js';
import { applyInput, createPlayer, isAlive } from './player.js';
import { SABOTAGES } from './sabotages/index.js';
import type {
  ArenaMap,
  GameEvent,
  MatchState,
  PlayerInput,
  PlayerState,
  SabotageId,
} from './types.js';
import { muzzleOf, type ShotTarget, traceShot } from './weapons.js';

export interface StepOptions {
  map: ArenaMap;
  /**
   * Lag compensation hook. Given the shooter, returns where every OTHER player
   * was at the moment the shooter saw them. The server answers from its
   * position history; local play (no network) leaves it out and uses the
   * present.
   */
  rewindTargets?: (shooter: PlayerState) => ShotTarget[];
}

export function createMatch(map: ArenaMap): MatchState {
  return {
    tick: 0,
    time: 0,
    phase: 'waiting',
    phaseEndsAt: null,
    round: 0,
    scores: {},
    players: [],
    pickups: map.pickupSpots.map((s, i) => ({
      id: `pk${i}`,
      kind: s.kind,
      pos: { ...s.pos },
      respawnAt: null,
    })),
    lastRoundWinner: null,
    matchWinner: null,
  };
}

export const findPlayer = (s: MatchState, id: string): PlayerState | undefined =>
  s.players.find((p) => p.id === id);

export const opponentOf = (s: MatchState, id: string): PlayerState | undefined =>
  s.players.find((p) => p.id !== id);

/** Adds a player; the match starts on its own when the second one joins. */
export function addPlayer(s: MatchState, map: ArenaMap, id: string, name: string): GameEvent[] {
  if (s.players.length >= 2) throw new Error('match is full');
  const spawn = map.spawns[s.players.length] ?? map.spawns[0] ?? { x: 0, y: 0 };
  s.players.push(createPlayer(id, name, spawn));
  s.scores[id] = 0;
  return s.players.length === 2 ? startRound(s, map) : [];
}

export function removePlayer(s: MatchState, id: string): void {
  s.players = s.players.filter((p) => p.id !== id);
  delete s.scores[id];
  if (s.phase !== 'matchEnd') {
    s.phase = 'waiting';
    s.phaseEndsAt = null;
  }
}

/** Puts both players back on their spawns and starts the countdown. */
export function startRound(s: MatchState, map: ArenaMap): GameEvent[] {
  s.round += 1;
  s.players.forEach((p, i) => {
    const fresh = createPlayer(p.id, p.name, map.spawns[i] ?? p.pos);
    fresh.connected = p.connected;
    // Face the centre of the arena so nobody starts staring at a wall.
    fresh.aim = Math.atan2(map.size.y / 2 - fresh.pos.y, map.size.x / 2 - fresh.pos.x);
    s.players[i] = fresh;
  });
  for (const pk of s.pickups) pk.respawnAt = null;
  s.phase = 'countdown';
  s.phaseEndsAt = s.time + MATCH.countdownMs;
  s.lastRoundWinner = null;
  return [];
}

/** Rematch: same players, scores back to zero. */
export function resetMatch(s: MatchState, map: ArenaMap): GameEvent[] {
  for (const id of Object.keys(s.scores)) s.scores[id] = 0;
  s.round = 0;
  s.matchWinner = null;
  return s.players.length === 2 ? startRound(s, map) : [];
}

export function endRound(
  s: MatchState,
  winner: string | null,
  reason: 'kill' | 'timeout' | 'forfeit',
): GameEvent[] {
  const events: GameEvent[] = [{ type: 'roundEnd', round: s.round, winner, reason }];
  s.lastRoundWinner = winner;
  if (winner !== null) s.scores[winner] = (s.scores[winner] ?? 0) + 1;

  if (winner !== null && (s.scores[winner] ?? 0) >= MATCH.roundsToWin) {
    s.phase = 'matchEnd';
    s.phaseEndsAt = null;
    s.matchWinner = winner;
    events.push({ type: 'matchEnd', winner });
  } else {
    s.phase = 'roundEnd';
    s.phaseEndsAt = s.time + MATCH.roundEndMs;
  }
  return events;
}

/** Applies a sabotage to the victim's state. The network side lives in the server. */
export function applySabotage(s: MatchState, by: string, kind: SabotageId): GameEvent[] {
  const victim = opponentOf(s, by);
  if (!victim) return [];
  const { durationMs } = SABOTAGES[kind];
  victim.activeEffects = victim.activeEffects.filter((e) => e.id !== kind);
  victim.activeEffects.push({ id: kind, until: s.time + durationMs });
  return [{ type: 'sabotage', by, target: victim.id, kind, durationMs }];
}

/** True when the player's inputs must be ignored this step. */
export const isInputBlocked = (s: MatchState, p: PlayerState): boolean =>
  s.phase !== 'playing' || p.activeEffects.some((e) => SABOTAGES[e.id].blocksInput);

/**
 * Advances the whole match by one fixed tick. This is the authoritative step:
 * the server runs it 30 times a second; local play runs it in the browser.
 *
 * `inputs` holds, per player, the inputs to apply this tick in seq order
 * (usually one; more after a burst; none when the player's packets are late).
 * Mutates `s` and returns what happened, for effects and sounds.
 */
export function stepMatch(
  s: MatchState,
  inputs: ReadonlyMap<string, readonly PlayerInput[]>,
  opts: StepOptions,
): GameEvent[] {
  const { map } = opts;
  const events: GameEvent[] = [];
  s.tick += 1;
  s.time = s.tick * TICK_MS;

  // --- phase timers ---
  if (s.phaseEndsAt !== null && s.time >= s.phaseEndsAt) {
    if (s.phase === 'countdown') {
      s.phase = 'playing';
      s.phaseEndsAt = s.time + MATCH.roundDurationMs;
      events.push({ type: 'roundStart', round: s.round });
    } else if (s.phase === 'playing') {
      events.push(...endRound(s, timeoutWinner(s), 'timeout'));
    } else if (s.phase === 'roundEnd') {
      events.push(...startRound(s, map));
    }
  }

  // --- effects wear off ---
  for (const p of s.players) p.activeEffects = p.activeEffects.filter((e) => e.until > s.time);

  // --- pickups come back ---
  for (const pk of s.pickups) {
    if (pk.respawnAt !== null && s.time >= pk.respawnAt) pk.respawnAt = null;
  }

  // --- players act, in seq order ---
  // Every input is consumed even when it can't do anything (countdown, dead
  // battery, round just ended): the server acknowledges it either way, and the
  // client's prediction applies the very same freeze. Once a kill ends the
  // round mid-tick, later inputs this tick are frozen, so the first shot
  // processed wins a perfect trade.
  for (const p of s.players) {
    for (const input of inputs.get(p.id) ?? []) {
      const frozen = isInputBlocked(s, p);
      const out = applyInput(p, input, map, { frozen });
      if (out.reloadStarted) events.push({ type: 'reload', by: p.id });
      if (out.fired) events.push(...resolveFire(s, p, opts));
      if (!frozen && input.useSabotage && p.sabotageSlot) {
        events.push(...applySabotage(s, p.id, p.sabotageSlot));
        p.sabotageSlot = null;
      }
    }
  }

  // --- pickups are collected ---
  if (s.phase === 'playing') {
    for (const p of s.players) {
      if (!isAlive(p) || p.sabotageSlot) continue;
      const pk = s.pickups.find(
        (k) => k.respawnAt === null && distance(k.pos, p.pos) < PLAYER.radius + PICKUPS.radius,
      );
      if (pk) {
        p.sabotageSlot = pk.kind;
        pk.respawnAt = s.time + PICKUPS.respawnMs;
        events.push({ type: 'pickup', by: p.id, kind: pk.kind });
      }
    }
  }

  return events;
}

function resolveFire(s: MatchState, shooter: PlayerState, opts: StepOptions): GameEvent[] {
  const origin = muzzleOf(shooter.pos, shooter.aim);
  const targets =
    opts.rewindTargets?.(shooter) ??
    s.players
      .filter((p) => p.id !== shooter.id && isAlive(p))
      .map((p): ShotTarget => ({ id: p.id, pos: { ...p.pos } }));

  const pellets = traceShot(origin, shooter.aim, shooter.weapon, opts.map.walls, targets);
  const events: GameEvent[] = [
    {
      type: 'shot',
      by: shooter.id,
      weapon: shooter.weapon,
      from: origin,
      to: pellets.map((r) => r.end),
    },
  ];

  const damage = WEAPONS[shooter.weapon].damage;
  for (const pellet of pellets) {
    if (!pellet.hit) continue;
    const target = findPlayer(s, pellet.hit);
    if (!target || !isAlive(target)) continue;
    target.hp = Math.max(0, target.hp - damage);
    events.push({ type: 'hit', by: shooter.id, target: target.id, damage, pos: pellet.end });
    if (!isAlive(target)) {
      events.push({ type: 'kill', by: shooter.id, target: target.id });
      events.push(...endRound(s, shooter.id, 'kill'));
      break;
    }
  }
  return events;
}

/** On timeout the healthier player takes the round; equal hp is a draw. */
function timeoutWinner(s: MatchState): string | null {
  const [a, b] = s.players;
  if (!a || !b || a.hp === b.hp) return null;
  return a.hp > b.hp ? a.id : b.id;
}

/** Seconds left on the current phase timer, for HUDs. */
export const phaseSecondsLeft = (s: MatchState): number =>
  s.phaseEndsAt === null ? 0 : Math.max(0, Math.ceil((s.phaseEndsAt - s.time) / 1000));
