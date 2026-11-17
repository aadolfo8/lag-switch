import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * End-to-end smoke test against the real production build: Nest serves the
 * built SPA, the API and the WebSocket on one port, exactly like in Docker.
 * Run `pnpm build` first. Locally you can reuse your installed Chrome with
 * PW_CHANNEL=chrome instead of downloading Playwright's browser.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PW_CHANNEL && { channel: process.env.PW_CHANNEL }),
      },
    },
  ],
  webServer: {
    command: 'node apps/server/dist/main.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { PORT: String(PORT), NODE_ENV: 'production' },
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
