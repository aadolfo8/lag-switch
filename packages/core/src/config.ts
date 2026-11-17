/**
 * Every tunable number of the game lives here, so balancing never means
 * hunting through the simulation code. Times are in milliseconds unless the
 * name says otherwise; distances are in world units (1 unit = 1 CSS px at zoom 1).
 */
export const NET = {
  /** Fixed simulation rate of the authoritative server. */
  tickRate: 30,
  /** How many full-state snapshots per second each client receives. */
  snapshotRate: 20,
  /** Remote entities are rendered this far in the past, between two snapshots. */
  interpolationDelayMs: 100,
  /** How much position history the server keeps for lag compensation. */
  historyMs: 1000,
  /** Lag compensation never rewinds further than this (anti-abuse cap). */
  maxRewindMs: 250,
  /** A disconnected player has this long to come back before losing the round. */
  reconnectGraceMs: 10_000,
} as const;

export const PLAYER = {
  radius: 16,
  maxHp: 100,
  /** Top speed in units per second. */
  speed: 220,
} as const;

export const WEAPONS = {
  pistol: {
    magazine: 12,
    damage: 25,
    pellets: 1,
    spreadRad: 0,
    cooldownMs: 250,
    range: 900,
  },
  shotgun: {
    magazine: 6,
    damage: 12,
    pellets: 5,
    spreadRad: 0.35,
    cooldownMs: 700,
    range: 420,
  },
} as const;

export const RELOAD_MS = 1200;

export const MATCH = {
  roundsToWin: 3, // best of 5
  maxRounds: 5,
  roundDurationMs: 60_000,
  countdownMs: 3000,
  roundEndMs: 5000,
} as const;

export const PICKUPS = {
  respawnMs: 15_000,
  radius: 22,
} as const;

export const ROOMS = {
  codeLength: 5,
  /** No 0/O and no 1/I: a code read aloud or from a screenshot is never ambiguous. */
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  idleExpiryMs: 10 * 60_000,
} as const;
