import { SABOTAGE } from '../config.js';
import type { Sabotage } from './types.js';

const cfg = SABOTAGE.wifiReset;

export const wifiReset: Sabotage = {
  id: 'wifiReset',
  name: 'mom reboots the wi-fi',
  tagline: `${cfg.durationMs / 1000} s disconnect, then resync`,
  durationMs: cfg.durationMs,
  applyToConditioner(c) {
    // Belt and braces: the server also closes the socket for real (closesSocket).
    // Blocking drops anything still in flight to or from the old connection.
    c.apply('wifiReset', { blocked: true });
  },
  blocksInput: false,
  closesSocket: true,
  clientEffect: {
    filter: 'blackout',
    note: 'Mom just rebooted the Wi-Fi.',
    detail: 'Your game is frozen. Theirs isn’t.',
  },
  explainCard: {
    lead: `Your connection dropped for ${cfg.durationMs / 1000} seconds. The server really closed your socket.`,
    paragraphs: [
      'The server didn’t wait for you: it is the referee, and the match kept going.',
      'Your game reconnected using a secret token the server gave you when you joined, so you got your own seat back: same player, same score.',
      'Instead of replaying everything you missed, the server sent one full snapshot: where everyone is right now. That’s why you “teleported” when the screen came back. Real games do exactly this.',
    ],
    diagram: 'reconnect',
    concept: 'disconnection, reconnection and resync',
  },
};
