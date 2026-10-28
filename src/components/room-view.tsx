import { ImportEvidence } from "@/components/import-evidence";

import { useT } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Grid,
  Html,
  OrbitControls,
  RoundedBox,
  TransformControls,
} from "@react-three/drei";
import {
  Boxes,
  Grid2x2,
  Move,
  Move3d,
  RotateCw,
  Rotate3d,
  X,
} from "lucide-react";
import * as THREE from "three";

import {
  isDeviceKind,
  type ItemKind,
  type RoomItem,
  type RoomSpec,
} from "@/lib/room";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ meshes */

/**
 * Items are drawn as simple primitives rather than models: the point is to see
 * where things are mounted, and a schematic tool has no business shipping a
 * furniture asset library.
 */
function ItemMesh({
  item,
  selected,
  onSelect,
  register,
}: {
  item: RoomItem;
  selected: boolean;
  onSelect: () => void;
  /** Hands the group to the parent so TransformControls can attach to it. */
  register?: (id: string, group: THREE.Group | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { w, h, d } = item.size;
  const { x, y, z } = item.position;
  const highlight = selected || hovered;
  const color = item.color ?? "#64748b";

  const body = (() => {
    switch (item.kind) {
      case "speaker":
      case "subwoofer":
        return (
          <RoundedBox args={[w, h, d]} radius={0.02} smoothness={3}>
            <meshStandardMaterial color={color} roughness={0.7} />
          </RoundedBox>
        );
      case "tv":
      case "screen":
        // A thin panel with a lighter face, so it reads as a display.
        return (
          <group>
            <mesh>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, d / 2 + 0.002]}>
              <planeGeometry args={[w * 0.94, h * 0.9]} />
              <meshStandardMaterial
                color={item.kind === "tv" ? "#0b1220" : "#f8fafc"}
                roughness={0.35}
                metalness={0.1}
              />
            </mesh>
          </group>
        );
      case "plant":
        return (
          <group>
            <mesh position={[0, -h / 2 + 0.12, 0]}>
              <cylinderGeometry args={[w * 0.28, w * 0.22, 0.24, 12]} />
              <meshStandardMaterial color="#8d6e52" />
            </mesh>
            <mesh position={[0, h * 0.15, 0]}>
              <sphereGeometry args={[w * 0.45, 12, 10]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          </group>
        );
      case "table":
      case "desk":
      case "cabinet": {
        const top = 0.06;
        const legInset = 0.08;
        const legH = h - top;
        return (
          <group>
            <mesh position={[0, h / 2 - top / 2, 0]}>
              <boxGeometry args={[w, top, d]} />
              <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([sx, sz], i) => (
              <mesh
                key={i}
                position={[
                  sx! * (w / 2 - legInset),
                  -top / 2,
                  sz! * (d / 2 - legInset),
                ]}
              >
                <boxGeometry args={[0.06, legH, 0.06]} />
                <meshStandardMaterial color={color} roughness={0.9} />
              </mesh>
            ))}
          </group>
        );
      }
      case "sofa":
        return (
          <group>
            <RoundedBox
              args={[w, h * 0.45, d]}
              radius={0.05}
              position={[0, -h * 0.27, 0]}
            >
              <meshStandardMaterial color={color} roughness={0.95} />
            </RoundedBox>
            <RoundedBox
              args={[w, h * 0.55, d * 0.28]}
              radius={0.05}
              position={[0, h * 0.05, -d * 0.36]}
            >
              <meshStandardMaterial color={color} roughness={0.95} />
            </RoundedBox>
          </group>
        );
      default:
        return (
          <RoundedBox args={[w, h, d]} radius={0.015} smoothness={2}>
            <meshStandardMaterial color={color} roughness={0.8} />
          </RoundedBox>
        );
    }
  })();

  return (
    <group
      ref={(g) => register?.(item.id, g)}
      position={[x, y, z]}
      rotation={[0, THREE.MathUtils.degToRad(item.rotation), 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {body}

      {/* Selection cage */}
      {highlight && (
        <mesh>
          <boxGeometry
            args={[w * 1.06 + 0.03, h * 1.06 + 0.03, d * 1.06 + 0.03]}
          />
          <meshBasicMaterial
            color={selected ? "#0a84ff" : "#ffffff"}
            wireframe
            transparent
            opacity={selected ? 0.9 : 0.4}
          />
        </mesh>
      )}

      {highlight && (
        <Html
          center
          distanceFactor={7}
          position={[0, h / 2 + 0.22, 0]}
          zIndexRange={[20, 0]}
        >
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-[var(--hairline)] bg-[var(--glass)] px-2 py-1 text-[11px] font-medium text-foreground shadow-md backdrop-blur-md">
            {item.tag ? `${item.tag} · ` : ""}
            {item.label}
          </div>
        </Html>
      )}
    </group>
  );
}

/* -------------------------------------------------------------- the shell */

function Shell({ room }: { room: RoomSpec }) {
  const { width: w, depth: d, height: h } = room;
  const wall = "#8e8e93";

  return (
    <group>
      <mesh
        position={[w / 2, 0, d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#d8d8dc" roughness={1} />
      </mesh>

      {/* Back and left walls only, so the room stays open to the camera. */}
      <mesh position={[w / 2, h / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color={wall}
          roughness={1}
          side={THREE.DoubleSide}
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial
          color={wall}
          roughness={1}
          side={THREE.DoubleSide}
          transparent
          opacity={0.55}
        />
      </mesh>

      <Grid
        position={[w / 2, 0.002, d / 2]}
        args={[w, d]}
        cellSize={0.5}
        cellColor="#a9a9ae"
        sectionSize={1}
        sectionColor="#8a8a8f"
        fadeDistance={40}
        infiniteGrid={false}
      />
    </group>
  );
}

/* ---------------------------------------------------------- view presets */

export type ViewPreset = "iso" | "front" | "rear" | "left" | "right" | "top";

export const VIEW_PRESETS: { id: ViewPreset; label: string; hint: string }[] = [
  { id: "iso", label: "ISO", hint: "Isometric overview" },
  { id: "front", label: "FRONT", hint: "Facing the display wall" },
  { id: "rear", label: "REAR", hint: "From behind the seating" },
  { id: "left", label: "LEFT", hint: "From the west wall" },
  { id: "right", label: "RIGHT", hint: "From the east wall" },
  { id: "top", label: "TOP", hint: "Plan view, looking down" },
];

/**
 * Camera placement for each preset, in metres. Orthographic-style elevations
 * sit outside the room on the relevant axis and look straight in; ISO is the
 * three-quarter overview the view opens with.
 */
export function presetCamera(preset: ViewPreset, room: RoomSpec) {
  const { width: w, depth: d, height: h } = room;
  const span = Math.max(w, d);
  switch (preset) {
    case "front":
      return {
        pos: [w / 2, h * 0.55, d + span * 0.85],
        target: [w / 2, h * 0.45, 0],
      };
    case "rear":
      return {
        pos: [w / 2, h * 0.55, -span * 0.85],
        target: [w / 2, h * 0.45, d],
      };
    case "left":
      return {
        pos: [-span * 0.85, h * 0.55, d / 2],
        target: [w, h * 0.45, d / 2],
      };
    case "right":
      return {
        pos: [w + span * 0.85, h * 0.55, d / 2],
        target: [0, h * 0.45, d / 2],
      };
    case "top":
      // A hair off dead-centre, or the up-vector degenerates and the orbit flips.
      return {
        pos: [w / 2, span * 1.7, d / 2 + 0.001],
        target: [w / 2, 0, d / 2],
      };
    default:
      return {
        pos: [w * 1.1, h * 1.9, d * 1.6],
        target: [w / 2, h / 3, d / 2],
      };
  }
}

/**
 * Eases the camera to the requested preset rather than snapping, so it stays
 * obvious which way the room turned. Runs inside the Canvas because it needs
 * the live camera and orbit controls.
 */
function CameraRig({
  preset,
  nonce,
  room,
  controls,
}: {
  preset: ViewPreset;
  /** Bumped on every request, so re-picking the same view re-flies to it. */
  nonce: number;
  room: RoomSpec;
  controls: React.RefObject<{
    target: THREE.Vector3;
    update: () => void;
  } | null>;
}) {
  const { camera } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(
    null,
  );

  useEffect(() => {
    const { pos, target } = presetCamera(preset, room);
    goal.current = {
      pos: new THREE.Vector3(...(pos as [number, number, number])),
      target: new THREE.Vector3(...(target as [number, number, number])),
    };
  }, [preset, nonce, room]);

  useFrame((_, delta) => {
    const g = goal.current;
    if (!g) return;
    // Frame-rate independent easing.
    const k = 1 - Math.pow(0.0015, Math.min(delta, 0.1));
    camera.position.lerp(g.pos, k);
    const c = controls.current;
    if (c) {
      c.target.lerp(g.target, k);
      c.update();
    }
    if (camera.position.distanceTo(g.pos) < 0.01) goal.current = null;
  });

  return null;
}

/* --------------------------------------------------- reflected ceiling plan */

/** Which wall a wall-mounted item sits on, from how close it is to each. */
function nearestWall(item: RoomItem, room: RoomSpec) {
  const gaps = [
    { side: "west" as const, d: item.position.x },
    { side: "east" as const, d: room.width - item.position.x },
    { side: "north" as const, d: item.position.z },
    { side: "south" as const, d: room.depth - item.position.z },
  ];
  return gaps.sort((a, b) => a.d - b.d)[0]!.side;
}

/**
 * A reflected ceiling plan: the standard AV drawing for showing what is
 * mounted overhead. Ceiling devices are drawn solid on a 600mm tile grid;
 * floor furniture is a faint outline so the ceiling positions can be read
 * against the room below.
 */
function CeilingPlan({
  room,
  items,
  selected,
  onSelect,
  onMoveItem,
}: {
  room: RoomSpec;
  items: RoomItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMoveItem?: (
    id: string,
    change: { position?: RoomItem["position"] },
  ) => void;
}) {
  const t = useT();
  const S = 110; // px per metre
  const pad = 56;
  const svgRef = useRef<SVGSVGElement>(null);

  /** Screen point to room metres, via the SVG's own transform. */
  const toRoom = useCallback((clientX: number, clientY: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: (p.x - pad) / S, z: (p.y - pad) / S };
  }, []);

  /**
   * Drags an item across the plan. Screen X/Y map to room X/Z; height (AFF) is
   * not touched here — it is edited numerically in the detail panel.
   *
   * Wall-mounted items keep the axis perpendicular to their wall so a drag
   * slides them along the wall instead of pulling them off it.
   */
  const beginDrag = (e: React.PointerEvent, item: RoomItem) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(item.id);

    const from = toRoom(e.clientX, e.clientY);
    if (!from || !onMoveItem) return;
    const origin = { ...item.position };
    const side = item.mount === "wall" ? nearestWall(item, room) : null;

    const move = (ev: PointerEvent) => {
      const now = toRoom(ev.clientX, ev.clientY);
      if (!now) return;
      const snap = (v: number) => Math.round(v * 100) / 100;
      const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);

      let x = clamp(origin.x + (now.x - from.x), room.width);
      let z = clamp(origin.z + (now.z - from.z), room.depth);
      if (side === "west" || side === "east") x = origin.x;
      if (side === "north" || side === "south") z = origin.z;

      onMoveItem(item.id, {
        position: { x: snap(x), y: origin.y, z: snap(z) },
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const w = room.width * S;
  const d = room.depth * S;
  const TILE = 0.6; // standard suspended ceiling tile, metres

  const tiles: React.ReactNode[] = [];
  for (let x = TILE; x < room.width - 0.001; x += TILE) {
    tiles.push(
      <line
        key={`v${x}`}
        x1={pad + x * S}
        y1={pad}
        x2={pad + x * S}
        y2={pad + d}
        className="tile"
      />,
    );
  }
  for (let z = TILE; z < room.depth - 0.001; z += TILE) {
    tiles.push(
      <line
        key={`h${z}`}
        x1={pad}
        y1={pad + z * S}
        x2={pad + w}
        y2={pad + z * S}
        className="tile"
      />,
    );
  }

  const ceiling = items.filter((i) => i.mount === "ceiling");
  const walls = items.filter((i) => i.mount === "wall");
  const below = items.filter(
    (i) => i.mount !== "ceiling" && i.mount !== "wall",
  );

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w + pad * 2} ${d + pad * 2}`}
        className="max-h-full max-w-full"
        style={{ minWidth: 520 }}
      >
        <style>{`
          .tile { stroke: rgba(120,120,130,.30); stroke-width: 1; stroke-dasharray: 3 3; }
          .slab { fill: rgba(130,130,140,.07); }
          .outline { fill: none; stroke: var(--foreground); stroke-opacity:.65; stroke-width: 2.5; }
          .below { fill: none; stroke: var(--foreground); stroke-opacity:.22; stroke-width: 1; stroke-dasharray: 5 4; }
          .below-t { font-size: 9px; fill: var(--muted-foreground); opacity:.7 }
          .dim { font-size: 11px; fill: var(--muted-foreground); }
          .cl { stroke: var(--primary); stroke-opacity:.35; stroke-width:1; stroke-dasharray: 12 4 3 4; }
          .lab { font-size: 10px; font-weight: 600; fill: var(--foreground); }
          .sub { font-size: 8.5px; fill: var(--muted-foreground); }
          .pick { cursor: move; }
          .below.pick { pointer-events: all; }
        `}</style>

        <rect x={pad} y={pad} width={w} height={d} className="slab" />
        {tiles}
        <rect x={pad} y={pad} width={w} height={d} className="outline" />

        {/* Centre lines, as on a real RCP */}
        <line
          x1={pad + w / 2}
          y1={pad - 10}
          x2={pad + w / 2}
          y2={pad + d + 10}
          className="cl"
        />
        <line
          x1={pad - 10}
          y1={pad + d / 2}
          x2={pad + w + 10}
          y2={pad + d / 2}
          className="cl"
        />

        {/* Furniture below, for orientation only */}
        {below.map((i) => (
          <rect
            key={i.id}
            x={pad + (i.position.x - i.size.w / 2) * S}
            y={pad + (i.position.z - i.size.d / 2) * S}
            width={i.size.w * S}
            height={i.size.d * S}
            className="below pick"
            onPointerDown={(e) => beginDrag(e, i)}
            transform={`rotate(${i.rotation} ${pad + i.position.x * S} ${pad + i.position.z * S})`}
          >
            <title>{`${i.label} — drag to move in plan`}</title>
          </rect>
        ))}

        {/* Wall devices, marked on the wall they sit on */}
        {walls.map((i) => {
          const side = nearestWall(i, room);
          const cx = pad + i.position.x * S;
          const cy = pad + i.position.z * S;
          const along = Math.max(i.size.w, 0.2) * S;
          const vertical = side === "west" || side === "east";
          return (
            <g
              key={i.id}
              className="pick"
              onPointerDown={(e) => beginDrag(e, i)}
              opacity={selected === i.id ? 1 : 0.85}
            >
              <rect
                x={vertical ? cx - 5 : cx - along / 2}
                y={vertical ? cy - along / 2 : cy - 5}
                width={vertical ? 10 : along}
                height={vertical ? along : 10}
                fill={i.color ?? "#64748b"}
                stroke={
                  selected === i.id ? "var(--primary)" : "var(--foreground)"
                }
                strokeWidth={selected === i.id ? 2.5 : 1}
              />
              <title>{`${i.label} — wall @ ${i.position.y.toFixed(2)} m · drag to slide along the wall`}</title>
            </g>
          );
        })}

        {/* Ceiling devices — the subject of the drawing */}
        {ceiling.map((i) => {
          const cx = pad + i.position.x * S;
          const cy = pad + i.position.z * S;
          const r = Math.max(i.size.w, i.size.d) * S * 0.5;
          const on = selected === i.id;
          return (
            <g
              key={i.id}
              className="pick"
              onPointerDown={(e) => beginDrag(e, i)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={Math.max(r, 13)}
                fill={i.color ?? "#475569"}
                fillOpacity={0.9}
                stroke={on ? "var(--primary)" : "var(--foreground)"}
                strokeWidth={on ? 3 : 1.4}
              />
              {/* Crosshair centre mark */}
              <line
                x1={cx - r - 8}
                y1={cy}
                x2={cx + r + 8}
                y2={cy}
                stroke="var(--foreground)"
                strokeWidth={0.8}
                opacity={0.7}
              />
              <line
                x1={cx}
                y1={cy - r - 8}
                x2={cx}
                y2={cy + r + 8}
                stroke="var(--foreground)"
                strokeWidth={0.8}
                opacity={0.7}
              />
              <text
                x={cx}
                y={cy + Math.max(r, 13) + 14}
                textAnchor="middle"
                className="lab"
              >
                {i.tag || i.label}
              </text>
              <text
                x={cx}
                y={cy + Math.max(r, 13) + 25}
                textAnchor="middle"
                className="sub"
              >
                AFF {i.position.y.toFixed(2)} m
              </text>
              <title>{`${i.label} — ceiling @ ${i.position.y.toFixed(2)} m · drag to move`}</title>
            </g>
          );
        })}

        {/* Dimensions */}
        <text x={pad + w / 2} y={pad - 22} textAnchor="middle" className="dim">
          {room.width} m
        </text>
        <text
          x={pad - 22}
          y={pad + d / 2}
          textAnchor="middle"
          className="dim"
          transform={`rotate(-90 ${pad - 22} ${pad + d / 2})`}
        >
          {room.depth} m
        </text>
        <text x={pad} y={pad + d + 30} className="dim">
          {" "}
          {t("Reflected ceiling plan ·")} {TILE * 1000}{" "}
          {t("mm tile grid · ceiling")} {room.height} m
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

const KIND_GROUPS: { title: string; match: (k: ItemKind) => boolean }[] = [
  { title: "Devices", match: isDeviceKind },
  { title: "Furniture", match: (k) => !isDeviceKind(k) },
];

export function RoomView({
  room,
  items,
  onClose,
  onMoveItem,
}: {
  room: RoomSpec;
  items: RoomItem[];
  onClose: () => void;
  /** Commits a gizmo drag back to the stored layout. */
  onMoveItem?: (
    id: string,
    change: { position?: RoomItem["position"]; rotation?: number },
  ) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"3d" | "ceiling">("3d");
  const [gizmo, setGizmo] = useState<"translate" | "rotate">("translate");
  const [view, setView] = useState<{ preset: ViewPreset; nonce: number }>({
    preset: "iso",
    nonce: 0,
  });
  const controlsRef = useRef<any>(null);

  /** Live handles on each item's group, keyed by id. */
  const groups = useRef(new Map<string, THREE.Group>());
  const [attached, setAttached] = useState<THREE.Group | null>(null);

  const register = useCallback((id: string, group: THREE.Group | null) => {
    if (group) groups.current.set(id, group);
    else groups.current.delete(id);
  }, []);

  // Re-resolve on every selection change; the group may have just mounted.
  useEffect(() => {
    setAttached(selected ? (groups.current.get(selected) ?? null) : null);
  }, [selected, items, mode]);

  /**
   * Reads the gizmo's result back out of the object. Positions snap to 10mm
   * and stay inside the room, so a drag cannot put a device through a wall.
   */
  const commitGizmo = useCallback(() => {
    if (!selected || !attached) return;
    const snap = (v: number) => Math.round(v * 100) / 100;
    const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
    onMoveItem?.(selected, {
      position: {
        x: snap(clamp(attached.position.x, room.width)),
        y: snap(clamp(attached.position.y, room.height)),
        z: snap(clamp(attached.position.z, room.depth)),
      },
      rotation: Math.round(THREE.MathUtils.radToDeg(attached.rotation.y)),
    });
  }, [attached, onMoveItem, room.depth, room.height, room.width, selected]);
  const chosen = useMemo(
    () => items.find((i) => i.id === selected) ?? null,
    [items, selected],
  );

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const diag = Math.hypot(room.width, room.depth);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--canvas)]">
      {/* Title bar */}
      <div className="glass-panel absolute left-4 top-4 z-10 flex items-center gap-2.5 rounded-[12px] px-3 py-2">
        <Boxes size={15} className="text-[var(--primary)]" />
        <span className="text-[13px] font-semibold">{room.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {room.width}m × {room.depth}m × {room.height}m · {items.length}{" "}
          {t("items")}{" "}
        </span>
        <div className="mx-1 h-4 w-px bg-[var(--hairline)]" />
        <div className="flex items-center gap-0.5 rounded-[7px] bg-black/[0.06] p-0.5 dark:bg-white/10">
          {(
            [
              ["3d", Rotate3d, t("3D view")],
              ["ceiling", Grid2x2, t("Reflected ceiling plan")],
            ] as const
          ).map(([value, Icon, hint]) => (
            <button
              key={value}
              title={t(hint)}
              aria-label={t(hint)}
              onClick={() => setMode(value)}
              className={cn(
                "flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] transition-colors",
                mode === value
                  ? "bg-[var(--glass)] text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={12} strokeWidth={2} />
              {value === "3d" ? "3D" : t("Ceiling")}
            </button>
          ))}
        </div>
        {mode === "3d" && (
          <>
            <div className="mx-1 h-4 w-px bg-[var(--hairline)]" />
            <div className="flex items-center gap-0.5 rounded-[7px] bg-black/[0.06] p-0.5 dark:bg-white/10">
              {(
                [
                  ["translate", Move, t("Move along X / Y / Z")],
                  ["rotate", RotateCw, t("Rotate")],
                ] as const
              ).map(([value, Icon, hint]) => (
                <button
                  key={value}
                  title={t(hint)}
                  aria-label={t(hint)}
                  onClick={() => setGizmo(value)}
                  className={cn(
                    "flex h-6 w-7 items-center justify-center rounded-[5px] transition-colors",
                    gizmo === value
                      ? "bg-[var(--glass)] text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={12} strokeWidth={2} />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mx-1 h-4 w-px bg-[var(--hairline)]" />
        <button
          onClick={onClose}
          title={t("Back to schematic (Esc)")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/10"
        >
          <X size={14} />
        </button>
      </div>

      {mode === "3d" && (
        <div className="glass-panel absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] p-1">
          {VIEW_PRESETS.map((p) => (
            <button
              key={p.id}
              title={t(p.hint)}
              aria-label={t(p.hint)}
              onClick={() =>
                setView((v) => ({ preset: p.id, nonce: v.nonce + 1 }))
              }
              className={cn(
                "rounded-[7px] px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
                view.preset === p.id
                  ? "bg-[var(--primary)] text-white"
                  : "text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      )}

      {mode === "3d" && (
        <div className="glass-panel absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-[10px] px-2.5 py-1.5">
          <Move3d size={12} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {" "}
            {t(
              "Drag to orbit · click an item, then drag its arrows to move it",
            )}{" "}
          </span>
        </div>
      )}

      {/* Item list */}
      <div className="glass-panel absolute right-4 top-4 z-10 flex max-h-[70vh] w-[210px] flex-col overflow-hidden rounded-[12px]">
        <div className="border-b border-[var(--hairline)] px-3 py-2 text-[11px] font-semibold">
          {" "}
          {t("Room contents")}{" "}
        </div>
        <div className="overflow-y-auto p-1">
          {room.imports?.map(entry => (
            <ImportEvidence key={entry.importId} provenance={entry.provenance} estimated={entry.dimensionBasis === 'estimated'} />
          ))}
          {items.length === 0 && (
            <p className="px-2 py-3 text-[11px] leading-snug text-muted-foreground">
              {" "}
              {t(
                "Nothing placed yet. Ask the AI to lay out the room, or use the",
              )}{" "}
              <code className="mx-1 rounded bg-black/10 px-1 dark:bg-white/10">
                add_room_item
              </code>{" "}
              {t("tool.")}{" "}
            </p>
          )}
          {KIND_GROUPS.map(({ title, match }) => {
            const group = items.filter((i) => match(i.kind));
            if (group.length === 0) return null;
            return (
              <div key={t(title)} className="mb-1">
                <div className="px-2 pb-0.5 pt-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  {t(title)}
                </div>
                {group.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[7px] px-2 py-1 text-left text-[11px] transition-colors",
                      selected === item.id
                        ? "bg-[var(--primary)] text-white"
                        : "hover:bg-black/[0.06] dark:hover:bg-white/10",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: item.color }}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="shrink-0 text-[9px] opacity-60">
                      {t(item.mount)}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected item detail */}
      {chosen && (
        <div className="glass-panel absolute bottom-4 right-4 z-10 w-[210px] rounded-[12px] p-3">
          <div className="text-[12px] font-semibold">{chosen.label}</div>
          {chosen.tag && (
            <div className="font-mono text-[10px] text-[var(--primary)]">
              {chosen.tag}
            </div>
          )}
          <dl className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
            <div className="flex justify-between">
              <dt>{t("Mount")}</dt>
              <dd className="capitalize text-foreground">{t(chosen.mount)}</dd>
            </div>
            {/* X and Z are set by dragging in the views; AFF is numeric,
                because you cannot drag height on a plan. */}
            <div className="flex items-center justify-between gap-2">
              <dt>X · Z</dt>
              <dd className="flex gap-1">
                {(["x", "z"] as const).map((axis) => (
                  <input
                    key={axis}
                    type="number"
                    step={0.05}
                    min={0}
                    max={axis === "x" ? room.width : room.depth}
                    value={chosen.position[axis]}
                    title={`${axis.toUpperCase()} (${t("metres")})`}
                    onChange={(e) =>
                      onMoveItem?.(chosen.id, {
                        position: {
                          ...chosen.position,
                          [axis]: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-[52px] rounded-[5px] border border-[var(--hairline)] bg-background/70 px-1 py-0.5 text-right font-mono text-[10px] text-foreground outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
                  />
                ))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt title={t("Above finished floor")}>AFF</dt>
              <dd className="flex items-center gap-1">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={room.height}
                  value={chosen.position.y}
                  title={t("Height above finished floor, in metres")}
                  onChange={(e) =>
                    onMoveItem?.(chosen.id, {
                      position: {
                        ...chosen.position,
                        y: Math.min(
                          Math.max(Number(e.target.value) || 0, 0),
                          room.height,
                        ),
                      },
                    })
                  }
                  className="w-[68px] rounded-[5px] border border-[var(--hairline)] bg-background/70 px-1 py-0.5 text-right font-mono text-[10px] text-foreground outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
                />
                <span className="text-[9px]">m</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("Size")}</dt>
              <dd className="font-mono text-foreground">
                {chosen.size.w}×{chosen.size.h}×{chosen.size.d}
              </dd>
            </div>
          </dl>
          {chosen.note && (
            <p className="mt-2 border-t border-[var(--hairline)] pt-2 text-[10px] leading-snug text-muted-foreground">
              {chosen.note}
            </p>
          )}
        </div>
      )}

      {/* Definite-size box: r3f only boots once it measures a non-zero
          container, and a flex child sized with height:100% is ill-defined. */}
      <div className="relative min-h-0 flex-1">
        {mode === "3d" ? (
          <Canvas
            shadows
            camera={{
              position: [room.width * 1.1, room.height * 1.9, room.depth * 1.6],
              fov: 45,
            }}
            onPointerMissed={() => setSelected(null)}
          >
            <color attach="background" args={["#ececed"]} />
            <hemisphereLight intensity={1.1} groundColor="#b8b8bd" />
            <directionalLight position={[6, 9, 5]} intensity={1.5} castShadow />
            <directionalLight position={[-5, 4, -3]} intensity={0.4} />

            <Shell room={room} />
            {items.map((item) => (
              <ItemMesh
                key={item.id}
                item={item}
                selected={selected === item.id}
                onSelect={() => setSelected(item.id)}
                register={register}
              />
            ))}

            {attached && (
              <TransformControls
                object={attached}
                mode={gizmo}
                size={0.8}
                onMouseUp={commitGizmo}
              />
            )}

            <CameraRig
              preset={view.preset}
              nonce={view.nonce}
              room={room}
              controls={controlsRef}
            />

            <OrbitControls
              ref={controlsRef}
              target={[room.width / 2, room.height / 3, room.depth / 2]}
              maxPolarAngle={Math.PI / 2.05}
              minDistance={1.5}
              maxDistance={diag * 3}
              makeDefault
            />
          </Canvas>
        ) : (
          <CeilingPlan
            room={room}
            items={items}
            selected={selected}
            onSelect={setSelected}
            onMoveItem={onMoveItem}
          />
        )}
      </div>
    </div>
  );
}
