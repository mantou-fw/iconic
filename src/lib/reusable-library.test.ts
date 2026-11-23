import "fake-indexeddb/auto";
import { Database } from "@couchbase/lite-js";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import { deviceDefinition, instantiateDevice, libraryFile, parseLibrary, ReusableLibrary, templateItems } from "./reusable-library";
import { DEFAULT_ROOM, makeRoomItem } from "./room";
import type { AVDeviceData } from "@/components/nodes/av-device-node";

Database.useIndexedDB(indexedDB, IDBKeyRange);
afterEach(async () => { await Database.delete("iconic-reusable-library"); });

const device: AVDeviceData = {
  tag: "DSP-01", name: "Processor", manufacturer: "Example", model: "QA-1",
  ports: [{ id: "definition-out", label: "Output", dir: "out", connector: "XLR", signal: "audio" }],
  provenance: { sources: [{ label: "Datasheet" }], confidence: "medium", assumptions: ["Verify cable"] },
};

test("retains previous definitions, independent instance identities and portable revisions", async () => {
  const library = await ReusableLibrary.open();
  try {
    const [entry] = await library.save("Processor", deviceDefinition(device, []));
    const first = instantiateDevice(device, "DSP-01", () => "instance-one");
    const second = instantiateDevice(device, "DSP-02", () => "instance-two");
    expect(first).toMatchObject({ tag: "DSP-01", ports: [{ id: "instance-one" }] });
    expect(second).toMatchObject({ tag: "DSP-02", ports: [{ id: "instance-two" }] });
    const changed = { ...device, model: "QA-2" };
    await library.save("Processor", deviceDefinition(changed, []), entry!.id);
    await library.setFavorite(entry!.id, true);
    await library.markUsed(entry!.id);
    const exported = parseLibrary(JSON.stringify(libraryFile(await library.list())));
    expect(exported.entries[0]).toMatchObject({ favorite: true, revisions: [
      { number: 1, content: { device: { model: "QA-1", provenance: { assumptions: ["Verify cable"] } } } },
      { number: 2, content: { device: { model: "QA-2" } } },
    ] });
    expect(first.model).toBe("QA-1");
    expect(instantiateDevice(changed, first.tag, () => "unused", first.ports).ports[0]!.id).toBe("instance-one");
    const imported = (await library.import(exported))[1]!;
    expect(imported.id).not.toBe(entry!.id);
    expect(imported.revisions).toEqual(exported.entries[0]!.revisions);
  } finally { library.close(); }
});

test("room templates clone placement and use new identities without cross-project links", () => {
  const source = makeRoomItem({ id: "source", kind: "tv", label: "Authored label", deviceId: "original-device", tag: "TV-01" }, DEFAULT_ROOM);
  const first = templateItems([source], () => "first")[0]!;
  const second = templateItems([source], () => "second")[0]!;
  first.position.x = 2;
  expect(second.position).toEqual(source.position);
  expect(first).toMatchObject({ id: "first", label: "Authored label", linkStatus: "unlinked" });
  expect(first.deviceId).toBeUndefined();
  expect(source.deviceId).toBe("original-device");
});
