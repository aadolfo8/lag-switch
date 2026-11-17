import { NET } from '@lag-switch/core';
import { useNet, useUi } from '../game/netStore';
import './debug.css';

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB/s`;

/** F3: live numbers about the connection, measured on this client. */
export function DebugOverlay() {
  const open = useUi((s) => s.debugOpen);
  const n = useNet();
  if (!open) return null;

  const rows: [string, string, boolean?][] = [
    ['status', n.status],
    ['room', n.roomCode ?? '—'],
    ['ping', n.pingMs === null ? '—' : `${n.pingMs} ms`, (n.pingMs ?? 0) > 200],
    ['server tick', `${n.serverTick} @ ${NET.tickRate} Hz`],
    [
      'snapshots/s',
      `${n.snapshotsPerSec} / ${NET.snapshotRate}`,
      n.snapshotsPerSec < NET.snapshotRate * 0.85,
    ],
    ['in', `${kb(n.bytesInPerSec)} · ${n.messagesInPerSec} msg/s`],
    ['out', `${kb(n.bytesOutPerSec)} · ${n.messagesOutPerSec} msg/s`],
    ['unacked inputs', String(n.pendingInputs), n.pendingInputs > 10],
    ['last correction', `${n.correctionPx.toFixed(1)} px`, n.correctionPx > 4],
    ['interp delay', `${n.interpolationMs} ms`],
  ];

  return (
    <aside className="debug" aria-label="Network debug overlay">
      <h2>netcode · F3</h2>
      <dl>
        {rows.map(([k, v, warn]) => (
          <div key={k} className={warn ? 'debug-warn' : undefined}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3>active network effects</h3>
      {n.effects.length === 0 ? (
        <p className="debug-none">none</p>
      ) : (
        <ul>
          {n.effects.map((e) => (
            <li key={e.id}>
              {e.id} <span>{(e.leftMs / 1000).toFixed(1)} s</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
