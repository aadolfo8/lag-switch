import { type ArenaMap, PLAYER, type Vec2 } from '@lag-switch/core';

/**
 * A coarse walkability grid for the bot. 32 px cells (the notebook grid),
 * a cell is blocked when a player standing at its centre would touch a wall.
 * Breadth-first search on ~1 500 cells is far cheaper than it sounds, and the
 * resulting path is smoothed with line-of-walk checks so the bot doesn't
 * zig-zag from cell to cell.
 */
export class NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(
    private readonly map: ArenaMap,
    cell = 32,
    private readonly clearance = PLAYER.radius + 6,
  ) {
    this.cell = cell;
    this.cols = Math.ceil(map.size.x / cell);
    this.rows = Math.ceil(map.size.y / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.blocked[r * this.cols + c] = this.isFreePoint(this.center(c, r)) ? 0 : 1;
      }
    }
  }

  center(c: number, r: number): Vec2 {
    return { x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell };
  }

  /** True when a player-sized circle at `p` (plus margin) touches no wall. */
  isFreePoint(p: Vec2): boolean {
    const rr = this.clearance;
    for (const w of this.map.walls) {
      const cx = Math.max(w.min.x, Math.min(p.x, w.max.x));
      const cy = Math.max(w.min.y, Math.min(p.y, w.max.y));
      if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < rr * rr) return false;
    }
    return true;
  }

  /** Every free cell centre: candidate spots for cover and peeking. */
  freeCells(): Vec2[] {
    const out: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.blocked[r * this.cols + c]) out.push(this.center(c, r));
      }
    }
    return out;
  }

  /** Can a player walk in a straight line from a to b? */
  canWalk(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFreePoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  /** Waypoints from `from` to `to`, or null if unreachable. */
  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    if (this.canWalk(from, to)) return [to];
    const start = this.nearestFreeCell(from);
    const goal = this.nearestFreeCell(to);
    if (start === null || goal === null) return null;

    const prev = new Int32Array(this.cols * this.rows).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi] as number;
      if (cur === goal) break;
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const n = nr * this.cols + nc;
        if (prev[n] !== -1 || this.blocked[n]) continue;
        // No diagonal corner cutting.
        if (
          dc !== 0 &&
          dr !== 0 &&
          (this.blocked[r * this.cols + nc] || this.blocked[nr * this.cols + c])
        ) {
          continue;
        }
        prev[n] = cur;
        queue.push(n);
      }
    }
    if (prev[goal] === -1) return null;

    const cells: Vec2[] = [];
    for (let n = goal; n !== start; n = prev[n] as number) {
      cells.push(this.center(n % this.cols, Math.floor(n / this.cols)));
    }
    cells.reverse();
    cells.push(to);
    return this.smooth(from, cells);
  }

  /** String pulling: skip every waypoint we can walk past in a straight line. */
  private smooth(from: Vec2, points: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < points.length) {
      let j = points.length - 1;
      while (j > i && !this.canWalk(anchor, points[j] as Vec2)) j--;
      const next = points[j] as Vec2;
      out.push(next);
      anchor = next;
      i = j + 1;
    }
    return out;
  }

  private nearestFreeCell(p: Vec2): number | null {
    const c0 = Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / this.cell)));
    const r0 = Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / this.cell)));
    for (let radius = 0; radius < 6; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          if (!this.blocked[r * this.cols + c]) return r * this.cols + c;
        }
      }
    }
    return null;
  }
}

const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
