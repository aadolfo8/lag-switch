import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { RoomRegistry } from './RoomRegistry.js';

@Controller('rooms')
export class RoomsController {
  // Explicit @Inject: works without emitDecoratorMetadata (e.g. under Vitest).
  constructor(@Inject(RoomRegistry) private readonly rooms: RoomRegistry) {}

  /** Creates a private room; the creator then joins it over the WebSocket like anybody else. */
  @Post()
  @HttpCode(201)
  create(): { code: string } {
    return { code: this.rooms.create().code };
  }
}
