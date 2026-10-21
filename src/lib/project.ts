import { t } from "./i18n";
import {
  db,
  DEFAULT_TOOL_SETTINGS,
  type Drawing,
  type SchematicEdge,
  type SchematicNode,
  type ToolSettings,
} from "./db";
import { DEFAULT_SIGNALS, type SignalDef } from "./signal-types";

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
};

/* ------------------------------------------------------------------ JSON */

export async function readProject(): Promise<ProjectFile> {
  const [nodes, edges, drawings, settings, signals] = await Promise.all([
    db.nodes.toArray(),
    db.edges.toArray(),
    db.drawings.toArray(),
    db.settings.get("tools"),
    db.legend.get("signals"),
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
  return {
    kind: "av-schematic",
    version: PROJECT_VERSION,
    savedAt: p.savedAt ?? new Date().toISOString(),
    nodes: p.nodes,
    edges: p.edges,
    drawings: Array.isArray(p.drawings) ? p.drawings : [],
    settings: { ...DEFAULT_TOOL_SETTINGS, ...(p.settings ?? {}) },
    signals: Array.isArray(p.signals) && p.signals.length > 0 ? p.signals : DEFAULT_SIGNALS,
  };
}

/** Replaces the whole local drawing with an opened project. */
export async function writeProject(project: ProjectFile) {
  await db.transaction(
    "rw",
    db.nodes,
    db.edges,
    db.drawings,
    db.settings,
    db.legend,
    async () => {
      await Promise.all([db.nodes.clear(), db.edges.clear(), db.drawings.clear()]);
      await db.nodes.bulkPut(project.nodes);
      await db.edges.bulkPut(project.edges);
      await db.drawings.bulkPut(project.drawings);
      await db.settings.put({ ...project.settings, id: "tools" });
      await db.legend.put({ id: "signals", items: project.signals ?? DEFAULT_SIGNALS });
    },
  );
}
