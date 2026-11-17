import { describe, expect, it } from 'vitest';
import { MATCH, NET, ROOMS } from './config.js';

describe('config', () => {
  it('sends snapshots no faster than the simulation ticks', () => {
    expect(NET.snapshotRate).toBeLessThanOrEqual(NET.tickRate);
  });

  it('keeps enough history to cover the maximum rewind', () => {
    expect(NET.historyMs).toBeGreaterThan(NET.maxRewindMs);
  });

  it('is a best of 5', () => {
    expect(MATCH.roundsToWin * 2 - 1).toBe(MATCH.maxRounds);
  });

  it('room codes avoid ambiguous characters', () => {
    expect(ROOMS.codeAlphabet).not.toMatch(/[0O1I]/);
  });
});
