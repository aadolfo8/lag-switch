import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useCreateRoom } from '../lib/api';
import { RoomPage } from './RoomPage';
import './room.css';

/**
 * "play vs bot": asks the server for a room with a bot already seated, then
 * joins it like any other room. No sign-up, no waiting for a second human.
 */
export function PlayBotPage({ lagMs }: { lagMs?: number | undefined }) {
  const createRoom = useCreateRoom();
  const requested = useRef(false);
  const { mutate } = createRoom;

  useEffect(() => {
    // Refs survive StrictMode's double effect run: one room, not two.
    if (requested.current) return;
    requested.current = true;
    mutate('bot');
  }, [mutate]);

  if (createRoom.isError) {
    return (
      <main className="play">
        <div className="room-note" role="alert">
          <h2>No bot today.</h2>
          <p>The server didn’t answer. Is it running?</p>
          <div className="room-share">
            <button type="button" className="btn btn-small" onClick={() => mutate('bot')}>
              try again
            </button>
            <Link to="/" className="btn btn-small">
              back to the menu
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!createRoom.data) {
    return (
      <main className="play">
        <div className="room-note" role="status">
          <h2>Waking the bot up…</h2>
        </div>
      </main>
    );
  }

  return <RoomPage code={createRoom.data.code} created={false} vsBot lagMs={lagMs} />;
}
