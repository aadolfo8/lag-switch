// Dev loop without extra tooling: `tsc --watch` compiles, `node --watch`
// restarts the server whenever the output changes. We keep tsc (and not an
// esbuild-based runner) because Nest relies on decorator metadata.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const run = (cmd, args) =>
  spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });

const tsc = run('pnpm', [
  'exec',
  'tsc',
  '-p',
  'tsconfig.build.json',
  '--watch',
  '--preserveWatchOutput',
]);

while (!existsSync('dist/main.js')) await sleep(200);
const node = run('node', ['--watch-path=dist', '--enable-source-maps', 'dist/main.js']);

const stop = () => {
  tsc.kill();
  node.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
