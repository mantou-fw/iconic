import { createContext, useContext } from "react";

import type { Side } from "./routing";
import type { Point } from "./stroke";

export type Rect = { id?: string; x: number; y: number; w: number; h: number };
type Endpoint = { id?: string; side: Side };

/**
 * Device rectangles the router must not draw through. Supplied via context so
 * every edge can see the whole drawing without duplicating the list onto each
 * one.
 */
export const ObstaclesContext = createContext<Rect[]>([]);
export const useObstacles = () => useContext(ObstaclesContext);

/** Keeps cables from grazing a block's border. */
const CLEARANCE = 10;

const grow = (r: Rect): Rect => ({
  x: r.x - CLEARANCE,
  y: r.y - CLEARANCE,
  w: r.w + CLEARANCE * 2,
  h: r.h + CLEARANCE * 2,
});

/** Does an axis-aligned segment pass through the rectangle? */
function hits(a: Point, b: Point, r: Rect): boolean {
  const loX = Math.min(a.x, b.x);
  const hiX = Math.max(a.x, b.x);
  const loY = Math.min(a.y, b.y);
  const hiY = Math.max(a.y, b.y);
  return (
    hiX > r.x && loX < r.x + r.w && hiY > r.y && loY < r.y + r.h
  );
}

/** The segment must leave the physical face of the block in the correct direction. */
function exits(a: Point, b: Point, rect: Rect, side: Side) {
  const tolerance = 0.5;
  switch (side) {
    case "left": return a.x <= rect.x + tolerance && b.x < a.x && a.y === b.y;
    case "right": return a.x >= rect.x + rect.w - tolerance && b.x > a.x && a.y === b.y;
    case "top": return a.y <= rect.y + tolerance && b.y < a.y && a.x === b.x;
    case "bottom": return a.y >= rect.y + rect.h - tolerance && b.y > a.y && a.x === b.x;
  }
}

/** Only a cable's first and last segments may use their own endpoint clearance. */
export function crossings(points: Point[], obstacles: Rect[], source?: Endpoint, target?: Endpoint): number {
  let count = 0;
  const last = points.length - 2;
  for (const rect of obstacles) {
    const clearance = grow(rect);
    for (let i = 0; i <= last; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      if (!hits(a, b, clearance)) continue;
      if (i === 0 && source?.id && rect.id === source.id && exits(a, b, rect, source.side)) continue;
      if (i === last && target?.id && rect.id === target.id && exits(b, a, rect, target.side)) continue;
      count++;
    }
  }
  return count;
}
