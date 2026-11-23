import { expect, test, vi } from "vitest";
import { createReloadTask, type ReloadTaskState } from "./reload-task";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("reload waits for a successful save and a current-document check", async () => {
  const gate = deferred();
  const states: ReloadTaskState[] = [];
  const order: string[] = [];
  const task = createReloadTask((state) => states.push(state));
  const saving = task.run({
    save: async () => { order.push("save"); await gate.promise; order.push("saved"); },
    isCurrent: () => { order.push("current"); return true; },
    reload: () => { order.push("reload"); },
  });
  expect(order).toEqual(["save"]);
  expect(states).toEqual([{ phase: "saving" }]);
  gate.resolve();
  await saving;
  expect(order).toEqual(["save", "saved", "current", "reload"]);
  expect(states.at(-1)).toBeNull();
});

test.each([
  "This project changed in another window. Export your work before reopening the project.",
  "Disk full",
  "Project is closed.",
])("save rejection prevents reload and preserves the cause: %s", async (message) => {
  const onState = vi.fn();
  const reload = vi.fn();
  const task = createReloadTask(onState);
  const save = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce();
  await task.run({ save, isCurrent: () => true, reload });
  expect(reload).not.toHaveBeenCalled();
  expect(onState).toHaveBeenLastCalledWith({ phase: "error", message });
  await task.run({ save, isCurrent: () => true, reload });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("edits or a project change during save prevent reload", async () => {
  const onState = vi.fn();
  const reload = vi.fn();
  const task = createReloadTask(onState);
  await task.run({ save: async () => undefined, isCurrent: () => false, reload });
  expect(reload).not.toHaveBeenCalled();
  expect(onState).toHaveBeenLastCalledWith({
    phase: "error", message: "The drawing changed while saving. Please try Save and reload again.",
  });
});

test("unmount cancellation suppresses late reload and status updates", async () => {
  const gate = deferred();
  const onState = vi.fn();
  const reload = vi.fn();
  const task = createReloadTask(onState);
  const saving = task.run({ save: () => gate.promise, isCurrent: () => true, reload });
  task.cancel();
  gate.resolve();
  await saving;
  expect(reload).not.toHaveBeenCalled();
  expect(onState).toHaveBeenCalledTimes(1);
});

test("cancelled saves cannot clear or replace newer reload tasks", async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  const reload = vi.fn();
  const onState = vi.fn();
  const task = createReloadTask(onState);
  const old = task.run({ save: () => firstGate.promise, isCurrent: () => true, reload });
  task.dismiss();
  const current = task.run({ save: () => secondGate.promise, isCurrent: () => true, reload });
  firstGate.resolve();
  await old;
  const duplicate = vi.fn(async () => undefined);
  await task.run({ save: duplicate, isCurrent: () => true, reload });
  expect(duplicate).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(onState).toHaveBeenLastCalledWith({ phase: "saving" });
  secondGate.resolve();
  await current;
  expect(reload).toHaveBeenCalledTimes(1);
});

test("a cancelled save failure is not reported to the next project", async () => {
  const gate = deferred();
  const onState = vi.fn();
  const reload = vi.fn();
  const task = createReloadTask(onState);
  const saving = task.run({
    save: async () => { await gate.promise; throw new Error("late failure"); },
    isCurrent: () => true, reload,
  });
  task.cancel();
  gate.resolve();
  await saving;
  expect(reload).not.toHaveBeenCalled();
  expect(onState).toHaveBeenCalledTimes(1);
});
