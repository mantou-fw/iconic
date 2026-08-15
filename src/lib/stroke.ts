export type Point = { x: number; y: number };

/**
 * Drops points closer together than `tolerance` so a stroke stays small in the
 * database without visibly changing shape.
 */
export function simplify(points: Point[], tolerance = 2): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]!];
  for (const p of points.slice(1, -1)) {
    const last = out[out.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= tolerance) out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Renders a point list as a path smoothed with quadratic mid-point curves. */
export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
  }
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const next = points[i + 1]!;
    d += ` Q ${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

export function boundsOf(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX,
    minY,
    width: Math.max(Math.max(...xs) - minX, 1),
    height: Math.max(Math.max(...ys) - minY, 1),
  };
}
