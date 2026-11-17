import type { PlayerInput, Vec2 } from '@lag-switch/core';

type Latch = 'reload' | 'switchWeapon' | 'useSabotage';

const LATCH_KEYS: Record<string, Latch> = {
  KeyR: 'reload',
  KeyQ: 'switchWeapon',
  KeyE: 'useSabotage',
};

/**
 * Turns keyboard and mouse state into one PlayerInput per simulation step.
 *
 * Keys are read by `code` (physical position), so WASD works on AZERTY too.
 * One-shot actions (R, Q, E) are latched: a tap shorter than a tick (33 ms)
 * still produces exactly one action on the next sampled input.
 */
export class InputController {
  private readonly keys = new Set<string>();
  private readonly latched = new Set<Latch>();
  private pointer: Vec2 = { x: 0, y: 0 };
  private trigger = false;
  private readonly abort = new AbortController();

  /** Extra key handlers (F3 for the debug overlay, Escape…). */
  onKey: ((code: string) => void) | null = null;

  constructor(private readonly surface: HTMLElement) {
    const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', this.keyDown, opts);
    window.addEventListener('keyup', this.keyUp, opts);
    window.addEventListener('blur', this.reset, opts);
    window.addEventListener('pointermove', this.pointerMove, opts);
    window.addEventListener('pointerup', this.pointerUp, opts);
    surface.addEventListener('pointerdown', this.pointerDown, opts);
    surface.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  }

  /** Pointer position in CSS pixels relative to the surface. */
  get pointerScreen(): Vec2 {
    return this.pointer;
  }

  /**
   * Builds the input for the next step. `aimFrom` is where the player is drawn
   * and `toWorld` converts screen to world coordinates.
   */
  sample(seq: number, aimFrom: Vec2, toWorld: (screen: Vec2) => Vec2): PlayerInput {
    const k = this.keys;
    const x =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y =
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    const target = toWorld(this.pointer);

    const input: PlayerInput = {
      seq,
      move: { x: x / len, y: y / len },
      aim: Math.atan2(target.y - aimFrom.y, target.x - aimFrom.x),
      shoot: this.trigger,
      reload: this.latched.has('reload'),
      switchWeapon: this.latched.has('switchWeapon'),
      useSabotage: this.latched.has('useSabotage'),
    };
    this.latched.clear();
    return input;
  }

  dispose(): void {
    this.abort.abort();
  }

  private readonly keyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if (e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) {
      const latch = LATCH_KEYS[e.code];
      if (latch) this.latched.add(latch);
      this.onKey?.(e.code);
    }
    this.keys.add(e.code);
  };

  private readonly keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly pointerMove = (e: PointerEvent) => {
    const r = this.surface.getBoundingClientRect();
    this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  private readonly pointerDown = (e: PointerEvent) => {
    if (e.button === 0) this.trigger = true;
    this.pointerMove(e);
  };

  private readonly pointerUp = (e: PointerEvent) => {
    if (e.button === 0) this.trigger = false;
  };

  private readonly reset = () => {
    this.keys.clear();
    this.trigger = false;
  };
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
