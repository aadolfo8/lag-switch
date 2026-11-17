import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const env = {
  port: Number(process.env.PORT ?? 3000),
  production: process.env.NODE_ENV === 'production',
  /**
   * Built Vite app. In the monorepo it sits next to us (apps/web/dist); the
   * Docker image overrides it with WEB_DIST.
   */
  webDist: process.env.WEB_DIST ?? resolve(here, '../../web/dist'),
};

export const hasWebBuild = () => existsSync(resolve(env.webDist, 'index.html'));
