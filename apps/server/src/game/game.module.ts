import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway.js';
import { RoomRegistry } from './RoomRegistry.js';
import { RoomsController } from './rooms.controller.js';

@Module({
  controllers: [RoomsController],
  providers: [RoomRegistry, GameGateway],
  exports: [RoomRegistry],
})
export class GameModule {}
