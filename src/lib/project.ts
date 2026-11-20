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
import { projectSchema, validateGraph } from "./project-validation";

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
  if (p.version !== undefined && p.version !== PROJECT_VERSION) {
    throw new Error(`${t("Unsupported project format version.")} ${String(p.version)}`);
  }
  const result = projectSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const path = issue.path.reduce<string>((label, field) =>
      typeof field === "number" ? `${label}[${field}]` : `${label ? label + "." : ""}${String(field)}`, "");
    throw new Error(`${t("Invalid project field")} ${path}. ${issue.message}`);
  }
  const checked = result.data;
  validateGraph(checked);
  return {
    ...checked,
    kind: "av-schematic",
    // Early exports without a version marker used the same version-1 fields.
    version: PROJECT_VERSION,
    savedAt: checked.savedAt ?? new Date().toISOString(),
    settings: { ...DEFAULT_TOOL_SETTINGS, ...checked.settings },
    drawings: checked.drawings ?? [],
    signals: checked.signals?.length ? checked.signals : DEFAULT_SIGNALS,
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
