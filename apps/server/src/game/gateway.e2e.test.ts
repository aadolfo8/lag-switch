import type { ServerMessage } from '@lag-switch/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

/** Opens a socket and collects every message it receives. */
function connect(url: string) {
  const ws = new WebSocket(url);
  const inbox: ServerMessage[] = [];
  ws.addEventListener('message', (e) => inbox.push(JSON.parse(String(e.data))));
  const open = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', reject);
  });
  const waitFor = async <T extends ServerMessage['type']>(type: T, timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const m = inbox.find((x) => x.type === type);
      if (m) return m as Extract<ServerMessage, { type: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${type} within ${timeoutMs} ms`);
  };
  return { ws, inbox, open, waitFor, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe('WebSocket gateway (real server)', () => {
  let app: INestApplication;
  let http: string;
  let wsUrl: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    http = await app.getUrl();
    wsUrl = `${http.replace('http', 'ws')}/ws`;
  });

  afterAll(() => app.close());

  it('two players create, join and receive snapshots', async () => {
    const res = await fetch(`${http}/api/rooms`, { method: 'POST' });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);

    const a = connect(wsUrl);
    const b = connect(wsUrl);
    await Promise.all([a.open, b.open]);
    a.send({ type: 'join', code, name: 'Ana' });
    b.send({ type: 'join', code: code.toLowerCase(), name: 'Bo' });

    const welcome = await a.waitFor('welcome');
    expect(welcome.reconnectToken).toHaveLength(32);
    await b.waitFor('welcome');

    // Let a few ticks run and check the snapshot stream.
    await new Promise((r) => setTimeout(r, 300));
    const snaps = a.inbox.filter((m) => m.type === 'snapshot');
    expect(snaps.length).toBeGreaterThanOrEqual(4);
    const last = snaps.at(-1);
    expect(last?.type === 'snapshot' && last.state.players).toHaveLength(2);

    a.ws.close();
    b.ws.close();
  });

  it('rejects unknown rooms and invalid frames', async () => {
    const c = connect(wsUrl);
    await c.open;
    c.send({ type: 'join', code: 'ZZZZZ', name: 'Cy' });
    expect(await c.waitFor('error')).toMatchObject({ code: 'room_not_found' });
    c.inbox.length = 0;
    c.ws.send('not json');
    expect(await c.waitFor('error')).toMatchObject({ code: 'bad_message' });
    c.ws.close();
  });
});
