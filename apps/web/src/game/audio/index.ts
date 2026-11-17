import type { SoundId } from './sfx';

/**
 * Audio is loaded on the first key press or click: browsers refuse to start
 * an AudioContext before a user gesture, and this also keeps @pixi/sound and
 * the synthesiser out of the initial bundle.
 */
let sfx: typeof import('./sfx') | null = null;
let loading = false;

export function unlockAudio(): void {
  if (sfx || loading) return;
  loading = true;
  import('./sfx').then((m) => {
    m.loadSounds();
    sfx = m;
  });
}

export const play = (id: SoundId, opts?: { volume?: number; speed?: number }) =>
  sfx?.play(id, opts);
export const toggleMute = () => sfx?.toggleMute();
