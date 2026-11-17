import type { SabotageId } from '@lag-switch/core';

/** Hand-drawn style icons for the four sabotages (stroke-only, inherit size). */
export function SabotageIcon({ kind, size = 40 }: { kind: SabotageId; size?: number }) {
  const common = {
    width: size,
    height: size,
    fill: 'none',
    stroke: 'var(--ink)',
    strokeLinecap: 'round' as const,
  };
  switch (kind) {
    case 'lagSpike': // hourglass
      return (
        <svg aria-hidden="true" {...common} viewBox="0 0 28 28" strokeWidth="2">
          <path d="M8 4h12M8 24h12M9 4c0 7 10 7 10 10s-10 3-10 10M19 4c0 7-10 7-10 10s10 3 10 10" />
        </svg>
      );
    case 'wifiReset': // router
      return (
        <svg aria-hidden="true" {...common} viewBox="0 0 64 56" strokeWidth="3">
          <rect x="10" y="30" width="44" height="18" rx="3" />
          <path d="M20 30 L15 10 M44 30 L49 10" />
          <path d="M24 22 q8 -8 16 0" />
        </svg>
      );
    case 'deadBattery':
      return (
        <svg aria-hidden="true" {...common} viewBox="0 0 40 28" strokeWidth="2.5">
          <rect x="3" y="6" width="30" height="16" rx="3" />
          <rect x="33" y="11" width="4" height="6" fill="var(--ink)" />
          <rect x="7" y="10" width="5" height="8" fill="var(--danger)" stroke="none" />
        </svg>
      );
    case 'packetLoss': // a wave with a dot and a cross
      return (
        <svg aria-hidden="true" {...common} viewBox="0 0 40 40" strokeWidth="2.5">
          <path d="M4 26 q8 -12 16 0 t16 0" />
          <circle cx="10" cy="12" r="2.5" fill="var(--ink)" />
          <path d="M24 10 l6 6 M30 10 l-6 6" stroke="var(--danger)" />
        </svg>
      );
  }
}
