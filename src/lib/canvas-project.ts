import type { Node, Edge, Viewport } from '@xyflow/react';
import { DEFAULT_TOOL_SETTINGS, type ToolSettings, type SchematicNodeType } from './db';
import { DEFAULT_SIGNALS, type SignalDef } from './signal-types';
import { DEFAULT_ROOM, type RoomSpec, type RoomItem } from './room';
import type { ProjectFile } from './project';

export function blankProject(): ProjectFile {
  return { kind: 'av-schematic', version: 1, savedAt: new Date().toISOString(), nodes: [], edges: [], drawings: [], settings: { ...DEFAULT_TOOL_SETTINGS }, signals: structuredClone(DEFAULT_SIGNALS), room: { ...DEFAULT_ROOM }, roomItems: [] };
}

/** Capture current React state directly; exports and versions never lag autosave. */
export function captureCanvas(current: Node[], edges: Edge[], settings: ToolSettings, signals: SignalDef[], room: RoomSpec, roomItems: RoomItem[], viewport: Viewport): ProjectFile {
  return {
    kind: 'av-schematic', version: 1, savedAt: new Date().toISOString(),
    nodes: current.filter(n => n.type !== 'drawing').map(n => {
      const { autoFocus, ...data } = n.data;
      return { id: n.id, type: n.type as SchematicNodeType, position: n.position, data, width: n.width, height: n.height, parentId: n.parentId };
    }),
    drawings: current.filter(n => n.type === 'drawing').map(n => {
      const data = n.data as { points: { x: number; y: number }[]; color: string; strokeWidth: number };
      return { id: n.id, points: data.points.map(p => ({ x: p.x + n.position.x, y: p.y + n.position.y })), color: data.color, strokeWidth: data.strokeWidth };
    }),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
      label: e.data?.label as string | undefined, midX: e.data?.midX as number | undefined, midY: e.data?.midY as number | undefined,
      direction: e.data?.direction as 'forward' | 'backward' | 'both' | undefined })),
    settings, signals, room, roomItems, viewport: { id: 'viewport', ...viewport },
  };
}
