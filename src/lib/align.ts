import type { Node } from "@xyflow/react";

export type AlignMode =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "middle-v"
  | "bottom";

export type DistributeMode = "horizontal" | "vertical";

type Box = { id: string; x: number; y: number; w: number; h: number };

/**
 * Aligns and distributes work in absolute flow coordinates, then convert back
 * to each node's own frame, so nodes inside a zone move correctly alongside
 * nodes on the open canvas.
 */
function measure(
  selected: Node[],
  absolute: (n: Node) => { x: number; y: number },
  size: (n: Node) => { w: number; h: number },
): Box[] {
  return selected.map((n) => {
    const at = absolute(n);
    const { w, h } = size(n);
    return { id: n.id, x: at.x, y: at.y, w, h };
  });
}

/** Returns the new absolute top-left for each node id. */
export function alignBoxes(
  selected: Node[],
  mode: AlignMode,
  absolute: (n: Node) => { x: number; y: number },
  size: (n: Node) => { w: number; h: number },
): Map<string, { x: number; y: number }> {
  const boxes = measure(selected, absolute, size);
  const moves = new Map<string, { x: number; y: number }>();
  if (boxes.length < 2) return moves;

  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  for (const b of boxes) {
    let { x, y } = b;
    switch (mode) {
      case "left":
        x = left;
        break;
      case "right":
        x = right - b.w;
        break;
      case "center-h":
        x = midX - b.w / 2;
        break;
      case "top":
        y = top;
        break;
      case "bottom":
        y = bottom - b.h;
        break;
      case "middle-v":
        y = midY - b.h / 2;
        break;
    }
    moves.set(b.id, { x: Math.round(x), y: Math.round(y) });
  }
  return moves;
}

/** Evens out the gaps between the outermost two nodes. */
export function distributeBoxes(
  selected: Node[],
  mode: DistributeMode,
  absolute: (n: Node) => { x: number; y: number },
  size: (n: Node) => { w: number; h: number },
): Map<string, { x: number; y: number }> {
  const boxes = measure(selected, absolute, size);
  const moves = new Map<string, { x: number; y: number }>();
  if (boxes.length < 3) return moves;

  const horizontal = mode === "horizontal";
  const sorted = [...boxes].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = horizontal
    ? last.x + last.w - first.x
    : last.y + last.h - first.y;
  const occupied = sorted.reduce((sum, b) => sum + (horizontal ? b.w : b.h), 0);
  const gap = (span - occupied) / (sorted.length - 1);

  let cursor = horizontal ? first.x : first.y;
  for (const b of sorted) {
    moves.set(
      b.id,
      horizontal
        ? { x: Math.round(cursor), y: b.y }
        : { x: b.x, y: Math.round(cursor) },
    );
    cursor += (horizontal ? b.w : b.h) + gap;
  }
  return moves;
}
