import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { env, hasWebBuild } from './env.js';
import { HealthController } from './health/health.controller.js';

/**
 * One container, one origin: Nest serves the HTTP API, the WebSocket and the
 * built SPA. In development Vite serves the SPA and proxies /api and /ws here,
 * so the static module is only mounted when a build exists.
 */
const staticModules = hasWebBuild()
  ? [
      ServeStaticModule.forRoot({
        rootPath: env.webDist,
        exclude: ['/api/{*path}', '/ws'],
      }),
    ]
  : [];

@Module({
  imports: [...staticModules],
  controllers: [HealthController],
})
export class AppModule {}
