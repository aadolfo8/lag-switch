import { expect, test } from '@playwright/test';

test('play vs bot: the match starts and snapshots stream in, with a clean console', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  let snapshots = 0;
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string' && payload.startsWith('{"type":"snapshot"')) snapshots++;
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Lag\s*Switch/ })).toBeVisible();

  await page.getByRole('link', { name: /play vs bot/ }).click();
  await expect(page).toHaveURL(/\/play\/bot/);

  // Within 5 s the server must be streaming snapshots (20 per second).
  await expect.poll(() => snapshots, { timeout: 5_000 }).toBeGreaterThan(10);
  await expect(page.getByLabel('Lag Switch arena')).toBeVisible();
  await expect(page.getByText(/round 1 of 5/)).toBeVisible();

  expect(problems).toEqual([]);
});

test('a friend room: create, share the code, join from a second browser', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create a room/ }).click();
  await expect(page).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{5}/);
  const code = page.url().match(/room\/([A-Z0-9]{5})/)?.[1] ?? '';
  await expect(page.getByText(/Waiting for a rival/)).toBeVisible();

  const friend = await (await browser.newContext()).newPage();
  await friend.goto('/');
  await friend.getByLabel('or join').fill(code.toLowerCase());
  await friend.getByRole('button', { name: 'join' }).click();
  await expect(friend).toHaveURL(new RegExp(`/room/${code}`));

  // Both see the match start.
  await expect(page.getByText(/round 1 of 5/)).toBeVisible();
  await expect(friend.getByText(/round 1 of 5/)).toBeVisible();
  await expect(page.getByText(/Waiting for a rival/)).toHaveCount(0);
});
