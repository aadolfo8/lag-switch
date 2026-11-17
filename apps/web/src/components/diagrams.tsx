import type { ExplainDiagram } from '@lag-switch/core';

/**
 * Hand-drawn timelines for the "What just happened?" card: three lanes (you,
 * the server, your rival) with messages as arrows between them.
 */

const Y = { you: 58, server: 148, rival: 238 } as const;
const C = {
  you: 'var(--you)',
  server: 'var(--ink)',
  rival: 'var(--rival)',
  red: 'var(--danger)',
  hi: 'var(--highlight)',
  muted: 'var(--ink-muted)',
};

function Lanes({ gapFrom, gapTo }: { gapFrom?: number; gapTo?: number }) {
  return (
    <g>
      <text x="0" y={Y.you + 6} fontFamily="Caveat, cursive" fontSize="24" fill={C.you}>
        you
      </text>
      <text x="0" y={Y.server + 6} fontFamily="Caveat, cursive" fontSize="24" fill={C.server}>
        server
      </text>
      <text x="0" y={Y.rival + 6} fontFamily="Caveat, cursive" fontSize="24" fill={C.rival}>
        rival
      </text>
      {gapFrom !== undefined && gapTo !== undefined ? (
        <>
          <path d={`M80 ${Y.you} L${gapFrom} ${Y.you}`} stroke={C.you} strokeWidth="2.5" />
          <path
            d={`M${gapFrom} ${Y.you} L${gapTo} ${Y.you}`}
            stroke={C.you}
            strokeWidth="2"
            strokeDasharray="3 8"
            opacity="0.6"
          />
          <path d={`M${gapTo} ${Y.you} L630 ${Y.you}`} stroke={C.you} strokeWidth="2.5" />
        </>
      ) : (
        <path
          d={`M80 ${Y.you} Q360 ${Y.you - 3} 630 ${Y.you + 1}`}
          stroke={C.you}
          strokeWidth="2.5"
          fill="none"
        />
      )}
      <path
        d={`M80 ${Y.server} Q360 ${Y.server - 4} 630 ${Y.server + 1}`}
        stroke={C.server}
        strokeWidth="2.5"
        fill="none"
      />
      <path
        d={Array.from({ length: 13 }, (_, i) => `M${120 + i * 40} ${Y.server} v-8`).join(' ')}
        stroke={C.muted}
        strokeWidth="1.5"
      />
      <path
        d={`M80 ${Y.rival} Q360 ${Y.rival + 4} 630 ${Y.rival - 1}`}
        stroke={C.rival}
        strokeWidth="2.5"
        fill="none"
      />
    </g>
  );
}

/** An arrow from (x1,y1) to (x2,y2) with a little head. */
function Arrow({
  x1,
  y1,
  x2,
  y2,
  color,
  lost = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lost?: boolean;
}) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const ex = lost ? x1 + (x2 - x1) * 0.55 : x2;
  const ey = lost ? y1 + (y2 - y1) * 0.55 : y2;
  const h = (da: number) => `${ex - Math.cos(a + da) * 9} ${ey - Math.sin(a + da) * 9}`;
  return (
    <g>
      <path d={`M${x1} ${y1} L${ex} ${ey}`} stroke={color} strokeWidth="2" fill="none" />
      {lost ? (
        <path
          d={`M${ex - 7} ${ey - 7} l14 14 M${ex + 7} ${ey - 7} l-14 14`}
          stroke={C.red}
          strokeWidth="2.5"
        />
      ) : (
        <path
          d={`M${h(0.45)} L${ex} ${ey} L${h(-0.45)}`}
          stroke={color}
          strokeWidth="2"
          fill="none"
        />
      )}
    </g>
  );
}

const note = (x: number, y: number, text: string, color = C.hi, size = 22) => (
  <text x={x} y={y} fontFamily="Caveat, cursive" fontSize={size} fill={color}>
    {text}
  </text>
);

function Latency() {
  return (
    <>
      <Lanes />
      {/* your inputs travel slowly to the server (long diagonals) */}
      {[110, 210, 310].map((x) => (
        <Arrow key={x} x1={x} y1={Y.you} x2={x + 90} y2={Y.server - 6} color={C.you} />
      ))}
      {/* snapshots come back slowly too */}
      {[170, 270, 370].map((x) => (
        <Arrow key={x} x1={x} y1={Y.server - 6} x2={x + 90} y2={Y.you + 6} color={C.server} />
      ))}
      {/* the rival's link is fine: short arrows */}
      {[130, 230, 330, 430, 530].map((x) => (
        <Arrow key={x} x1={x} y1={Y.rival} x2={x + 14} y2={Y.server + 6} color={C.rival} />
      ))}
      {note(420, 100, '+200 ms each way')}
      {note(400, 290, 'their packets: on time', C.rival)}
    </>
  );
}

function Loss() {
  const lost = new Set([1, 4, 6]);
  return (
    <>
      <Lanes />
      {Array.from({ length: 8 }, (_, i) => {
        const x = 110 + i * 62;
        return (
          <Arrow
            key={x}
            x1={x}
            y1={Y.server - 6}
            x2={x + 24}
            y2={Y.you + 6}
            color={C.server}
            lost={lost.has(i)}
          />
        );
      })}
      {note(250, 30, 'about 1 in 4 never arrive', C.red)}
      {note(150, 290, 'each snapshot is the whole game: the next one fixes it', C.muted, 20)}
    </>
  );
}

function Reconnect() {
  return (
    <>
      <Lanes gapFrom={250} gapTo={430} />
      <path
        d={`M240 ${Y.you + 12} l20 20 M260 ${Y.you + 12} l-20 20`}
        stroke={C.red}
        strokeWidth="2.5"
      />
      {note(252, 30, 'router reboots', C.red)}
      <path d="M250 40 Q340 18 428 40" fill="none" stroke={C.muted} strokeWidth="1.5" />
      <text x="300" y="100" fontFamily="IBM Plex Mono, monospace" fontSize="13" fill={C.muted}>
        3 s · no packets
      </text>
      <path
        d={`M440 ${Y.server} Q448 110 446 ${Y.you + 8}`}
        fill="none"
        stroke={C.hi}
        strokeWidth="2.5"
      />
      <path d={`M438 ${Y.you + 18} l8 -12 l7 13`} fill="none" stroke={C.hi} strokeWidth="2.5" />
      {note(460, 112, 'snapshot!', C.hi, 24)}
      {note(320, 282, 'they never noticed a thing', C.rival)}
    </>
  );
}

function Authority() {
  return (
    <>
      <Lanes />
      {[110, 190, 270, 350].map((x, i) => (
        <g key={x}>
          <Arrow x1={x} y1={Y.you} x2={x + 30} y2={Y.server - 8} color={C.you} />
          {i > 0 && i < 4 && (
            <path
              d={`M${x + 22} ${Y.server - 2} l14 14 M${x + 36} ${Y.server - 2} l-14 14`}
              stroke={C.red}
              strokeWidth="2.5"
            />
          )}
        </g>
      ))}
      {note(200, 196, 'received… and ignored', C.red)}
      <path d={`M470 ${Y.server - 6} L500 ${Y.you + 6}`} stroke={C.server} strokeWidth="2" />
      {note(510, 100, '"you didn’t move"', C.hi)}
    </>
  );
}

const DIAGRAMS: Record<ExplainDiagram, { el: () => React.JSX.Element; label: string }> = {
  latency: {
    el: Latency,
    label:
      'Timeline: your messages take much longer than your rival’s to reach the server and back',
  },
  loss: { el: Loss, label: 'Timeline: one in four snapshots from the server never reaches you' },
  reconnect: {
    el: Reconnect,
    label:
      'Timeline: your client stops for 3 seconds, the server keeps ticking, then sends you a snapshot',
  },
  authority: { el: Authority, label: 'Timeline: your inputs reach the server and are thrown away' },
};

export function ExplainDiagramView({ kind }: { kind: ExplainDiagram }) {
  const { el: Body, label } = DIAGRAMS[kind];
  return (
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label={label}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <Body />
    </svg>
  );
}
