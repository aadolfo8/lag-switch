import type { SabotageId } from '../types.js';

/**
 * What can be done to a connection. The server's NetworkConditioner
 * implements these; core only describes them.
 */
export interface NetworkConditions {
  /** Added one-way delay (ms). */
  delayMs: number;
  /** Extra random delay in [0, jitterMs). */
  jitterMs: number;
  /** Probability in [0, 1] that a message is dropped. */
  lossRate: number;
  /** Nothing gets through at all. */
  blocked: boolean;
}

/** The part of a conditioner a sabotage is allowed to touch. */
export interface ConditionerControls {
  /** Adds a named overlay; the server removes it when the effect wears off. */
  apply(id: string, conditions: Partial<NetworkConditions>): void;
}

/** Canvas filter the victim sees while the effect lasts. */
export type ClientFilter = 'rgbSplit' | 'glitch' | 'blackout' | 'controller';

/** Which timeline sketch the "What just happened?" card draws. */
export type ExplainDiagram = 'latency' | 'loss' | 'reconnect' | 'authority';

export interface ExplainCard {
  /** One-line summary under the title. */
  lead: string;
  paragraphs: string[];
  diagram: ExplainDiagram;
  /** The networking concept, named. */
  concept: string;
}

/**
 * Every sabotage implements this. Adding a new one means adding a file in
 * this folder (and its id to SabotageId): the server, the client and the
 * menu all read from the registry.
 */
export interface Sabotage {
  id: SabotageId;
  /** Display name, lower case, hand-written style. */
  name: string;
  /** One line for the menu's arsenal list. */
  tagline: string;
  durationMs: number;
  /** Changes the victim's link. Called by the server when the effect starts. */
  applyToConditioner(conditioner: ConditionerControls): void;
  /** The simulation ignores the victim's inputs while active. */
  blocksInput: boolean;
  /** The server closes the victim's socket and refuses reconnects while active. */
  closesSocket: boolean;
  /** What the victim sees. */
  clientEffect: {
    filter: ClientFilter;
    /** Notebook note, e.g. "Mom just rebooted the Wi-Fi." */
    note: string;
    detail: string;
  };
  /** Shown between rounds to whoever suffered it. */
  explainCard: ExplainCard;
}
