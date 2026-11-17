import { Logger } from '@nestjs/common';
import { createApp } from './app.js';
import { env } from './env.js';

const app = await createApp();
await app.listen(env.port, '0.0.0.0');
new Logger('Bootstrap').log(`Lag Switch server listening on :${env.port}`);
