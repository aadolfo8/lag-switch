import type { SabotageId } from '../types.js';
import { deadBattery } from './deadBattery.js';
import { lagSpike } from './lagSpike.js';
import { packetLoss } from './packetLoss.js';
import type { Sabotage } from './types.js';
import { wifiReset } from './wifiReset.js';

export type * from './types.js';

/** Every sabotage in the game, by id. */
export const SABOTAGES: Record<SabotageId, Sabotage> = {
  lagSpike,
  packetLoss,
  wifiReset,
  deadBattery,
};

export const SABOTAGE_LIST: Sabotage[] = Object.values(SABOTAGES);
