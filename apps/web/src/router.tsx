import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { HomePage } from './pages/HomePage';
import { PlayLocalPage } from './pages/PlayLocalPage';

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
  component: PlayLocalPage,
});

const routeTree = rootRoute.addChildren([homeRoute, localRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
