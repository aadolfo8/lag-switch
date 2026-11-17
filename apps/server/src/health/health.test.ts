import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('GET /api/health', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(() => app.close());

  it('answers ok', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});
