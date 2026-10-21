import { expect, test } from "vitest";
import type { Node } from "@xyflow/react";

import { alignBoxes, distributeBoxes } from "./align";

const node = (id: string, x: number, y: number, w: number, h: number): Node => ({
  id,
  position: { x, y },
  data: {},
  width: w,
  height: h,
});

const absolute = (n: Node) => n.position;
const size = (n: Node) => ({ w: (n.width as number) ?? 0, h: (n.height as number) ?? 0 });

const align = (nodes: Node[], mode: Parameters<typeof alignBoxes>[1]) =>
  alignBoxes(nodes, mode, absolute, size);

test("align left snaps every node to the leftmost edge", () => {
  const nodes = [node("a", 100, 0, 50, 20), node("b", 40, 60, 80, 20)];
  const moves = align(nodes, "left");
  expect(moves.get("a")).toEqual({ x: 40, y: 0 });
  expect(moves.get("b")).toEqual({ x: 40, y: 60 });
});

test("align right accounts for differing widths", () => {
  const nodes = [node("a", 100, 0, 50, 20), node("b", 40, 60, 80, 20)];
  // Rightmost edge is a: 100 + 50 = 150.
  const moves = align(nodes, "right");
  expect(moves.get("a")).toEqual({ x: 100, y: 0 });
  expect(moves.get("b")).toEqual({ x: 70, y: 60 });
});

test("align centres puts every midpoint on the same axis", () => {
  const nodes = [node("a", 0, 0, 100, 20), node("b", 200, 60, 40, 20)];
  const moves = align(nodes, "center-h");
  const centreOf = (id: string, w: number) => moves.get(id)!.x + w / 2;
  expect(centreOf("a", 100)).toBe(centreOf("b", 40));
});

test("align middles matches vertical centres and leaves x alone", () => {
  const nodes = [node("a", 0, 0, 20, 100), node("b", 300, 200, 20, 40)];
  const moves = align(nodes, "middle-v");
  expect(moves.get("a")!.x).toBe(0);
  expect(moves.get("b")!.x).toBe(300);
  expect(moves.get("a")!.y + 50).toBe(moves.get("b")!.y + 20);
});

test("a single node is never moved", () => {
  expect(align([node("a", 10, 10, 20, 20)], "left").size).toBe(0);
});

test("distribute evens the gaps and keeps the outer nodes put", () => {
  const nodes = [
    node("a", 0, 0, 100, 20),
    node("b", 130, 0, 100, 20),
    node("c", 500, 0, 100, 20),
  ];
  const moves = distributeBoxes(nodes, "horizontal", absolute, size);
  // Span 0..600 holds 300px of node, so each of the two gaps is 150.
  expect(moves.get("a")!.x).toBe(0);
  expect(moves.get("b")!.x).toBe(250);
  expect(moves.get("c")!.x).toBe(500);
});

test("distribute needs at least three nodes", () => {
  const nodes = [node("a", 0, 0, 10, 10), node("b", 100, 0, 10, 10)];
  expect(distributeBoxes(nodes, "horizontal", absolute, size).size).toBe(0);
});
