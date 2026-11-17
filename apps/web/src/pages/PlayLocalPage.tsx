import { useCallback } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { HudBottom, HudTop } from '../components/Hud';
import { MatchEnd, RoundBanner, Toasts } from '../components/Overlays';
import { LocalSession } from '../game/LocalSession';

/**
 * Offline sandbox: the full simulation runs in the browser against a dummy.
 * No server involved, which makes it a good place to tune weapons.
 */
export function PlayLocalPage() {
  const createSession = useCallback(() => new LocalSession('you'), []);
  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <h1 className="visually-hidden">Lag Switch: offline sandbox</h1>
      <GameCanvas createSession={createSession} />
      <HudTop />
      <HudBottom />
      <RoundBanner />
      <Toasts />
      <MatchEnd vsBot />
    </main>
  );
}
