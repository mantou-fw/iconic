import { LANE_GAP } from "./lanes";
import { crossings, type Rect } from "./obstacles";
import type { Point } from "./stroke";

export type Side = "left" | "right" | "top" | "bottom";

/** Cable bends snap to this grid so parallel runs stay square. */
export const SNAP = 8;
export const snap = (v: number) => Math.round(v / SNAP) * SNAP;

const STUB = 18;

const shift = (p: Point, side: Side, by: number): Point => {
  switch (side) {
    case "left":
      return { x: p.x - by, y: p.y };
    case "right":
      return { x: p.x + by, y: p.y };
    case "top":
      return { x: p.x, y: p.y - by };
    default:
      return { x: p.x, y: p.y + by };
  }
};

const same = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** Drops repeated points and merges runs that continue along the same axis. */
function tidy(raw: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (!last || !same(last, p)) out.push(p);
  }
  const merged: Point[] = [];
  for (let i = 0; i < out.length; i++) {
    const prev = merged[merged.length - 1];
    const next = out[i + 1];
    const p = out[i]!;
    if (prev && next) {
      const flatX = Math.abs(prev.x - p.x) < 0.01 && Math.abs(p.x - next.x) < 0.01;
      const flatY = Math.abs(prev.y - p.y) < 0.01 && Math.abs(p.y - next.y) < 0.01;
      if (flatX || flatY) continue;
    }
    merged.push(p);
  }
  return merged;
}

/**
 * A draw.io-style orthogonal cable: the run is fully described by two numbers,
 * the X of its vertical leg and the Y of its horizontal leg, so there are only
 * ever two things to drag rather than a growing pile of waypoints.
 */
export function orthogonalRoute(
  source: Point,
  target: Point,
  sourceSide: Side,
  targetSide: Side,
  midX?: number,
  midY?: number,
  /** Lane offset applied to the auto mid-point so fan-outs don't overlap. */
  lane = 0,
) {
  const sStub = shift(source, sourceSide, STUB);
  const tStub = shift(target, targetSide, STUB);

  const autoX = (sStub.x + tStub.x) / 2 + lane * LANE_GAP;
  const mx = midX ?? autoX;
  const my = midY ?? tStub.y;

  const points = tidy([
    source,
    sStub,
    { x: mx, y: sStub.y },
    { x: mx, y: my },
    { x: tStub.x, y: my },
    tStub,
    target,
  ]);

  return {
    points,
    mx,
    my,
    /** Grab point for the vertical leg — drags along X. */
    handleX: { x: mx, y: (sStub.y + my) / 2 },
    /** Grab point for the horizontal leg — drags along Y. */
    handleY: { x: (mx + tStub.x) / 2, y: my },
    defaults: { mx: autoX, my: tStub.y },
  };
}

/**
 * Picks the mid-point that keeps a cable clear of device blocks.
 *
 * Only the auto-routed axes are searched — anything the user has dragged is
 * passed straight through, so hand routing is never second-guessed. Candidates
 * step outwards from the natural mid-point and the first clean one wins, so a
 * cable moves the smallest distance needed to get out of the way.
 */
export function avoidObstacles(
  source: Point,
  target: Point,
  sourceSide: Side,
  targetSide: Side,
  obstacles: Rect[],
  lockedX?: number,
  lockedY?: number,
  lane = 0,
) {
  const base = orthogonalRoute(source, target, sourceSide, targetSide, lockedX, lockedY, lane);
  if (obstacles.length === 0) return base;

  let best = base;
  let bestScore = crossings(base.points, obstacles);
  if (bestScore === 0) return base;

  const STEP = 12;
  const REACH = 24; // ±288px of search, which covers a rack-to-rack gap

  // First try shifting the vertical leg, which is what usually cuts a block.
  if (lockedX === undefined) {
    for (let i = 1; i <= REACH && bestScore > 0; i++) {
      for (const dir of [-1, 1]) {
        const candidate = orthogonalRoute(
          source,
          target,
          sourceSide,
          targetSide,
          base.mx + dir * i * STEP,
          lockedY,
          0,
        );
        const score = crossings(candidate.points, obstacles);
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
          if (score === 0) break;
        }
      }
    }
  }

  // Still blocked? Route the horizontal leg around as well.
  if (bestScore > 0 && lockedY === undefined) {
    for (let i = 1; i <= REACH && bestScore > 0; i++) {
      for (const dir of [-1, 1]) {
        const candidate = orthogonalRoute(
          source,
          target,
          sourceSide,
          targetSide,
          lockedX ?? best.mx,
          base.my + dir * i * STEP,
          0,
        );
        const score = crossings(candidate.points, obstacles);
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
          if (score === 0) break;
        }
      }
    }
  }

  return best;
}

/** Renders a polyline with softly rounded corners. */
export function roundedPath(points: Point[], radius = 8): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);

    if (r < 0.5) {
      d += ` L ${p.x} ${p.y}`;
      continue;
    }
    const a = {
      x: p.x + ((prev.x - p.x) / inLen) * r,
      y: p.y + ((prev.y - p.y) / inLen) * r,
    };
    const b = {
      x: p.x + ((next.x - p.x) / outLen) * r,
      y: p.y + ((next.y - p.y) / outLen) * r,
    };
    d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
  }

  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

/** The point half way along a polyline, measured by length. */
export function midpointOf(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;

  const spans = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const half = spans.reduce((a, b) => a + b, 0) / 2;

  let walked = 0;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    if (walked + span >= half) {
      const t = span === 0 ? 0 : (half - walked) / span;
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    walked += span;
  }
  return points[points.length - 1]!;
}
