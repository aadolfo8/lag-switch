const swatches = [
  ['paper', '--paper'],
  ['panel', '--panel'],
  ['wall', '--wall'],
  ['ink', '--ink'],
  ['you', '--you'],
  ['rival', '--rival'],
  ['danger', '--danger'],
  ['highlight', '--highlight'],
] as const;

/** Phase 1 placeholder: proves fonts and palette are wired. Replaced by the real menu later. */
export function HomePage() {
  return (
    <main style={{ padding: '56px 72px', display: 'grid', gap: 24 }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-hand)',
          fontSize: 128,
          lineHeight: 0.85,
          transform: 'rotate(-2deg)',
          transformOrigin: 'left',
        }}
      >
        Lag <span style={{ color: 'var(--danger)' }}>Switch</span>
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: 480,
          fontSize: 20,
          lineHeight: 1.5,
          color: 'var(--ink-body)',
        }}
      >
        A 1v1 duel where the weapons are everything that goes wrong when you play online.
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {swatches.map(([name, token]) => (
          <li
            key={name}
            style={{ display: 'grid', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          >
            <span
              style={{
                width: 64,
                height: 40,
                background: `var(${token})`,
                border: '2px solid var(--ink)',
                borderRadius: 'var(--radius-a)',
              }}
            />
            {name}
          </li>
        ))}
      </ul>
    </main>
  );
}
