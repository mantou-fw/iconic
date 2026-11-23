import { expect, test, vi } from "vitest";
import { createFeatureLoader, FeatureLoadError } from "./feature-loader";

test("does not request a feature until use and shares a successful import", async () => {
  const module = { render: () => "room" };
  const request = vi.fn(async () => module);
  const feature = createFeatureLoader(request);
  expect(request).not.toHaveBeenCalled();
  expect(feature.peek()).toBeUndefined();

  const first = feature.load();
  expect(feature.load()).toBe(first);
  await expect(first).resolves.toBe(module);
  expect(feature.peek()).toBe(module);
  await expect(feature.load()).resolves.toBe(module);
  expect(request).toHaveBeenCalledTimes(1);
});

test("a transient chunk failure can be retried without reloading the document", async () => {
  const cause = new Error("temporary chunk failure");
  const module = { export: () => "file" };
  const request = vi.fn<() => Promise<typeof module>>()
    .mockRejectedValueOnce(cause).mockResolvedValueOnce(module);
  const feature = createFeatureLoader(request);

  await expect(feature.load()).rejects.toMatchObject({ name: "FeatureLoadError", cause });
  expect(feature.peek()).toBeUndefined();
  await expect(feature.load()).resolves.toBe(module);
  expect(request).toHaveBeenCalledTimes(2);
});

test("synchronous load failures also leave the feature retryable", async () => {
  const request = vi.fn(() => { throw new Error("failed loader"); });
  const feature = createFeatureLoader(request);
  await expect(feature.load()).rejects.toBeInstanceOf(FeatureLoadError);
  await expect(feature.load()).rejects.toBeInstanceOf(FeatureLoadError);
  expect(request).toHaveBeenCalledTimes(2);
});
