import { randomInt } from 'node:crypto';
import { ROOMS, TICK_MS } from '@lag-switch/core';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bot } from '../bot/Bot.js';
import { Room } from './Room.js';
import { TickLoop } from './TickLoop.js';

const SWEEP_EVERY_MS = 30_000;

/**
 * In-memory rooms. One process, one tick loop for every room: at 30 Hz and a
 * handful of rooms that is far cheaper than a timer per room, and it keeps
 * all rooms on the same clock.
 */
@Injectable()
export class RoomRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Rooms');
  private readonly rooms = new Map<string, Room>();
  private readonly loop = new TickLoop(TICK_MS, () => this.tickAll());
  private sweeper: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.loop.start();
    this.sweeper = setInterval(() => this.sweep(), SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    this.loop.stop();
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /**
   * Creates a room. Bot rooms get their bot seated straight away, so the
   * human who opened "play vs bot" starts the match the moment they join.
   */
  create(opts: { withBot?: boolean } = {}): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();
    const room = new Room({
      code,
      // Nobody comes back to an abandoned bot room: free it after a minute.
      ...(opts.withBot && { idleExpiryMs: 60_000 }),
    });
    if (opts.withBot) {
      const bot = new Bot(room);
      bot.join();
      room.onTick(() => bot.think());
    }
    this.rooms.set(code, room);
    this.log.log(
      `room ${code} created${opts.withBot ? ' with a bot' : ''} (${this.rooms.size} open)`,
    );
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  get tickRate(): number {
    return this.loop.rate;
  }

  private tickAll(): void {
    for (const room of this.rooms.values()) {
      try {
        room.tick();
      } catch (err) {
        // One broken room must never take the others down.
        this.log.error(`room ${room.code} crashed and was closed`, err as Error);
        this.rooms.delete(room.code);
      }
    }
  }

  /** Rooms expire after ROOMS.idleExpiryMs without any human connected. */
  sweep(now = Date.now()): void {
    for (const [code, room] of this.rooms) {
      if (room.humanCount === 0 && now - room.lastOccupiedAt > room.idleExpiryMs) {
        this.rooms.delete(code);
        this.log.log(`room ${code} expired (${this.rooms.size} open)`);
      }
    }
  }
}

/** 5 characters from an alphabet without 0/O or 1/I. ~33M combinations. */
export function generateCode(): string {
  let code = '';
  for (let i = 0; i < ROOMS.codeLength; i++) {
    code += ROOMS.codeAlphabet[randomInt(ROOMS.codeAlphabet.length)];
  }
  return code;
}
