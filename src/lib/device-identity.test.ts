import { expect, test } from "vitest";

import { allocateTag, deviceLinkNeedsReview, displayDeviceTag, matchDevice, migrateDeviceLink } from "./device-identity";
import { parseProject } from "./project";
import { DEFAULT_ROOM, makeRoomItem } from "./room";

const devices = [
  { id: "one", tag: "DSP-01", name: "Main DSP" },
  { id: "two", tag: "dsp-01", name: "Backup DSP" },
  { id: "three", tag: "DSP-03", name: "Spare DSP" },
];

test("allocation skips existing normalized tags and reserves new tags for a batch", () => {
  const reserved = new Set(["DEV-01", "DEV-03", "DSP-01"]);
  expect(allocateTag(reserved)).toBe("DEV-02");
  expect(allocateTag(reserved)).toBe("DEV-04");
  expect(allocateTag(reserved, "dsp-01")).toBe("DSP-02");
});

test("stable IDs identify one device even when a legacy tag matches multiple devices", () => {
  expect(matchDevice(devices, "two")).toEqual([devices[1]]);
  expect(matchDevice(devices, "Dsp-01")).toEqual(devices.slice(0, 2));
  expect(matchDevice(devices, "  Spare dsp  ")).toEqual([devices[2]]);
});

test("legacy migration keeps authored fields and never guesses an ambiguous link after a rename", () => {
  const ambiguous = migrateDeviceLink({ tag: "dSp-01", label: "Display" }, devices);
  expect(ambiguous).toEqual({ tag: "dSp-01", label: "Display", linkStatus: "needs-review" });
  expect(migrateDeviceLink(ambiguous, devices.slice(1))).toBe(ambiguous);
  const known = migrateDeviceLink({ tag: "DSP-03", label: "Speaker" }, devices);
  const tags = new Map([["three", "SPK-35"]]);
  expect(displayDeviceTag(known, tags)).toBe("SPK-35");
  expect(known.tag).toBe("DSP-03");
  expect(deviceLinkNeedsReview(ambiguous, tags)).toBe(true);
  expect(deviceLinkNeedsReview(known, new Map())).toBe(true);
});

test("project JSON preserves stable links and pending review choices", () => {
  const item = makeRoomItem({ id: "display", kind: "tv", label: "Display", tag: "Original", deviceId: "one" }, DEFAULT_ROOM);
  const pending = { ...item, id: "pending", deviceId: undefined, linkStatus: "needs-review" as const };
  const project = parseProject(JSON.stringify({
    kind: "av-schematic", version: 1, nodes: [], edges: [], roomItems: [item, pending],
  }));
  expect(project.roomItems?.map(({ tag, deviceId, linkStatus }) => ({ tag, deviceId, linkStatus }))).toEqual([
    { tag: "Original", deviceId: "one", linkStatus: undefined },
    { tag: "Original", deviceId: undefined, linkStatus: "needs-review" },
  ]);
});
