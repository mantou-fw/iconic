import { t } from "./i18n";
import {
  db,
  DEFAULT_TOOL_SETTINGS,
  type Drawing,
  type SchematicEdge,
  type SchematicNode,
  type ToolSettings,
  type ViewportState,
} from "./db";
import { DEFAULT_SIGNALS, type SignalDef } from "./signal-types";
import type { RoomItem, RoomSpec } from './room';
import { z } from 'zod';
import { roomDimensionsSchema, roomItemSchema, provenanceSchema } from '../../shared/ai-imports.mjs';

const savedRoom = roomDimensionsSchema.extend({
  id: z.literal('room'),
  name: z.string(),
  imports: z.array(z.object({ importId: z.string(), dimensionBasis: z.enum(['measured', 'estimated']), provenance: provenanceSchema })).optional(),
});
// Saved manual edits predate the stricter AI import contract. Keep authored
// strings intact and accept rotations beyond one turn when opening a project.
const savedItem = roomItemSchema.extend({
  id: z.string(), importId: z.string().optional(), color: z.string().optional(),
  label: z.string(), tag: z.string().optional(), note: z.string().optional(),
  rotation: z.number().finite(),
  size: z.object({ w: z.number().finite().positive(), h: z.number().finite().positive(), d: z.number().finite().positive() }),
});

export const PROJECT_VERSION = 1 as const;

export type ProjectFile = {
  kind: "av-schematic";
  version: typeof PROJECT_VERSION;
  savedAt: string;
  nodes: SchematicNode[];
  edges: SchematicEdge[];
  drawings: Drawing[];
  settings: ToolSettings;
  /** The drawing's signal legend. Optional so older exports still open. */
  signals?: SignalDef[];
  room?: RoomSpec;
  roomItems?: RoomItem[];
  viewport?: ViewportState;
};

/* ------------------------------------------------------------------ JSON */

export async function readProject(): Promise<ProjectFile> {
  const [nodes, edges, drawings, settings, signals, room, roomItems, viewport] = await Promise.all([
    db.nodes.toArray(),
    db.edges.toArray(),
    db.drawings.toArray(),
    db.settings.get("tools"),
    db.legend.get("signals"),
    db.room.get("room"),
    db.roomItems.toArray(),
    db.viewport.get('viewport'),
  ]);
  return {
    kind: "av-schematic",
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    nodes,
    edges,
    drawings,
    settings: settings ?? DEFAULT_TOOL_SETTINGS,
    signals: signals?.items ?? DEFAULT_SIGNALS,
    room,
    roomItems,
    viewport,
  };
}

/** Validates an opened file before it is allowed to replace the drawing. */
export function parseProject(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t("That file isn't valid JSON."));
  }
  const p = raw as Partial<ProjectFile>;
  if (p?.kind !== "av-schematic") {
    throw new Error(t("That JSON isn't an AV schematic project file."));
  }
  if (!Array.isArray(p.nodes) || !Array.isArray(p.edges)) {
    throw new Error(t("The project file is missing its nodes or edges."));
  }
  const room = p.room === undefined ? undefined : savedRoom.safeParse(p.room);
  const items = p.roomItems === undefined ? undefined : z.array(savedItem).safeParse(p.roomItems);
  if ((room && !room.success) || (items && !items.success)) throw new Error(t('Invalid room data in project.'));
  const viewport = z.object({ id: z.literal('viewport'), x: z.number().finite(), y: z.number().finite(), zoom: z.number().finite().positive() }).safeParse(p.viewport);
  return {
    kind: "av-schematic",
    version: PROJECT_VERSION,
    savedAt: p.savedAt ?? new Date().toISOString(),
    nodes: p.nodes,
    edges: p.edges,
    drawings: Array.isArray(p.drawings) ? p.drawings : [],
    settings: { ...DEFAULT_TOOL_SETTINGS, ...(p.settings ?? {}) },
    signals: Array.isArray(p.signals) && p.signals.length > 0 ? p.signals : DEFAULT_SIGNALS,
    ...(room?.success ? { room: room.data } : {}),
    ...(items?.success ? { roomItems: items.data } : {}),
    ...(viewport.success ? { viewport: viewport.data } : {}),
  };
}

/** Replaces the whole local drawing with an opened project. */
export async function writeProject(project: ProjectFile) {
  await db.transaction(
    "rw",
    [db.nodes, db.edges, db.drawings, db.settings, db.legend, db.room, db.roomItems],
    async () => {
      await Promise.all([db.nodes.clear(), db.edges.clear(), db.drawings.clear()]);
      await db.nodes.bulkPut(project.nodes);
      await db.edges.bulkPut(project.edges);
      await db.drawings.bulkPut(project.drawings);
      await db.settings.put({ ...project.settings, id: "tools" });
      await db.legend.put({ id: "signals", items: project.signals ?? DEFAULT_SIGNALS });
      if (project.room) await db.room.put(project.room);
      if (project.roomItems) {
        await db.roomItems.clear();
        await db.roomItems.bulkPut(project.roomItems);
      }
    },
  );
}
