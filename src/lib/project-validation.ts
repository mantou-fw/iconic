import { z } from "zod";
import { provenanceSchema, roomDimensionsSchema, roomItemSchema } from "../../shared/ai-imports.mjs";

import { t } from "./i18n";

const id = z.string().refine((value) => value.trim().length > 0);
const text = z.string();
const number = z.number().finite();
const positive = number.positive();
const position = z.looseObject({ x: number, y: number });
const note = z.looseObject({ text, color: text.optional(), fontSize: positive.optional() });

const port = z.looseObject({
  id, label: text, dir: z.enum(["in", "out"]),
  connector: text.optional(), signal: id.optional(),
});
const device = z.looseObject({
  tag: text.optional(), name: text.optional(), manufacturer: text.optional(), model: text.optional(),
  label: text.optional(), v: number.optional(),
  ports: z.array(port).optional(),
  fields: z.array(z.looseObject({ id: id.optional(), name: text.optional(), type: text.optional() })).optional(),
  dimensions: z.looseObject({ w: positive, h: positive, d: positive }).partial().optional(),
  rackUnits: positive.optional(), provenance: provenanceSchema.optional(),
});
const linkStatus = z.enum(["needs-review", "unlinked"]).optional();
const rack = z.looseObject({
  tag: text.optional(), name: text.optional(),
  units: z.number().int().min(1).max(100).optional(),
  items: z.array(z.looseObject({
    id, label: text, u: z.number().int().positive(), height: z.number().int().positive(),
    tag: text.optional(), deviceId: id.optional(), linkStatus, color: text.optional(),
  })).optional(),
});
const titleFields = [
  "company", "address", "cityStateZip", "phone", "website", "client", "project",
  "projectNumber", "title", "description", "projectManager", "drawnBy", "checkedBy",
  "date", "revised", "rev", "scale", "page", "notice",
] as const;
const title = z.looseObject(Object.fromEntries(titleFields.map((field) => [field, text.optional()])));
const nodeBase = z.looseObject({ id, position, parentId: id.optional(), width: positive.optional(), height: positive.optional() });

const node = z.discriminatedUnion("type", [
  nodeBase.extend({ type: z.literal("text"), data: note }),
  nodeBase.extend({ type: z.literal("memo"), data: note }),
  nodeBase.extend({ type: z.literal("database"), data: device }),
  nodeBase.extend({ type: z.literal("rack"), data: rack }),
  nodeBase.extend({ type: z.literal("titleblock"), data: title }),
  nodeBase.extend({ type: z.literal("image"), data: z.looseObject({ src: id }) }),
  nodeBase.extend({ type: z.literal("zone"), data: z.looseObject({ name: text.optional(), color: text.optional() }) }),
  nodeBase.extend({ type: z.literal("icon-text"), data: z.looseObject({ icon: text, label: text }) }),
  nodeBase.extend({ type: z.literal("shape"), data: z.looseObject({
    shape: z.enum(["rectangle", "ellipse", "diamond", "triangle"]), text, color: text.optional(),
  }) }),
]);

const edge = z.looseObject({
  id, source: id, target: id, sourceHandle: id.nullish(), targetHandle: id.nullish(),
  label: text.optional(), midX: number.optional(), midY: number.optional(),
  direction: z.enum(["forward", "backward", "both"]).optional(),
});
const drawing = z.looseObject({ id, points: z.array(position).min(1), color: text, strokeWidth: positive });
const settings = z.looseObject({
  id: z.literal("tools"), penColor: text, penWidth: positive, textColor: text,
  textSize: positive, memoColor: text, snapToGrid: z.boolean(), gridSize: positive,
}).partial();
const signal = z.looseObject({ key: id, label: text, short: text, color: text });
const room = roomDimensionsSchema.extend({
  id: z.literal("room"),
  name: text,
  imports: z.array(z.looseObject({
    importId: id, dimensionBasis: z.enum(["measured", "estimated"]), provenance: provenanceSchema,
  })).optional(),
}).loose();
// Saved rooms can have manual rotations and labels outside AI import constraints.
const roomItem = roomItemSchema.extend({
  id, importId: id.optional(), color: text.optional(), label: text,
  tag: text.optional(), deviceId: id.optional(), linkStatus, note: text.optional(),
  rotation: number,
  size: z.looseObject({ w: positive, h: positive, d: positive }),
}).loose();

export const projectSchema = z.looseObject({
  kind: z.literal("av-schematic"), version: z.literal(1).optional(), savedAt: text.optional(),
  nodes: z.array(node), edges: z.array(edge), drawings: z.array(drawing).optional(),
  settings: settings.optional(), signals: z.array(signal).optional(),
  room: room.optional(), roomItems: z.array(roomItem).optional(),
  viewport: z.looseObject({ id: z.literal("viewport"), x: number, y: number, zoom: positive }).optional(),
});

type StoredNode = z.infer<typeof node>;
type ProjectShape = z.infer<typeof projectSchema>;

const invalid = (path: string, message: string): never => {
  throw new Error(`${t("Invalid project field")} ${path}. ${t(message)}`);
};

function unique<T>(items: T[], keyOf: (value: T) => string, path: string, field = "id") {
  const seen = new Set<string>();
  items.forEach((value, index) => {
    const key = keyOf(value);
    if (seen.has(key)) invalid(`${path}[${index}].${field}`, "Identifier is already used.");
    seen.add(key);
  });
}

function validHandle(node: StoredNode, handle: string | null | undefined, output: boolean) {
  if (node.type === "database") {
    const direction = output ? "out" : "in";
    if (node.data.ports) return node.data.ports.some((port) => port.id === handle && port.dir === direction);
    return node.data.fields?.some((field, index) => (index % 2 === 1) === output && field.id === handle) ?? false;
  }
  if (node.type !== "shape" && node.type !== "icon-text") return false;
  if (!handle) return true;
  return ["left", "right", "top", "bottom"].some((side) => handle === `${side}-${output ? "source" : "target"}`);
}

export function validateGraph(project: ProjectShape) {
  unique(project.nodes, (value) => value.id, "nodes");
  unique(project.edges, (value) => value.id, "edges");
  unique(project.drawings ?? [], (value) => value.id, "drawings");
  unique(project.roomItems ?? [], (value) => value.id, "roomItems");
  unique(project.signals ?? [], (value) => value.key, "signals", "key");

  const byId = new Map(project.nodes.map((value) => [value.id, value]));
  project.drawings?.forEach((value, index) => {
    if (byId.has(value.id)) invalid(`drawings[${index}].id`, "Identifier is already used.");
  });

  const verified = new Set<string>();
  project.nodes.forEach((value, index) => {
    if (value.type === "database") unique(value.data.ports ?? [], (entry) => entry.id, `nodes[${index}].data.ports`);
    if (value.type === "rack") unique(value.data.items ?? [], (entry) => entry.id, `nodes[${index}].data.items`);
    const trail = new Set<string>();
    let cursor: StoredNode | undefined = value;
    while (cursor && !verified.has(cursor.id)) {
      if (trail.has(cursor.id)) invalid(`nodes[${index}].parentId`, "Parent references form a cycle.");
      trail.add(cursor.id);
      const parentId: string | undefined = cursor.parentId;
      cursor = parentId ? byId.get(parentId) : undefined;
      if (parentId && cursor?.type !== "zone") invalid(`nodes[${index}].parentId`, "Parent must reference an existing zone.");
    }
    for (const key of trail) verified.add(key);
  });

  project.edges.forEach((value, index) => {
    const source = byId.get(value.source) ?? invalid(`edges[${index}].source`, "Connection references a missing node.");
    const target = byId.get(value.target) ?? invalid(`edges[${index}].target`, "Connection references a missing node.");
    if (!validHandle(source, value.sourceHandle, true)) invalid(`edges[${index}].sourceHandle`, "Connection references a missing or incompatible port.");
    if (!validHandle(target, value.targetHandle, false)) invalid(`edges[${index}].targetHandle`, "Connection references a missing or incompatible port.");
  });
}
