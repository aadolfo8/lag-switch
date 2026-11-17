import { useEffect, useRef } from 'react';
import { GameClient } from '../game/GameClient';
import { resetHud } from '../game/hudStore';
import type { GameSession } from '../game/session';

interface Props {
  /** Creates the session when the canvas mounts; disposed on unmount. */
  createSession: () => GameSession;
  onKey?: (code: string) => void;
}

/**
 * Mounts the Pixi canvas. Pixi's init is async, so an unmount can happen
 * before the client exists (React StrictMode does exactly that in dev). The
 * session is disposed right away in that case: a NetSession left alive would
 * join the room as a ghost player.
 */
export function GameCanvas({ createSession, onKey }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let client: GameClient | null = null;
    resetHud();
    const session = createSession();

    GameClient.create(el, session).then((c) => {
      if (cancelled) {
        c.destroy();
        return;
      }
      c.onKey = (code) => onKeyRef.current?.(code);
      client = c;
    });

    return () => {
      cancelled = true;
      if (client) client.destroy();
      else session.dispose();
    };
  }, [createSession]);

  return <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }} />;
}
