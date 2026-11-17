import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { DebugOverlay } from '../components/DebugOverlay';
import { GameCanvas } from '../components/GameCanvas';
import { HudBottom, HudTop } from '../components/Hud';
import { SabotageNote } from '../components/SabotageNote';
import { NetSession } from '../game/NetSession';
import { toggleDebug, useNet } from '../game/netStore';
import { copyText, roomLink } from '../lib/share';
import { getPlayerName } from '../lib/storage';
import './room.css';

const ERRORS: Record<string, string> = {
  room_not_found: 'That room doesn’t exist (or it expired after 10 minutes empty).',
  room_full: 'That room already has two players.',
};

interface Props {
  code: string;
  created: boolean;
  /** Simulated round-trip latency (?lag=150), for testing the netcode. */
  lagMs?: number | undefined;
}

export function RoomPage({ code, created, lagMs }: Props) {
  const createSession = useCallback(
    () => new NetSession({ code, name: getPlayerName(), ...(lagMs && { lagMs }) }),
    [code, lagMs],
  );
  const onKey = useCallback((k: string) => {
    if (k === 'F3') toggleDebug();
  }, []);

  return (
    <main className="play">
      <h1 className="visually-hidden">Lag Switch: room {code}</h1>
      <GameCanvas createSession={createSession} onKey={onKey} />
      <HudTop />
      <HudBottom>
        <span>
          <kbd>F3</kbd> netcode
        </span>
      </HudBottom>
      <SabotageNote />
      <DebugOverlay />
      <RoomStatus code={code} created={created} />
    </main>
  );
}

/** Overlays for the moments when there is no match to look at yet. */
function RoomStatus({ code, created }: { code: string; created: boolean }) {
  const status = useNet((s) => s.status);
  const error = useNet((s) => s.error);
  const [copied, setCopied] = useState(created);

  if (status === 'error') {
    return (
      <div className="room-note" role="alert">
        <h2>Can’t get in.</h2>
        <p>{ERRORS[error ?? ''] ?? 'Something went wrong talking to the server.'}</p>
        <Link to="/" className="btn btn-small">
          back to the menu
        </Link>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className="room-note" role="alert">
        <h2>Connection lost.</h2>
        <p>The server closed the connection.</p>
        <Link to="/" className="btn btn-small">
          back to the menu
        </Link>
      </div>
    );
  }

  if (status === 'connecting' || status === 'idle' || status === 'waiting') {
    return (
      <div className="room-note">
        <h2>{status === 'waiting' ? 'Waiting for a rival…' : 'Connecting…'}</h2>
        <p>Send them this link, or the code:</p>
        <div className="room-share">
          <code className="room-code">{code}</code>
          <button
            type="button"
            className="btn btn-small"
            onClick={async () => setCopied(await copyText(roomLink(code)))}
          >
            {copied ? 'link copied' : 'copy link'}
          </button>
        </div>
        <p className="room-hint">Rooms close after 10 minutes with nobody in them.</p>
      </div>
    );
  }

  return null;
}
