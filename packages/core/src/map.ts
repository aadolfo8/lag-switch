import type { ArenaMap, Vec2, Wall } from './types.js';

const W = 1600;
const H = 960;
/** Thickness of the outer walls; they sit just outside the playable area. */
const BORDER = 64;

const box = (x1: number, y1: number, x2: number, y2: number): Wall => ({
  min: { x: x1, y: y1 },
  max: { x: x2, y: y2 },
});

/** Mirrors a wall through the arena centre, so both spawns see the same map. */
const mirror = (w: Wall): Wall => box(W - w.max.x, H - w.max.y, W - w.min.x, H - w.min.y);
const mirrorPoint = (p: Vec2): Vec2 => ({ x: W - p.x, y: H - p.y });

/**
 * Cover is point-symmetric around the centre: whatever spawn you get, you
 * face exactly the same geometry. Coordinates snap to the 32 px notebook grid.
 */
const cover: Wall[] = [
  box(352, 128, 384, 384), // tall pillar near the top-left
  box(560, 224, 720, 256), // top-centre bar
  box(1056, 192, 1216, 224), // top-right bar
  box(1120, 416, 1184, 480), // small crate right of centre
];

export const ARENA: ArenaMap = {
  size: { x: W, y: H },
  walls: [
    // outer frame
    box(-BORDER, -BORDER, W + BORDER, 0),
    box(-BORDER, H, W + BORDER, H + BORDER),
    box(-BORDER, 0, 0, H),
    box(W, 0, W + BORDER, H),
    // centre block (already symmetric)
    box(736, 432, 864, 528),
    ...cover,
    ...cover.map(mirror),
  ],
  spawns: [{ x: 160, y: 800 }, mirrorPoint({ x: 160, y: 800 })],
  pickupSpots: [
    { pos: { x: 800, y: 160 }, kind: 'wifiReset' },
    { pos: mirrorPoint({ x: 800, y: 160 }), kind: 'lagSpike' },
    { pos: { x: 224, y: 480 }, kind: 'packetLoss' },
    { pos: mirrorPoint({ x: 224, y: 480 }), kind: 'deadBattery' },
  ],
};
