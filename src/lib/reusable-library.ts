import { ConflictError, Database, DocID } from "@couchbase/lite-js";
import { z } from "zod";
import type { AVDeviceData, DevicePort } from "@/components/nodes/av-device-node";
import { parseProject } from "./project";
import type { RoomItem, RoomSpec } from "./room";
import type { SignalDef } from "./signal-types";

export type LibraryContent =
  | { kind: "device"; device: AVDeviceData; signals: SignalDef[] }
  | { kind: "room"; room: RoomSpec; items: RoomItem[] };

export type LibraryRevision = { number: number; createdAt: string; content: LibraryContent };
export type LibraryEntry = { id: string; name: string; favorite: boolean; lastUsed: string; revisions: LibraryRevision[] };
type LibraryFile = { kind: "iconic-library"; version: 1; entries: LibraryEntry[] };
type LibraryDocument = { payload: string };

const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("device"), device: z.looseObject({
    name: z.string(), tag: z.string(), manufacturer: z.string(), model: z.string(),
    ports: z.array(z.looseObject({ signal: z.string(), connector: z.string(), libraryPortId: z.string().optional() })),
  }), signals: z.array(z.unknown()).default([]) }),
  z.object({ kind: z.literal("room"), room: z.unknown(), items: z.array(z.unknown()) }),
]).transform((content): LibraryContent => {
  const base = { kind: "av-schematic", version: 1, nodes: [], edges: [] };
  if (content.kind === "device") {
    const checked = parseProject(JSON.stringify({ ...base, signals: content.signals,
      nodes: [{ id: "definition", type: "database", position: { x: 0, y: 0 }, data: content.device }],
    }));
    return { kind: "device", device: checked.nodes[0]!.data as unknown as AVDeviceData, signals: checked.signals ?? [] };
  }
  const checked = parseProject(JSON.stringify({ ...base, room: content.room, roomItems: content.items }));
  if (!checked.room) throw new Error("Room template details are missing.");
  return { kind: "room", room: checked.room, items: checked.roomItems ?? [] };
});

const fileSchema = z.object({
  kind: z.literal("iconic-library"),
  version: z.literal(1),
  entries: z.array(z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    favorite: z.boolean(),
    lastUsed: z.string(),
    revisions: z.array(z.object({ number: z.number().int().positive(), createdAt: z.string(), content: contentSchema })).min(1),
  })),
}).superRefine((file, context) => {
  const ids = new Set<string>();
  for (const [i, entry] of file.entries.entries()) {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", path: ["entries", i, "id"], message: "Duplicate library ID." });
    ids.add(entry.id);
    const kind = entry.revisions[0]?.content.kind;
    entry.revisions.forEach((version, index) => {
      if (version.number !== index + 1 || version.content.kind !== kind) {
        context.addIssue({ code: "custom", path: ["entries", i, "revisions", index], message: "Invalid revision history." });
      }
    });
  }
});

export const libraryFile = (entries: LibraryEntry[]): LibraryFile => ({ kind: "iconic-library", version: 1, entries });
export const parseLibrary = (raw: string): LibraryFile => fileSchema.parse(JSON.parse(raw));

export function templateItems(items: RoomItem[], nextId: () => string): RoomItem[] {
  return items.map(item => ({
    ...structuredClone(item), id: nextId(), deviceId: undefined, linkStatus: "unlinked", tag: undefined,
  }));
}

export function deviceDefinition(device: AVDeviceData, signals: SignalDef[]): LibraryContent {
  const available = new Set(device.ports.map(port => port.signal));
  const copied = structuredClone(device);
  copied.ports = copied.ports.map(port => {
    const { libraryPortId, ...fields } = port;
    return { ...fields, id: libraryPortId ?? fields.id };
  });
  return { kind: "device", device: copied, signals: structuredClone(signals.filter(signal => available.has(signal.key))) };
}

export function instantiateDevice(definition: AVDeviceData, tag: string, nextId: () => string, previous: DevicePort[] = []): AVDeviceData {
  return {
    ...structuredClone(definition), tag,
    ports: definition.ports.map(port => {
      const key = port.libraryPortId ?? port.id;
      const matched = previous.find(item => (item.libraryPortId ?? item.id) === key && item.dir === port.dir);
      return { ...port, id: matched?.id ?? nextId(), libraryPortId: key };
    }),
  };
}

export class ReusableLibrary {
  private constructor(private database: Database<{ library: LibraryDocument }>) {}
  static async open() {
    return new ReusableLibrary(await Database.open<{ library: LibraryDocument }>({
      name: "iconic-reusable-library", version: 1, collections: { library: {} },
    }));
  }
  async list(): Promise<LibraryEntry[]> {
    const doc = await this.database.collections.library.getDocument(DocID("entries"));
    return doc ? parseLibrary(doc.payload).entries : [];
  }
  private async change(action: (items: LibraryEntry[]) => void) {
    const collection = this.database.collections.library;
    for (let attempt = 0; ; attempt++) {
      const doc = await collection.getDocument(DocID("entries")) ??
        collection.createDocument(DocID("entries"), { payload: JSON.stringify(libraryFile([])) });
      const items = parseLibrary(doc.payload).entries;
      action(items);
      doc.payload = JSON.stringify(libraryFile(items));
      try { await collection.save(doc); return items; }
      catch (error) { if (!(error instanceof ConflictError) || attempt >= 4) throw error; }
    }
  }
  save(name: string, content: LibraryContent, revisionOf?: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200) throw new Error("Enter a library name (1–200 characters).");
    const checked = contentSchema.parse(content);
    const id = revisionOf ?? crypto.randomUUID();
    const createdAt = new Date().toISOString();
    return this.change(items => {
      if (!revisionOf) {
        items.push({ id, name: trimmed, favorite: false, lastUsed: "", revisions: [{ number: 1, createdAt, content: checked }] });
        return;
      }
      const entry = items.find(item => item.id === id);
      if (!entry || entry.revisions[0]?.content.kind !== checked.kind) throw new Error("Library entry changed.");
      entry.revisions.push({ number: entry.revisions.length + 1, createdAt, content: checked });
    });
  }
  setFavorite(id: string, favorite: boolean) {
    return this.change(items => {
      const entry = items.find(item => item.id === id);
      if (entry) entry.favorite = favorite;
    });
  }
  markUsed(id: string) {
    const now = new Date().toISOString();
    return this.change(items => {
      const entry = items.find(item => item.id === id);
      if (entry && entry.lastUsed < now) entry.lastUsed = now;
    });
  }
  import(file: LibraryFile) {
    const ids = file.entries.map(() => crypto.randomUUID());
    return this.change(items => {
      items.push(...file.entries.map((entry, index) => ({ ...entry, id: ids[index]! })));
    });
  }
  close() { this.database.close(); }
}
