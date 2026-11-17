import { useEffect, useRef } from 'react';
import { GameClient } from '../game/GameClient';
import { resetHud } from '../game/hudStore';
import type { GameSession } from '../game/session';

interface Props {
  /** Creates the session when the canvas mounts; disposed on unmount. */
  createSession: () => GameSession;
  onKey?: (code: string) => void;
}

/** Mounts the Pixi canvas. Pixi init is async, so StrictMode double-mounts are handled. */
export function GameCanvas({ createSession, onKey }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const client = useRef<GameClient | null>(null);
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    resetHud();
    const session = createSession();
    GameClient.create(el, session).then((c) => {
      if (cancelled) {
        c.destroy();
        return;
      }
      c.onKey = (code) => onKeyRef.current?.(code);
      client.current = c;
    });
    return () => {
      cancelled = true;
      client.current?.destroy();
      client.current = null;
    };
  }, [createSession]);

  return <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }} />;
}
