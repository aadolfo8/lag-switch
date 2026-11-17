import { RoomCodeSchema, type SabotageId } from '@lag-switch/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useId, useState } from 'react';
import { SabotageIcon } from '../components/SabotageIcon';
import { useCreateRoom } from '../lib/api';
import { copyText, roomLink } from '../lib/share';
import { getPlayerName, setPlayerName } from '../lib/storage';
import './menu.css';

export const REPO_URL = 'https://github.com/aadolfo8/lag-switch';

const ARSENAL: { kind: SabotageId; name: string; line: string }[] = [
  { kind: 'lagSpike', name: 'lag spike', line: '+400 ms on your rival’s connection, both ways' },
  { kind: 'wifiReset', name: 'mom reboots the wi-fi', line: '3 s disconnect, then resync' },
  {
    kind: 'deadBattery',
    name: 'dead controller battery',
    line: 'their inputs are ignored for 2 s',
  },
  { kind: 'packetLoss', name: 'packet loss', line: '1 in 4 of their packets vanish' },
];

export function HomePage() {
  const navigate = useNavigate();
  const createRoom = useCreateRoom();
  const [name, setName] = useState(getPlayerName);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const nameId = useId();
  const codeId = useId();
  const codeErrorId = useId();

  const commitName = () => setName(setPlayerName(name));

  const onCreate = () => {
    commitName();
    createRoom.mutate('friend', {
      onSuccess: async ({ code }) => {
        await copyText(roomLink(code));
        navigate({ to: '/room/$code', params: { code }, search: { created: true } });
      },
    });
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const parsed = RoomCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError('codes are 5 letters or digits, like K7QXM');
      return;
    }
    commitName();
    navigate({ to: '/room/$code', params: { code: parsed.data }, search: { created: false } });
  };

  return (
    <main className="menu">
      <div className="menu-main">
        <div className="menu-title">
          <h1>
            Lag <span>Switch</span>
          </h1>
          <svg aria-hidden="true" width="360" height="18" viewBox="0 0 360 18">
            <path
              d="M4 12 Q90 2 180 10 T356 6"
              fill="none"
              stroke="var(--highlight)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="menu-tagline">
          A 1v1 duel where the weapons are everything that goes wrong when you play online.
        </p>

        <div className="menu-actions">
          <Link to="/play/local" className="btn btn-primary" onClick={commitName}>
            play vs bot →
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCreate}
            disabled={createRoom.isPending}
          >
            {createRoom.isPending ? 'creating a room…' : 'create a room for a friend'}
          </button>
          {createRoom.isError && (
            <p className="menu-error" role="alert">
              The server didn’t answer. Is it running?
            </p>
          )}
          <form className="menu-join" onSubmit={onJoin} noValidate>
            <label htmlFor={codeId}>or join</label>
            <input
              id={codeId}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeError(null);
              }}
              placeholder="room code"
              autoComplete="off"
              spellCheck={false}
              maxLength={5}
              aria-invalid={codeError !== null}
              aria-describedby={codeError ? codeErrorId : undefined}
            />
            <button type="submit" className="btn btn-small">
              join
            </button>
          </form>
          {codeError && (
            <p id={codeErrorId} className="menu-error">
              {codeError}
            </p>
          )}
          <div className="menu-name">
            <label htmlFor={nameId}>playing as</label>
            <input
              id={nameId}
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              autoComplete="nickname"
            />
          </div>
        </div>

        <nav className="menu-links" aria-label="About the project">
          <a href={`${REPO_URL}#netcode`}>how the netcode works →</a>
          <a href={REPO_URL}>source on GitHub</a>
        </nav>
      </div>

      <section className="arsenal" aria-labelledby="arsenal-title">
        <h2 id="arsenal-title">the arsenal</h2>
        <ul>
          {ARSENAL.map((s) => (
            <li key={s.kind}>
              <SabotageIcon kind={s.kind} />
              <div>
                <span className="arsenal-name">{s.name}</span>
                <span className="arsenal-line">{s.line}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="arsenal-note">
          Grab one on the map, press <kbd>E</kbd>. The server really does it to your rival’s
          connection.
        </p>
      </section>
    </main>
  );
}
