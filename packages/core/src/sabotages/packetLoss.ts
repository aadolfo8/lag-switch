import { SABOTAGE } from '../config.js';
import type { Sabotage } from './types.js';

const cfg = SABOTAGE.packetLoss;
const pct = Math.round(cfg.lossRate * 100);

export const packetLoss: Sabotage = {
  id: 'packetLoss',
  name: 'packet loss',
  tagline: `${pct} % of their messages vanish`,
  durationMs: cfg.durationMs,
  applyToConditioner(c) {
    c.apply('packetLoss', { lossRate: cfg.lossRate });
  },
  blocksInput: false,
  closesSocket: false,
  clientEffect: {
    filter: 'glitch',
    note: 'Your packets are vanishing.',
    detail: `${pct} % loss for ${cfg.durationMs / 1000} s`,
  },
  explainCard: {
    lead: `About 1 in ${Math.round(1 / cfg.lossRate)} messages between you and the server simply disappeared.`,
    paragraphs: [
      'Your inputs mostly survived: every packet also carries your previous inputs, so one only gets lost if several packets in a row go missing.',
      'Snapshots survived too, in a different way. Each one is a complete picture of the game, so losing one never breaks the next. Your rival is drawn 100 ms in the past, which usually leaves a later snapshot to glide towards.',
      'So you saw a few hitches, not a broken game. Protocols that only send what changed (deltas) need acknowledgements to stay correct when packets disappear; full snapshots trade bandwidth for that robustness.',
    ],
    diagram: 'loss',
    concept: 'packet loss and full snapshots',
  },
};
