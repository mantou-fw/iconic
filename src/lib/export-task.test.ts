import { expect, test, vi } from "vitest";
import { createExportTask, type ExportTaskState } from "./export-task";
import { createFeatureLoader } from "./feature-loader";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("a failed export reports its cause and a retry can finish", async () => {
  const states: ExportTaskState[] = [];
  const task = createExportTask((state) => states.push(state));
  await task.run("png", async () => { throw new Error("Nothing to export — the canvas is empty."); });
  expect(states).toEqual([
    { format: "png", phase: "preparing" },
    { format: "png", phase: "error", message: "Nothing to export — the canvas is empty." },
  ]);
  expect(states.at(-1)?.loadFailed).toBeUndefined();
  await task.run("png", async () => undefined);
  expect(states.at(-1)).toEqual({ format: "png", phase: "ready" });
});

test("failed optional modules can recover through the same export task", async () => {
  const states: ExportTaskState[] = [];
  const download = vi.fn();
  const request = vi.fn<() => Promise<{ download: typeof download }>>()
    .mockRejectedValueOnce(new Error("chunk unavailable"))
    .mockResolvedValueOnce({ download });
  const feature = createFeatureLoader(request);
  const task = createExportTask((state) => states.push(state));
  const operation = async (signal: AbortSignal) => {
    const module = await feature.load();
    if (!signal.aborted) module.download();
  };

  await task.run("html", operation);
  expect(states.at(-1)?.phase).toBe("error");
  expect(states.at(-1)?.loadFailed).toBe(true);
  expect(download).not.toHaveBeenCalled();
  await task.run("html", operation);
  expect(states.at(-1)?.phase).toBe("ready");
  expect(states.at(-1)?.loadFailed).toBeUndefined();
  expect(download).toHaveBeenCalledTimes(1);
});

test("duplicate clicks do not start overlapping exports", async () => {
  const gate = deferred();
  const task = createExportTask(() => undefined);
  const first = task.run("xlsx", () => gate.promise);
  const second = vi.fn(async () => undefined);
  await task.run("pdf", second);
  expect(second).not.toHaveBeenCalled();
  gate.resolve();
  await first;
});

test("cancelled project work cannot download or replace a newer task's status", async () => {
  const gate = deferred();
  const download = vi.fn();
  const states: ExportTaskState[] = [];
  const task = createExportTask((state) => states.push(state));
  const old = task.run("pdf", async (signal) => {
    await gate.promise;
    if (!signal.aborted) download();
  });
  task.dismiss();
  expect(states.at(-1)).toBeNull();
  await task.run("html", async () => undefined);
  gate.resolve();
  await old;
  expect(download).not.toHaveBeenCalled();
  expect(states.at(-1)).toEqual({ format: "html", phase: "ready" });
});

test("unmount cancellation does not emit a late error state", async () => {
  const gate = deferred();
  const onState = vi.fn();
  const task = createExportTask(onState);
  const pending = task.run("svg", async () => { await gate.promise; throw new Error("late failure"); });
  task.cancel();
  gate.resolve();
  await pending;
  expect(onState).toHaveBeenCalledTimes(1);
});
