# Lag Switch

A 1v1 top-down duel in the browser where the special weapons are everything that goes wrong when you play online: lag spikes, packet loss, your mom rebooting the Wi-Fi, a dead controller battery.

The sabotages are not animations. The authoritative server really delays, drops or cuts the victim's traffic.

> Work in progress. The full README (demo, architecture, netcode decisions and measured numbers) lands with v1.

## Run locally

```bash
pnpm install
pnpm dev        # Vite on :5173, Nest on :3000
```

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | web + server + core in watch mode         |
| `pnpm build`     | builds every package (Turborepo, cached)  |
| `pnpm test`      | Vitest across the monorepo                |
| `pnpm typecheck` | `tsc --noEmit` everywhere                 |
| `pnpm lint`      | Biome lint + format check                 |

## Layout

```
packages/core   pure TS simulation shared by server and client
apps/server     NestJS authoritative server (native WebSockets)
apps/web        Vite + React + PixiJS client
```
