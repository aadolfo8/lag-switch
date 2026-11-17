import { CreateRoomRequestSchema } from '@lag-switch/core';
import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { RoomRegistry } from './RoomRegistry.js';

@Controller('rooms')
export class RoomsController {
  // Explicit @Inject: works without emitDecoratorMetadata (e.g. under Vitest).
  constructor(@Inject(RoomRegistry) private readonly rooms: RoomRegistry) {}

  /**
   * Creates a room ({ mode: 'friend' } by default, or 'bot'). The creator
   * then joins it over the WebSocket like anybody else.
   */
  @Post()
  @HttpCode(201)
  create(@Body() body: unknown): { code: string } {
    const parsed = CreateRoomRequestSchema.safeParse(body ?? undefined);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    return { code: this.rooms.create({ withBot: parsed.data.mode === 'bot' }).code };
  }
}
