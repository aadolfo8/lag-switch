import { sound } from '@pixi/sound';
import { readLocal, writeLocal } from '../../lib/storage';

/**
 * Every sound in the game is synthesised here, in a few lines of maths, and
 * handed to @pixi/sound as a WAV buffer. No audio files to host or license,
 * and the whole soundscape weighs nothing.
 */

const RATE = 22050;
const MUTE_KEY = 'lagswitch.muted';

type Synth = (t: number, i: number) => number;

/** Renders `seconds` of a synth function into samples in [-1, 1]. */
function render(seconds: number, fn: Synth): Float32Array {
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, fn(i / RATE, i)));
  return out;
}

/** 16-bit mono PCM WAV. */
function wav(samples: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    v.setInt16(44 + i * 2, s * 0x7fff, true);
  });
  return buf;
}

// deterministic noise so the sounds are identical on every load
let seed = 1;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647) * 2 - 1;
};
const sine = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);
const decay = (t: number, k: number) => Math.exp(-t * k);

/** One-pole low-pass, to take the fizz off white noise. */
function lowpass(fn: Synth, amount: number): Synth {
  let prev = 0;
  return (t, i) => {
    prev += (fn(t, i) - prev) * amount;
    return prev;
  };
}

const SOUNDS = {
  pistol: render(
    0.12,
    lowpass(
      (t) => noise() * decay(t, 38) * 0.9 + sine(140 - t * 400, t) * decay(t, 30) * 0.7,
      0.45,
    ),
  ),
  shotgun: render(
    0.26,
    lowpass((t) => noise() * decay(t, 16) + sine(80 - t * 120, t) * decay(t, 14) * 0.9, 0.3),
  ),
  hit: render(0.07, (t) => sine(980, t) * decay(t, 70) * 0.6),
  hurt: render(
    0.18,
    lowpass((t) => sine(95, t) * decay(t, 18) + noise() * decay(t, 40) * 0.5, 0.5),
  ),
  reload: render(0.2, (t) => (t < 0.02 || (t > 0.12 && t < 0.14) ? noise() * 0.5 : 0)),
  swap: render(0.05, (t) => noise() * decay(t, 90) * 0.4),
  pickup: render(0.24, (t) => {
    const f = t < 0.08 ? 523 : t < 0.16 ? 659 : 784;
    return Math.sign(sine(f, t)) * 0.18 * decay(t % 0.08, 18);
  }),
  sabotage: render(0.36, (t) => {
    const step = Math.floor(t * 40);
    const f = 180 + ((step * 7919) % 11) * 45;
    const crushed = Math.round(sine(f, t) * 3) / 3;
    return crushed * 0.3 * decay(t, 4);
  }),
  roundStart: render(0.7, (t) => (sine(660, t) * 0.5 + sine(990, t) * 0.25) * decay(t, 5) * 0.5),
  roundEnd: render(0.5, (t) => sine(440 - t * 360, t) * decay(t, 5) * 0.4),
} satisfies Record<string, Float32Array>;

export type SoundId = keyof typeof SOUNDS;

let loaded = false;

/** Registers every sound with @pixi/sound. Cheap; safe to call more than once. */
export function loadSounds(): void {
  if (loaded) return;
  loaded = true;
  for (const [id, samples] of Object.entries(SOUNDS)) {
    sound.add(id, { source: wav(samples), preload: true, volume: 0.5 });
  }
  if (readLocal(MUTE_KEY) === '1') sound.muteAll();
}

export function play(id: SoundId, opts: { volume?: number; speed?: number } = {}): void {
  if (!loaded || !sound.exists(id)) return;
  try {
    sound.play(id, opts);
  } catch {
    // Audio is a nicety: never let it break the game (e.g. before a user gesture).
  }
}

export function toggleMute(): boolean {
  const muted = sound.toggleMuteAll();
  writeLocal(MUTE_KEY, muted ? '1' : '0');
  return muted;
}

export const isMuted = () => readLocal(MUTE_KEY) === '1';
