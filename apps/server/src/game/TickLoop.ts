/**
 * Fixed-rate scheduler. `setInterval(fn, 33)` drifts (each callback runs a
 * little late and the error accumulates), so instead we compute the ideal
 * time of every tick from the start time and sleep until then. If the
 * process stalls, we run the missed ticks back to back (capped) so the game
 * clock catches up with real time.
 */
export class TickLoop {
  private timer: NodeJS.Timeout | null = null;
  private startedAt = 0;
  private ticks = 0;
  /** Measured ticks per second over the last second, for monitoring. */
  rate = 0;
  private rateWindow: number[] = [];

  constructor(
    private readonly tickMs: number,
    private readonly onTick: () => void,
    private readonly maxCatchUp = 5,
  ) {}

  start(): void {
    if (this.timer) return;
    this.startedAt = performance.now();
    this.ticks = 0;
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const next = this.startedAt + (this.ticks + 1) * this.tickMs;
    this.timer = setTimeout(() => this.run(), Math.max(0, next - performance.now()));
  }

  private run(): void {
    const now = performance.now();
    let due = Math.floor((now - this.startedAt) / this.tickMs) - this.ticks;
    if (due > this.maxCatchUp) {
      // Too far behind (debugger pause, laptop sleep): skip instead of fast-forwarding.
      this.ticks += due - this.maxCatchUp;
      due = this.maxCatchUp;
    }
    for (let i = 0; i < due; i++) {
      this.ticks += 1;
      this.onTick();
      this.rateWindow.push(now);
    }
    this.rateWindow = this.rateWindow.filter((t) => now - t < 1000);
    this.rate = this.rateWindow.length;
    if (this.timer) this.schedule();
  }
}
