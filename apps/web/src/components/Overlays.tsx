import { SABOTAGES, type SabotageId } from '@lag-switch/core';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { dismissToast, type Toast, useActions, useHud } from '../game/hudStore';
import { readLocal, writeLocal } from '../lib/storage';
import { ExplainDiagramView } from './diagrams';
import { SabotageIcon } from './SabotageIcon';
import './overlays.css';

const REPO_URL = 'https://github.com/aadolfo8/lag-switch';
const SEEN_KEY = 'lagswitch.explained';
/** Stable empty list: a fresh [] each render would re-run effects forever. */
const NONE: SabotageId[] = [];

const paper = {
  initial: { opacity: 0, y: 24, rotate: -4, scale: 0.96 },
  animate: { opacity: 1, y: 0, rotate: -1.5, scale: 1 },
  exit: { opacity: 0, y: -12, rotate: 1, scale: 0.98 },
  transition: { type: 'spring', stiffness: 380, damping: 28 },
} as const;

/** Countdown before a round, "fight!" when it starts, the result when it ends. */
export function RoundBanner() {
  const phase = useHud((s) => s.phase);
  const seconds = useHud((s) => s.secondsLeft);
  const round = useHud((s) => s.round);
  const result = useHud((s) => s.lastRoundWinner);
  const suffered = useHud((s) => s.suffered.length);
  const [fight, setFight] = useState(false);

  useEffect(() => {
    if (phase !== 'playing') return;
    setFight(true);
    const t = setTimeout(() => setFight(false), 800);
    return () => clearTimeout(t);
  }, [phase]);

  let text: string | null = null;
  let tone = 'ink';
  if (phase === 'countdown') text = seconds > 0 ? String(seconds) : 'go';
  else if (fight) text = round === 1 ? 'fight!' : `round ${round}!`;
  else if (phase === 'roundEnd' && suffered === 0) {
    text =
      result === 'you' ? 'round won' : result === 'rival' ? 'round lost' : 'draw: nobody scores';
    tone = result === 'you' ? 'you' : result === 'rival' ? 'danger' : 'ink';
  }

  return (
    <div className="banner" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {text && (
          <motion.span
            key={text}
            className={`banner-text banner-text--${tone}`}
            initial={{ opacity: 0, scale: 1.6, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: -3 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

const TOAST_MS = 2600;

function ToastLine({ toast, names }: { toast: Toast; names: { you: string; rival: string } }) {
  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id]);
  const s = SABOTAGES[toast.kind];
  const text =
    toast.what === 'pickup'
      ? `got ${s.name}! press E to use it`
      : toast.by === 'you'
        ? `you used ${s.name.toUpperCase()} on ${names.rival}`
        : `${names.rival} used ${s.name.toUpperCase()} on you`;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      className={`toast ${toast.by === 'rival' && toast.what === 'sabotage' ? 'toast--bad' : ''}`}
    >
      <SabotageIcon kind={toast.kind} size={24} />
      {text}
    </motion.li>
  );
}

/** "lagbot used LAG SPIKE on you" and friends. */
export function Toasts() {
  const toasts = useHud(useShallow((s) => s.toasts));
  const you = useHud((s) => s.you?.name ?? 'you');
  const rival = useHud((s) => s.rival?.name ?? 'your rival');
  return (
    <ul className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastLine key={t.id} toast={t} names={{ you, rival }} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/** How many different sabotages this browser has had explained (a tiny bit of progression). */
function useExplainedCount(kinds: SabotageId[]): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const seen = new Set((readLocal(SEEN_KEY) ?? '').split(',').filter(Boolean));
    for (const k of kinds) seen.add(k);
    writeLocal(SEEN_KEY, [...seen].join(','));
    setCount(seen.size);
  }, [kinds]);
  return count;
}

/**
 * Between rounds, if a sabotage hit you: what actually happened on the
 * wire, in plain words, with a timeline.
 */
export function ExplainCard() {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const suffered = useHud(useShallow((s) => s.suffered));
  const result = useHud((s) => s.lastRoundWinner);
  const score = useHud(useShallow((s) => s.score));
  const seconds = useHud((s) => s.secondsLeft);
  const [dismissedRound, setDismissedRound] = useState(0);
  const [picked, setPicked] = useState<SabotageId | null>(null);
  const open = phase === 'roundEnd' && suffered.length > 0 && dismissedRound !== round;
  const explained = useExplainedCount(open ? suffered : NONE);

  const kind = picked && suffered.includes(picked) ? picked : (suffered[0] as SabotageId);
  const card = kind ? SABOTAGES[kind].explainCard : null;
  const total = Object.keys(SABOTAGES).length;

  return (
    <AnimatePresence>
      {open && card && (
        <motion.section
          className="explain"
          aria-labelledby="explain-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="explain-sheet"
            {...paper}
            animate={{ ...paper.animate, rotate: 0 }}
          >
            <header className="explain-head">
              <div>
                <span className={`explain-result explain-result--${result ?? 'draw'}`}>
                  round {round} {result === 'you' ? 'won' : result === 'rival' ? 'lost' : 'drawn'} ·{' '}
                  {score.you} — {score.rival}
                </span>
                <h2 id="explain-title">
                  What just <mark>happened</mark>?
                </h2>
              </div>
              <span className="explain-count">
                sabotages explained: {explained} / {total}
              </span>
            </header>

            {suffered.length > 1 && (
              <div className="explain-tabs" role="tablist" aria-label="Sabotages this round">
                {suffered.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={k === kind}
                    className="chip"
                    onClick={() => setPicked(k)}
                  >
                    <SabotageIcon kind={k} size={20} /> {SABOTAGES[k].name}
                  </button>
                ))}
              </div>
            )}

            <div className="explain-body">
              <div className="explain-text">
                <p>
                  <strong>{card.lead}</strong>
                </p>
                {card.paragraphs.map((p) => (
                  <p key={p.slice(0, 24)}>{p}</p>
                ))}
              </div>
              <figure className="explain-figure">
                <ExplainDiagramView kind={card.diagram} />
                <figcaption>{card.concept}</figcaption>
              </figure>
            </div>

            <footer className="explain-foot">
              <a href={`${REPO_URL}#netcode`} target="_blank" rel="noreferrer">
                read how the netcode works →
              </a>
              <button
                type="button"
                className="btn btn-primary btn-medium"
                onClick={() => setDismissedRound(round)}
              >
                {seconds > 0 ? `next round in ${seconds}` : 'next round'}
              </button>
            </footer>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/** Result, rematch and back to the menu. */
export function MatchEnd({ vsBot }: { vsBot: boolean }) {
  const phase = useHud((s) => s.phase);
  const winner = useHud((s) => s.matchWinner);
  const score = useHud(useShallow((s) => s.score));
  const rivalName = useHud((s) => s.rival?.name ?? 'your rival');
  const rematch = useActions((s) => s.rematch);
  const [voted, setVoted] = useState(false);
  const open = phase === 'matchEnd';

  useEffect(() => {
    if (!open) setVoted(false);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          className="explain"
          aria-labelledby="end-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="end-sheet" {...paper}>
            <h2 id="end-title" className={winner === 'you' ? 'end-win' : 'end-lose'}>
              {winner === 'you' ? 'You won.' : 'You lost.'}
            </h2>
            <p className="end-score">
              {score.you} — {score.rival}
            </p>
            <p className="end-line">
              {winner === 'you'
                ? `${rivalName} blames the Wi-Fi.`
                : vsBot
                  ? 'The bot had a good connection today.'
                  : `${rivalName} takes it. Was it the lag?`}
            </p>
            <div className="end-actions">
              <button
                type="button"
                className="btn btn-primary btn-medium"
                disabled={voted}
                onClick={() => {
                  rematch?.();
                  setVoted(true);
                }}
              >
                {voted ? (vsBot ? 'here we go…' : 'waiting for them…') : 'rematch'}
              </button>
              <Link to="/" className="btn btn-secondary btn-medium">
                back to the menu
              </Link>
            </div>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
