import type { RoomImportRecord } from './ai-imports';

/**
 * A simple 3D model of the space the AV system lives in, so a device on the
 * schematic can be tied to where it is physically mounted.
 *
 * Units are metres, with the room's near-left-floor corner at the origin:
 *   x → right along the room's width
 *   y → up
 *   z → back along the room's depth
 */
export type MountKind = "wall" | "ceiling" | "floor" | "table" | "rack";

export type ItemKind =
  | "tv"
  | "projector"
  | "screen"
  | "speaker"
  | "subwoofer"
  | "rack"
  | "camera"
  | "keypad"
  | "table"
  | "desk"
  | "sofa"
  | "chair"
  | "cabinet"
  | "rug"
  | "plant"
  | "door"
  | "window";

/** Which item kinds are AV equipment rather than furniture. */
export const DEVICE_KINDS: ItemKind[] = [
  "tv", "projector", "screen", "speaker", "subwoofer", "rack", "camera", "keypad",
];

export const isDeviceKind = (kind: ItemKind) => DEVICE_KINDS.includes(kind);

export type RoomItem = {
  importId?: string;
  id: string;
  kind: ItemKind;
  label: string;
  /** Device tag on the schematic, when this item represents one. */
  tag?: string;
  /** Centre of the item, in metres. */
  position: { x: number; y: number; z: number };
  /** Size in metres. Sensible per-kind defaults are filled in on create. */
  size: { w: number; h: number; d: number };
  /** Rotation about the vertical axis, in degrees. */
  rotation: number;
  mount: MountKind;
  color?: string;
  note?: string;
};

export type RoomSpec = {
  imports?: RoomImportRecord[];
  id: "room";
  name: string;
  width: number;
  depth: number;
  height: number;
};

export const DEFAULT_ROOM: RoomSpec = {
  id: "room",
  name: "Living Room",
  width: 6,
  depth: 5,
  height: 2.7,
};

/** Default footprint and mounting for each kind, in metres. */
export const KIND_DEFAULTS: Record<
  ItemKind,
  { size: { w: number; h: number; d: number }; mount: MountKind; color: string }
> = {
  tv:        { size: { w: 1.4,  h: 0.8,  d: 0.07 }, mount: "wall",    color: "#1f2937" },
  projector: { size: { w: 0.35, h: 0.14, d: 0.3  }, mount: "ceiling", color: "#475569" },
  screen:    { size: { w: 2.4,  h: 1.4,  d: 0.05 }, mount: "wall",    color: "#e2e8f0" },
  speaker:   { size: { w: 0.22, h: 0.32, d: 0.2  }, mount: "wall",    color: "#334155" },
  subwoofer: { size: { w: 0.4,  h: 0.42, d: 0.4  }, mount: "floor",   color: "#1e293b" },
  rack:      { size: { w: 0.6,  h: 1.4,  d: 0.6  }, mount: "floor",   color: "#0f172a" },
  camera:    { size: { w: 0.14, h: 0.1,  d: 0.12 }, mount: "wall",    color: "#52525b" },
  keypad:    { size: { w: 0.12, h: 0.12, d: 0.02 }, mount: "wall",    color: "#64748b" },
  table:     { size: { w: 1.2,  h: 0.45, d: 0.7  }, mount: "floor",   color: "#b08968" },
  desk:      { size: { w: 1.6,  h: 0.75, d: 0.7  }, mount: "floor",   color: "#a1785a" },
  sofa:      { size: { w: 2.1,  h: 0.8,  d: 0.9  }, mount: "floor",   color: "#7f8c9b" },
  chair:     { size: { w: 0.55, h: 0.9,  d: 0.55 }, mount: "floor",   color: "#8d9aa8" },
  cabinet:   { size: { w: 1.6,  h: 0.5,  d: 0.45 }, mount: "floor",   color: "#9c6f4e" },
  rug:       { size: { w: 2.4,  h: 0.02, d: 1.6  }, mount: "floor",   color: "#c2b8a3" },
  plant:     { size: { w: 0.5,  h: 1.1,  d: 0.5  }, mount: "floor",   color: "#4d7c4a" },
  door:      { size: { w: 0.9,  h: 2.05, d: 0.06 }, mount: "wall",    color: "#94a3b8" },
  window:    { size: { w: 1.4,  h: 1.2,  d: 0.06 }, mount: "wall",    color: "#bae6fd" },
};

/** Typical mounting height for a kind, used when no y is supplied. */
export function defaultHeight(kind: ItemKind, room: RoomSpec): number {
  const d = KIND_DEFAULTS[kind];
  switch (d.mount) {
    case "ceiling":
      return room.height - d.size.h / 2 - 0.05;
    case "wall":
      // Screens sit at eye level; small wall devices a little higher.
      if (kind === "tv" || kind === "screen") return 1.35;
      if (kind === "keypad") return 1.1;
      if (kind === "door") return d.size.h / 2;
      if (kind === "window") return 1.4;
      return 2.1;
    case "table":
      return 0.8;
    default:
      return d.size.h / 2;
  }
}

/** Fills in defaults so an agent only has to supply what it cares about. */
export function makeRoomItem(
  partial: Partial<RoomItem> & { kind: ItemKind; label: string; id: string },
  room: RoomSpec,
): RoomItem {
  const d = KIND_DEFAULTS[partial.kind];
  const size = { ...d.size, ...(partial.size ?? {}) };
  const position = {
    x: partial.position?.x ?? room.width / 2,
    y: partial.position?.y ?? defaultHeight(partial.kind, room),
    z: partial.position?.z ?? room.depth / 2,
  };
  return {
    id: partial.id,
    kind: partial.kind,
    label: partial.label,
    tag: partial.tag,
    position,
    size,
    rotation: partial.rotation ?? 0,
    mount: partial.mount ?? d.mount,
    color: partial.color ?? d.color,
    note: partial.note,
  };
}
