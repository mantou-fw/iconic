import { expect, test } from "bun:test";

import { presetCamera, VIEW_PRESETS, type ViewPreset } from "./room-view";
import { DEFAULT_ROOM } from "@/lib/room";

const room = { ...DEFAULT_ROOM, width: 6, depth: 5, height: 2.7 };
const cam = (p: ViewPreset) => presetCamera(p, room);

test("every listed preset has a camera placement", () => {
  for (const { id } of VIEW_PRESETS) {
    const { pos, target } = cam(id);
    expect(pos).toHaveLength(3);
    expect(target).toHaveLength(3);
    expect(pos.every((n) => Number.isFinite(n))).toBe(true);
  }
});

test("elevations sit outside the room and look back through it", () => {
  // Front stands beyond the far wall looking at the display wall (z = 0).
  const front = cam("front");
  expect(front.pos[2]!).toBeGreaterThan(room.depth);
  expect(front.target[2]).toBe(0);

  // Rear is the mirror of front.
  const rear = cam("rear");
  expect(rear.pos[2]!).toBeLessThan(0);
  expect(rear.target[2]).toBe(room.depth);

  // Left stands west of the room looking east, right is its mirror.
  expect(cam("left").pos[0]!).toBeLessThan(0);
  expect(cam("left").target[0]).toBe(room.width);
  expect(cam("right").pos[0]!).toBeGreaterThan(room.width);
  expect(cam("right").target[0]).toBe(0);
});

test("elevations stay centred on the other two axes", () => {
  expect(cam("front").pos[0]).toBe(room.width / 2);
  expect(cam("rear").pos[0]).toBe(room.width / 2);
  expect(cam("left").pos[2]).toBe(room.depth / 2);
  expect(cam("right").pos[2]).toBe(room.depth / 2);
});

test("top looks straight down from above the room", () => {
  const top = cam("top");
  expect(top.pos[1]!).toBeGreaterThan(room.height);
  expect(top.pos[0]).toBe(room.width / 2);
  expect(top.target[1]).toBe(0);
  // Nudged off dead centre, or the up-vector degenerates and the orbit flips.
  expect(top.pos[2]).not.toBe(top.target[2]);
});

test("iso is the three-quarter overview, above and outside two walls", () => {
  const iso = cam("iso");
  expect(iso.pos[0]!).toBeGreaterThan(room.width);
  expect(iso.pos[1]!).toBeGreaterThan(room.height);
  expect(iso.pos[2]!).toBeGreaterThan(room.depth);
  expect(iso.target).toEqual([room.width / 2, room.height / 3, room.depth / 2]);
});

test("placements scale with the room rather than being fixed", () => {
  const big = presetCamera("front", { ...room, width: 20, depth: 18 });
  const small = presetCamera("front", { ...room, width: 3, depth: 2.5 });
  expect(big.pos[2]!).toBeGreaterThan(small.pos[2]!);
});
