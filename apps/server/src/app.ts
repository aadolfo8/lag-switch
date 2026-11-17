import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/** Builds the Nest app without listening, so tests can boot it on a random port. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.VITEST ? false : ['log', 'warn', 'error'],
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
