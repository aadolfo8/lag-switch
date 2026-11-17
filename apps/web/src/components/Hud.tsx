import { useHud } from '../game/hudStore';
import './hud.css';

const SABOTAGE_LABEL = {
  lagSpike: 'lag spike',
  packetLoss: 'packet loss',
  wifiReset: 'wi-fi reset',
  deadBattery: 'dead battery',
} as const;

function PlayerPanel({ side }: { side: 'you' | 'rival' }) {
  const p = useHud((s) => s[side]);
  if (!p) {
    return (
      <div className={`hud-player hud-player--${side}`}>
        <span className="hud-name">{side === 'you' ? 'you' : 'waiting for a rival…'}</span>
      </div>
    );
  }
  return (
    <div className={`hud-player hud-player--${side}`}>
      <span className="hud-name">
        {side === 'you' ? 'you' : 'rival'} · {p.name}
      </span>
      <div className="hud-hp" aria-hidden="true">
        <span style={{ width: `${p.hp}%` }} />
      </div>
      <span className="hud-meta">
        {p.hp} hp · {p.weapon} {p.reloading ? 'reloading…' : `${p.ammo}/${p.magazine}`}
      </span>
    </div>
  );
}

function Scoreboard() {
  const round = useHud((s) => s.round);
  const you = useHud((s) => s.score.you);
  const rival = useHud((s) => s.score.rival);
  const seconds = useHud((s) => s.secondsLeft);
  const phase = useHud((s) => s.phase);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className="hud-score">
      <span className="hud-round">{round > 0 ? `round ${round} of 5` : 'warming up'}</span>
      <span className="hud-points">
        {you} — {rival}
      </span>
      <span className="hud-clock">{phase === 'countdown' ? `starts in ${seconds}` : clock}</span>
    </div>
  );
}

export function HudTop() {
  return (
    <header className="hud-top">
      <PlayerPanel side="you" />
      <Scoreboard />
      <PlayerPanel side="rival" />
    </header>
  );
}

export function HudBottom({ children }: { children?: React.ReactNode }) {
  const slot = useHud((s) => s.you?.slot ?? null);
  return (
    <footer className="hud-bottom">
      <div className="hud-slot-row">
        <span className="hud-label">sabotage slot</span>
        <div className={`hud-slot ${slot ? 'hud-slot--full' : ''}`}>
          <span className="hud-slot-name">{slot ? SABOTAGE_LABEL[slot] : 'empty'}</span>
          <kbd>E</kbd>
        </div>
      </div>
      <div className="hud-keys">
        <span>
          <kbd>WASD</kbd> move
        </span>
        <span>
          <kbd>click</kbd> shoot
        </span>
        <span>
          <kbd>R</kbd> reload
        </span>
        <span>
          <kbd>Q</kbd> swap gun
        </span>
        <span>
          <kbd>M</kbd> sound
        </span>
        {children}
      </div>
    </footer>
  );
}
