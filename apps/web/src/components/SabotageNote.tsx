import { SABOTAGE, SABOTAGES, type SabotageId } from '@lag-switch/core';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHud } from '../game/hudStore';
import { useNet } from '../game/netStore';
import { SabotageIcon } from './SabotageIcon';
import './sabotage.css';

/** Re-renders every animation frame while mounted (for progress bars). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

/**
 * The victim's side of a sabotage: a notebook note saying what is going on.
 * The Wi-Fi reset gets the big centred note (you can't play anyway); the
 * others get a small one so you can keep fighting through them.
 */
export function SabotageNote() {
  const offline = useNet((s) => s.offline);
  const attempt = useNet((s) => s.reconnectAttempt);
  // useShallow: a fresh array with the same items must not re-render (or loop).
  const effects = useHud(useShallow((s) => s.you?.effects ?? []));
  const now = useNow(offline !== null);

  if (offline) {
    const wifi = offline.reason === 'wifiReset';
    const elapsed = now - offline.since;
    const progress = wifi ? Math.min(1, elapsed / SABOTAGE.wifiReset.durationMs) : null;
    return (
      <div className="sab-note sab-note--big" role="status">
        <div className="sab-note-head">
          <SabotageIcon kind="wifiReset" size={56} />
          <h2>{wifi ? SABOTAGES.wifiReset.clientEffect.note : 'Connection lost.'}</h2>
        </div>
        <p>{wifi ? SABOTAGES.wifiReset.clientEffect.detail : 'Trying to get your seat back…'}</p>
        <div className="sab-progress">
          <div className="sab-bar" aria-hidden="true">
            <span style={{ width: `${(progress ?? (elapsed % 1000) / 1000) * 100}%` }} />
          </div>
          <span className="sab-mono">reconnecting · {(elapsed / 1000).toFixed(1)} s</span>
        </div>
        <span className="sab-mono sab-muted">
          attempt {attempt} · the server keeps your seat for 10 s, then resyncs you with a full
          snapshot
        </span>
      </div>
    );
  }

  const shown = effects.filter((e): e is Exclude<SabotageId, 'wifiReset'> => e !== 'wifiReset');
  if (shown.length === 0) return null;

  return (
    <div className="sab-stack" role="status">
      {shown.map((id) => (
        <div key={id} className="sab-note sab-note--small">
          <SabotageIcon kind={id} size={32} />
          <div>
            <strong>{SABOTAGES[id].clientEffect.note}</strong>
            <span>{SABOTAGES[id].clientEffect.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
