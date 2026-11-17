import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';

/** Builds the Nest app without listening, so tests can boot it on a random port. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.VITEST ? false : ['log', 'warn', 'error'],
  });
  app.setGlobalPrefix('api');
  // Native `ws` server on the same HTTP server and port. Client frames are
  // small (an input batch is ~1 KB), so anything over 4 KB is rejected.
  app.useWebSocketAdapter(new WsAdapter(app, { maxPayload: 4096 }));
  app.enableShutdownHooks();
  return app;
}
