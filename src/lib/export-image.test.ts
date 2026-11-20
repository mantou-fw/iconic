import { expect, test } from "vitest";

import { rasterPixelRatio } from "./export-image";

test.each([
  [16_000, 2_000, 2, 0.5],
  [2_000, 16_000, 2, 0.5],
  [6_000, 6_000, 2, Math.sqrt(2 / 3)],
  [1_000, 2_000, 2, 2],
])("scales a %d × %d drawing within the raster budget", (width, height, scale, expected) => {
  const ratio = rasterPixelRatio(width, height, scale);
  expect(ratio).toBeCloseTo(expected);
  expect(Math.floor(Math.max(width, height) * ratio)).toBeLessThanOrEqual(8000);
  expect(Math.floor(width * ratio) * Math.floor(height * ratio)).toBeLessThanOrEqual(24_000_000);
});
