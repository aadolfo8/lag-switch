import { Graphics } from 'pixi.js';
import rough from 'roughjs';
import type { Drawable, Op, Options } from 'roughjs/bin/core';

/**
 * Rough.js → Pixi. Rough.js gives us "hand-drawn" geometry as a list of ops
 * (move / bezier / line). We replay those ops into a Pixi Graphics, which is
 * then baked into a texture once. Rough.js is never called per frame.
 */
export const gen = rough.generator();

export type RoughOptions = Options;

const replay = (g: Graphics, ops: Op[]) => {
  for (const { op, data } of ops) {
    if (op === 'move') g.moveTo(data[0] ?? 0, data[1] ?? 0);
    else if (op === 'lineTo') g.lineTo(data[0] ?? 0, data[1] ?? 0);
    else
      g.bezierCurveTo(
        data[0] ?? 0,
        data[1] ?? 0,
        data[2] ?? 0,
        data[3] ?? 0,
        data[4] ?? 0,
        data[5] ?? 0,
      );
  }
};

/** Draws Rough.js drawables into a (new or given) Graphics. */
export function drawRough(drawables: Drawable[], g = new Graphics()): Graphics {
  for (const d of drawables) {
    const o = d.options;
    for (const set of d.sets) {
      replay(g, set.ops);
      if (set.type === 'fillPath') {
        g.fill({ color: o.fill ?? '#000' });
      } else if (set.type === 'fillSketch') {
        g.stroke({
          width: o.fillWeight > 0 ? o.fillWeight : o.strokeWidth / 2,
          color: o.fill ?? '#000',
          cap: 'round',
        });
      } else {
        g.stroke({ width: o.strokeWidth, color: o.stroke, cap: 'round', join: 'round' });
      }
    }
  }
  return g;
}

/** Shared look: a pencil that wobbles a little. */
export const INK = {
  roughness: 1.1,
  bowing: 0.8,
  strokeWidth: 2,
  stroke: '#EDE6D6',
} satisfies RoughOptions;

/** Rough.js wants positive integer seeds; variant i of a shape uses base + i. */
export const seedFor = (base: number, variant: number) =>
  ((base * 7919 + variant * 104729) % 2147483646) + 1;
