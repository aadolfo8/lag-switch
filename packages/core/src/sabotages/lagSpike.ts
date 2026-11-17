import { SABOTAGE } from '../config.js';
import type { Sabotage } from './types.js';

const cfg = SABOTAGE.lagSpike;

export const lagSpike: Sabotage = {
  id: 'lagSpike',
  name: 'lag spike',
  tagline: `+${cfg.delayMsEachWay * 2} ms on your rival’s ping`,
  durationMs: cfg.durationMs,
  applyToConditioner(c) {
    // Both directions: the victim's inputs arrive late AND they see the game late.
    c.apply('lagSpike', { delayMs: cfg.delayMsEachWay });
  },
  blocksInput: false,
  closesSocket: false,
  clientEffect: {
    filter: 'rgbSplit',
    note: 'Lag spike!',
    detail: `+${cfg.delayMsEachWay * 2} ms ping for ${cfg.durationMs / 1000} s`,
  },
  explainCard: {
    lead: `Your connection got ${cfg.delayMsEachWay * 2} ms slower for ${cfg.durationMs / 1000} seconds.`,
    paragraphs: [
      `Every message between you and the server took an extra ${cfg.delayMsEachWay} ms each way. Your inputs reached the server late, and its snapshots reached you late.`,
      'You still moved instantly: your game predicts your own movement and corrects it when the server answers. Your rival, though, was drawn where they were half a second ago.',
      'The server rewinds your shots to what you saw, but only up to 250 ms, so many of yours landed behind them. That cap is on purpose: it stops laggy players hitting people who already reached cover.',
    ],
    diagram: 'latency',
    concept: 'latency and lag compensation',
  },
};
