import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The client compiles `core` from source: instant HMR when the simulation
      // changes, and byte-for-byte the same rules the server runs.
      '@lag-switch/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': server,
      '/ws': { target: server, ws: true },
    },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
