import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol.js';

const input = {
  seq: 1,
  move: { x: 1, y: 0 },
  aim: 0.5,
  shoot: false,
  reload: false,
  switchWeapon: false,
  useSabotage: false,
};

describe('parseClientMessage', () => {
  it('accepts a valid join and normalises the code', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'join', code: ' abcde ', name: 'Ana' }));
    expect(r).toEqual({ ok: true, msg: { type: 'join', code: 'ABCDE', name: 'Ana' } });
  });

  it('rejects codes with ambiguous characters', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'join', code: 'AB0DE', name: 'Ana' }));
    expect(r.ok).toBe(false);
  });

  it('rejects names with markup', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'join', code: 'ABCDE', name: '<b>x</b>' }));
    expect(r.ok).toBe(false);
  });

  it('accepts a batch of inputs', () => {
    const r = parseClientMessage(
      JSON.stringify({ type: 'input', inputs: [input, { ...input, seq: 2 }] }),
    );
    expect(r.ok).toBe(true);
  });

  it('rejects out-of-range movement (speed hacks) and too many inputs', () => {
    const fast = { ...input, move: { x: 5, y: 0 } };
    expect(parseClientMessage(JSON.stringify({ type: 'input', inputs: [fast] })).ok).toBe(false);
    const many = Array.from({ length: 20 }, (_, i) => ({ ...input, seq: i }));
    expect(parseClientMessage(JSON.stringify({ type: 'input', inputs: many })).ok).toBe(false);
  });

  it('rejects garbage without throwing', () => {
    expect(parseClientMessage('{nope').ok).toBe(false);
    expect(parseClientMessage('null').ok).toBe(false);
    expect(parseClientMessage(JSON.stringify({ type: 'hack' })).ok).toBe(false);
  });
});
