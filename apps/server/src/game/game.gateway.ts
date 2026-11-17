import { parseClientMessage, type ServerMessage } from '@lag-switch/core';
import { Inject, Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { RawData, WebSocket } from 'ws';
import { CloseCode, type Peer } from './peer.js';
import type { Room } from './Room.js';
import { RoomRegistry } from './RoomRegistry.js';

/** A client that keeps sending invalid frames is cut off after this many. */
const MAX_BAD_MESSAGES = 20;

/**
 * Native WebSocket endpoint at /ws. We deliberately skip Nest's
 * @SubscribeMessage routing (and Socket.IO): the protocol is ours, every
 * frame is one JSON message validated by Zod, and the first one must be a
 * `join`.
 */
@WebSocketGateway({ path: '/ws' })
export class GameGateway implements OnGatewayConnection {
  private readonly log = new Logger('Gateway');

  constructor(@Inject(RoomRegistry) private readonly rooms: RoomRegistry) {}

  handleConnection(ws: WebSocket): void {
    const peer: Peer = {
      send: (raw) => {
        if (ws.readyState === ws.OPEN) ws.send(raw);
      },
      close: (code, reason) => ws.close(code, reason),
    };
    const reply = (msg: ServerMessage) => peer.send(JSON.stringify(msg));

    let joined: { room: Room; playerId: string } | null = null;
    let badMessages = 0;

    ws.on('message', (data: RawData, isBinary: boolean) => {
      const parsed = isBinary
        ? ({ ok: false, error: 'binary frames are not supported' } as const)
        : parseClientMessage(data.toString());

      if (!parsed.ok) {
        reply({ type: 'error', code: 'bad_message', message: parsed.error });
        if (++badMessages > MAX_BAD_MESSAGES) ws.close(CloseCode.protocol, 'too many bad messages');
        return;
      }
      const msg = parsed.msg;

      if (joined) {
        joined.room.receive(joined.playerId, msg);
        return;
      }

      if (msg.type !== 'join') {
        reply({ type: 'error', code: 'not_joined' });
        return;
      }
      const room = this.rooms.get(msg.code);
      if (!room) {
        reply({ type: 'error', code: 'room_not_found' });
        return;
      }
      const result = room.join(peer, msg.name, msg.reconnectToken);
      if (!result.ok) {
        reply({ type: 'error', code: result.code });
        return;
      }
      joined = { room, playerId: result.seat.playerId };
      this.log.log(`${msg.name} ${result.resumed ? 'reconnected to' : 'joined'} room ${room.code}`);
    });

    ws.on('close', () => {
      if (joined) joined.room.disconnect(joined.playerId, peer);
    });
  }
}
