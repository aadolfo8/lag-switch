import { SABOTAGE } from '../config.js';
import type { Sabotage } from './types.js';

const cfg = SABOTAGE.deadBattery;

export const deadBattery: Sabotage = {
  id: 'deadBattery',
  name: 'dead controller battery',
  tagline: `their inputs are ignored for ${cfg.durationMs / 1000} s`,
  durationMs: cfg.durationMs,
  applyToConditioner() {
    // Nothing to do to the network: the inputs DO arrive. The simulation
    // ignores them (see blocksInput / isInputBlocked in match.ts).
  },
  blocksInput: true,
  closesSocket: false,
  clientEffect: {
    filter: 'controller',
    note: 'Your controller died.',
    detail: `inputs ignored for ${cfg.durationMs / 1000} s`,
  },
  explainCard: {
    lead: `For ${cfg.durationMs / 1000} seconds the server ignored everything you pressed.`,
    paragraphs: [
      'Your inputs still reached the server. It just threw them away: the server has the final word on what happens, not your game.',
      'Your game kept predicting your movement until the next snapshot said you hadn’t moved. The snap back you felt was reconciliation correcting a prediction the server had rejected.',
      'This is also why cheating by editing the client goes nowhere in an authoritative game: the client only sends wishes.',
    ],
    diagram: 'authority',
    concept: 'inputs versus server authority',
  },
};
