import { expect, test, vi } from "vitest";

const evaluated = vi.hoisted(() => [] as string[]);
vi.mock("../components/room-view", () => { evaluated.push("room"); return { RoomView: () => null }; });
vi.mock("./schedules", () => { evaluated.push("xlsx"); return { buildWorkbook: () => ({}) }; });
vi.mock("./export-image", () => { evaluated.push("image"); return { exportDrawing: async () => undefined }; });
vi.mock("./export-html", () => { evaluated.push("html"); return { buildViewerHtml: () => "" }; });

import { roomViewFeature, schedulesFeature, imageExportFeature, htmlExportFeature } from "./feature-imports";

test("optional implementations evaluate only when their feature is requested", async () => {
  expect(evaluated).toEqual([]);
  await htmlExportFeature.load();
  expect(evaluated).toEqual(["html"]);
  await imageExportFeature.load();
  expect(evaluated).toEqual(["html", "image"]);
  await schedulesFeature.load();
  expect(evaluated).toEqual(["html", "image", "xlsx"]);
  await roomViewFeature.load();
  expect(evaluated).toEqual(["html", "image", "xlsx", "room"]);
});
