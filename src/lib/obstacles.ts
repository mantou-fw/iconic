import { createContext, useContext } from "react";

import type { Point } from "./stroke";

export type Rect = { x: number; y: number; w: number; h: number };

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
function hits(a: Point, b: Point, rect: Rect): boolean {
  const r = grow(rect);
  const loX = Math.min(a.x, b.x);
  const hiX = Math.max(a.x, b.x);
  const loY = Math.min(a.y, b.y);
  const hiY = Math.max(a.y, b.y);
  return (
    hiX > r.x && loX < r.x + r.w && hiY > r.y && loY < r.y + r.h
  );
}

/** How many obstacles a whole polyline runs through. */
export function crossings(points: Point[], obstacles: Rect[]): number {
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const rect of obstacles) {
      if (hits(points[i]!, points[i + 1]!, rect)) n += 1;
    }
  }
  return n;
}
