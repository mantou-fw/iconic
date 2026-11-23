import { expect, test } from "vitest";

import { crossings, type Rect } from "./obstacles";
import { avoidObstacles, orthogonalRoute } from "./routing";

const source = { id: "source", x: 0, y: 0, w: 268, h: 100 };
const target = { id: "target", x: 600, y: 0, w: 268, h: 100 };
const remote = { id: "other", x: 1200, y: 0, w: 268, h: 100 };
const from = { x: 268, y: 73 };
const to = { x: 600, y: 73 };
const ends = { sourceId: source.id, targetId: target.id };

test("scores a clear connection once and preserves its route", () => {
  let passes = 0;
  const counted = { ...remote, get w() { passes++; return remote.w; } };
  const route = avoidObstacles(from, to, "right", "left", [source, target, counted], undefined, undefined, 0, ends);
  expect(route.points).toEqual(orthogonalRoute(from, to, "right", "left").points);
  expect(passes).toBe(1);
  expect(crossings(route.points, [source, target, remote], { id: source.id, side: "right" }, { id: target.id, side: "left" })).toBe(0);
});

test("does not exempt re-entry into the source or passing through the target", () => {
  const score = (points: {x: number; y: number}[], rects: Rect[]) =>
    crossings(points, rects, { id: source.id, side: "right" }, { id: target.id, side: "left" });
  expect(score([
    from, { x: 300, y: 73 }, { x: 300, y: 50 }, { x: 200, y: 50 },
  ], [source])).toBe(1);
  expect(score([
    { x: 900, y: 30 }, { x: 590, y: 30 }, { x: 590, y: 73 }, to,
  ], [target])).toBe(1);
  expect(score([from, { x: 200, y: 73 }], [source])).toBe(1);
  expect(score([from, { x: 300, y: 73 }, from], [source])).toBe(1);
});

test("steers around an intervening device without moving locked axes", () => {
  const farther = { ...target, x: 900, y: 120 };
  const endpoint = { x: farther.x, y: 180 };
  const blocker = { x: 530, y: 100, w: 150, h: 130, id: "blocker" };
  const obstacles = [source, farther, blocker];
  const route = avoidObstacles(from, endpoint, "right", "left", obstacles, undefined, undefined, 0, ends);
  expect(route.mx).toBeGreaterThan(blocker.x + blocker.w);
  expect(crossings(route.points, obstacles, { id: source.id, side: "right" }, { id: target.id, side: "left" })).toBe(0);

  const manual = avoidObstacles(from, endpoint, "right", "left", obstacles, 590, -100, 2, ends);
  expect(manual).toEqual(orthogonalRoute(from, endpoint, "right", "left", 590, -100, 2));
});

test("counts a tightly spaced neighboring device even on a cable's first segment", () => {
  const neighbor = { ...remote, x: 276 };
  expect(crossings([from, { x: 290, y: 73 }], [source, neighbor], { id: source.id, side: "right" })).toBe(1);
  const tight = orthogonalRoute(from, { x: 276, y: 100 }, "right", "left");
  expect(tight.points).toContainEqual({ x: 286, y: 73 });
  expect(crossings(tight.points, [source], { id: source.id, side: "right" })).toBeGreaterThan(0);
});

test("cuts off a candidate score once it can no longer beat the current route", () => {
  const first = { x: 350, y: 0, w: 50, h: 100 };
  const second = { x: 450, y: 0, w: 50, h: 100 };
  let scoredSecond = false;
  const counted = { ...second, get w() { scoredSecond = true; return second.w; } };
  expect(crossings([from, to], [first, counted], undefined, undefined, 1)).toBe(1);
  expect(scoredSecond).toBe(false);
  expect(crossings([from, to], [first, counted])).toBe(2);
});

test("skips obstacle scoring when both axes are locked", () => {
  let scored = false;
  const counted = { ...remote, get w() { scored = true; return remote.w; } };
  expect(avoidObstacles(from, to, "right", "left", [counted], 430, 190)).toEqual(
    orthogonalRoute(from, to, "right", "left", 430, 190),
  );
  expect(scored).toBe(false);
});

test("preserves distinct fan-out routes and absolute coordinates in nested zones", () => {
  const shift = { x: 340, y: 60 };
  const inZone = <T extends { x: number; y: number }>(p: T) => ({ ...p, x: p.x + shift.x, y: p.y + shift.y });
  const endpoint = { x: target.x, y: 90 };
  const route = (lane: number) => avoidObstacles(from, endpoint, "right", "left", [source, target], undefined, undefined, lane, ends);
  expect(route(-1).mx).toBeLessThan(route(1).mx);
  const nested = avoidObstacles(inZone(from), inZone(endpoint), "right", "left", [inZone(source), inZone(target)], undefined, undefined, 1, ends);
  expect(nested.points).toEqual(route(1).points.map(inZone));
});
