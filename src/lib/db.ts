import Dexie, { type EntityTable } from "dexie";

import type { RoomItem, RoomSpec } from "./room";
import type { SignalDef } from "./signal-types";

export type SchematicNodeType =
  | "text"
  | "memo"
  | "image"
  | "database"
  | "icon-text"
  | "shape"
  | "zone"
  | "titleblock"
  | "rack";

export interface SchematicNode {
  id: string;
  type: SchematicNodeType;
  /** Relative to `parentId` when the node sits inside a zone. */
  position: { x: number; y: number };
  data: Record<string, any>;
  width?: number;
  height?: number;
  /** Zone this node belongs to, if any. */
  parentId?: string;
}

export interface SchematicEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** Cable / link designation drawn on the connection. */
  label?: string;
  /** X of the cable's vertical leg; undefined routes automatically. */
  midX?: number;
  /** Y of the cable's horizontal leg; undefined routes automatically. */
  midY?: number;
  /** Which end(s) get an arrowhead; only meaningful on plain arrow edges. */
  direction?: "forward" | "backward" | "both";
}

export interface Drawing {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

export interface ViewportState {
  id: "viewport";
  x: number;
  y: number;
  zoom: number;
}

/** Sticky per-tool defaults driven by the properties panel. */
export interface ToolSettings {
  id: "tools";
  penColor: string;
  penWidth: number;
  textColor: string;
  textSize: number;
  memoColor: string;
  /** Snap node dragging to the grid. */
  snapToGrid: boolean;
  gridSize: number;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  id: "tools",
  penColor: "#dc2626",
  penWidth: 2,
  textColor: "#0f172a",
  textSize: 14,
  memoColor: "#fef08a",
  snapToGrid: false,
  gridSize: 8,
};

/** The drawing's signal legend, kept alongside the other sticky settings. */
export interface SignalSettings {
  id: "signals";
  items: SignalDef[];
}

const db = new Dexie("av-schematic-db") as Dexie & {
  room: EntityTable<RoomSpec, "id">;
  roomItems: EntityTable<RoomItem, "id">;
  nodes: EntityTable<SchematicNode, "id">;
  edges: EntityTable<SchematicEdge, "id">;
  drawings: EntityTable<Drawing, "id">;
  viewport: EntityTable<ViewportState, "id">;
  settings: EntityTable<ToolSettings, "id">;
  legend: EntityTable<SignalSettings, "id">;
};

db.version(1).stores({
  nodes: "id",
  edges: "id",
  drawings: "id",
  viewport: "id",
});

db.version(2).stores({
  nodes: "id",
  edges: "id",
  drawings: "id",
  viewport: "id",
  settings: "id",
});

// v3 adds the physical room model that the 3D view reads.
db.version(3).stores({
  nodes: "id",
  edges: "id",
  drawings: "id",
  viewport: "id",
  settings: "id",
  room: "id",
  roomItems: "id",
});

// v4 adds the configurable signal legend, in its own table so its shape
// never has to share a union type with the unrelated ToolSettings row.
db.version(4).stores({
  nodes: "id",
  edges: "id",
  drawings: "id",
  viewport: "id",
  settings: "id",
  room: "id",
  roomItems: "id",
  legend: "id",
});

export { db };
