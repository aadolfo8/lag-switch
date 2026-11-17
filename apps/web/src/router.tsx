import { RoomCodeSchema } from '@lag-switch/core';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { HomePage } from './pages/HomePage';

// The game pages pull in PixiJS, filters and the netcode: load them only when
// a match starts, so the menu shows up fast.
const PlayBotPage = lazy(() =>
  import('./pages/PlayBotPage').then((m) => ({ default: m.PlayBotPage })),
);
const PlayLocalPage = lazy(() =>
  import('./pages/PlayLocalPage').then((m) => ({ default: m.PlayLocalPage })),
);
const RoomPage = lazy(() => import('./pages/RoomPage').then((m) => ({ default: m.RoomPage })));

const rootRoute = createRootRoute({ component: Outlet });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

/** Offline sandbox against a dummy: the simulation running purely in the browser. */
const localRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/local',
  component: () => (
    <Suspense fallback={null}>
      <PlayLocalPage />
    </Suspense>
  ),
});

/** Accepts ?lag=150: simulated round-trip latency on your own connection. */
const parseLag = (search: Record<string, unknown>): { lag?: number } => {
  const lag = Number(search.lag);
  return Number.isInteger(lag) && lag > 0 && lag <= 1000 ? { lag } : {};
};

const botRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/bot',
  validateSearch: parseLag,
  component: function BotRoute() {
    const { lag } = botRoute.useSearch();
    return (
      <Suspense fallback={null}>
        <PlayBotPage lagMs={lag} />
      </Suspense>
    );
  },
});

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/room/$code',
  validateSearch: (search: Record<string, unknown>): { created?: boolean; lag?: number } => {
    return {
      ...((search.created === true || search.created === 'true') && { created: true }),
      ...parseLag(search),
    };
  },
  beforeLoad: ({ params }) => {
    // Normalise "k7qxm" to "K7QXM"; anything that can't be a code goes home.
    const parsed = RoomCodeSchema.safeParse(params.code);
    if (!parsed.success) throw redirect({ to: '/' });
    if (parsed.data !== params.code) {
      throw redirect({ to: '/room/$code', params: { code: parsed.data } });
    }
  },
  component: function RoomRoute() {
    const { code } = roomRoute.useParams();
    const { created, lag } = roomRoute.useSearch();
    // key: a different code is a different room, so remount everything.
    return (
      <Suspense fallback={null}>
        <RoomPage key={code} code={code} created={created ?? false} lagMs={lag} />
      </Suspense>
    );
  },
});

const routeTree = rootRoute.addChildren([homeRoute, botRoute, localRoute, roomRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
