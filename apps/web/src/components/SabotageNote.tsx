import { SABOTAGE, SABOTAGES, type SabotageId } from '@lag-switch/core';
import { AnimatePresence, motion } from 'motion/react';
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
  const shown = offline
    ? []
    : effects.filter((e): e is Exclude<SabotageId, 'wifiReset'> => e !== 'wifiReset');

  const wifi = offline?.reason === 'wifiReset';
  const elapsed = offline ? now - offline.since : 0;
  const progress = wifi ? Math.min(1, elapsed / SABOTAGE.wifiReset.durationMs) : null;

  return (
    <>
      <AnimatePresence>
        {offline && (
          <div className="sab-center" key="offline">
            <motion.div
              className="sab-note sab-note--big"
              role="status"
              initial={{ opacity: 0, scale: 0.9, rotate: -6, y: 30 }}
              animate={{ opacity: 1, scale: 1, rotate: -2, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -20 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              <div className="sab-note-head">
                <SabotageIcon kind="wifiReset" size={56} />
                <h2>{wifi ? SABOTAGES.wifiReset.clientEffect.note : 'Connection lost.'}</h2>
              </div>
              <p>
                {wifi ? SABOTAGES.wifiReset.clientEffect.detail : 'Trying to get your seat back…'}
              </p>
              <div className="sab-progress">
                <div className="sab-bar" aria-hidden="true">
                  <span style={{ width: `${(progress ?? (elapsed % 1000) / 1000) * 100}%` }} />
                </div>
                <span className="sab-mono">reconnecting · {(elapsed / 1000).toFixed(1)} s</span>
              </div>
              <span className="sab-mono sab-muted">
                attempt {attempt} · the server keeps your seat for 10 s, then resyncs you with a
                full snapshot
              </span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="sab-stack" role="status">
        <AnimatePresence>
          {shown.map((id) => (
            <motion.div
              key={id}
              className="sab-note sab-note--small"
              initial={{ opacity: 0, y: -16, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: -1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <SabotageIcon kind={id} size={32} />
              <div>
                <strong>{SABOTAGES[id].clientEffect.note}</strong>
                <span>{SABOTAGES[id].clientEffect.detail}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
