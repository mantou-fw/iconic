import { useT } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { db, DEFAULT_TOOL_SETTINGS, type ToolSettings } from "@/lib/db";
import { boundsOf, pointsToPath, simplify, type Point } from "@/lib/stroke";
import {
  DEFAULT_SIGNALS,
  SignalsContext,
  signalColor,
  type SignalDef,
} from "@/lib/signal-types";
import { LegendPanel } from "@/components/legend-panel";
import { Toolbar, TOOLS, type Tool } from "@/components/toolbar";
import { PropertiesPanel, type PanelMode } from "@/components/properties-panel";
import { TextNode } from "@/components/nodes/text-node";
import { MemoNode } from "@/components/nodes/memo-node";
import { ImageNode } from "@/components/nodes/image-node";
import { DrawNode } from "@/components/nodes/draw-node";
import {
  AVDeviceNode,
  makeDeviceData,
  normalizeDeviceData,
  type AVDeviceData,
} from "@/components/nodes/av-device-node";
import { LabeledEdge } from "@/components/edges/labeled-edge";
import { ArrowEdge } from "@/components/edges/arrow-edge";
import {
  IconTextNode,
  makeIconTextData,
} from "@/components/nodes/icon-text-node";
import { ShapeNode, makeShapeData } from "@/components/nodes/shape-node";
import { FileMenu } from "@/components/file-menu";
import { useAIBridge, type AICommand, type AIReply } from "@/lib/ai-bridge";
import { parseProject, readProject, writeProject } from "@/lib/project";
import {
  buildWorkbook,
  downloadBlob,
  stamp,
  workbookBlob,
} from "@/lib/schedules";
import { makePort, type DevicePort } from "@/components/nodes/av-device-node";
import {
  ZoneNode,
  makeZoneData,
  ZONE_COLORS,
} from "@/components/nodes/zone-node";
import { assignLanes } from "@/lib/lanes";
import { ObstaclesContext, type Rect } from "@/lib/obstacles";
import { useHistory, type Snapshot } from "@/lib/history";
import { TitleBlock, makeTitleBlockData } from "@/components/nodes/title-block";
import {
  RackNode,
  makeRackData,
  makeRackItem,
  type RackItem,
} from "@/components/nodes/rack-node";
import { AlignBar } from "@/components/align-bar";
import {
  alignBoxes,
  distributeBoxes,
  type AlignMode,
  type DistributeMode,
} from "@/lib/align";
import { exportDrawing, type ImageFormat } from "@/lib/export-image";
import { buildViewerHtml } from "@/lib/export-html";
import { RoomView } from "@/components/room-view";
import {
  DEFAULT_ROOM,
  makeRoomItem,
  type RoomItem,
  type RoomSpec,
} from "@/lib/room";
import { ThemeContext, useTheme } from "@/lib/theme";
import { arrowMarkers } from "@/lib/arrow-direction";

const edgeTypes = { labeled: LabeledEdge, arrow: ArrowEdge };

const nodeTypes = {
  text: TextNode,
  memo: MemoNode,
  image: ImageNode,
  drawing: DrawNode,
  zone: ZoneNode,
  titleblock: TitleBlock,
  rack: RackNode,
  "icon-text": IconTextNode,
  shape: ShapeNode,
  // Key kept as "database" so drawings saved before the AV redesign still load.
  database: AVDeviceNode,
};

/** Node types whose colour the properties panel can edit. */
const COLORABLE: Record<string, PanelMode> = {
  drawing: "pen",
  text: "text",
  memo: "memo",
};

const CURSORS: Record<Tool, string> = {
  select: "default",
  pan: "grab",
  pen: "crosshair",
  text: "text",
  memo: "copy",
  image: "copy",
  device: "copy",
  "icon-text": "copy",
  shape: "copy",
  zone: "crosshair",
  titleblock: "copy",
  rack: "copy",
};

let idSeq = 0;
const nextId = () => `n${Date.now().toString(36)}${(++idSeq).toString(36)}`;

/** React Flow requires a parent to appear before its children in the array. */
const parentsFirst = (nds: Node[]) => [
  ...nds.filter((n) => n.type === "zone"),
  ...nds.filter((n) => n.type !== "zone"),
];

/** Walks the parent chain to get a node's position in flow coordinates. */
function absolutePosition(node: Node, all: Node[]): Point {
  let { x, y } = node.position;
  let parent = node.parentId
    ? all.find((n) => n.id === node.parentId)
    : undefined;
  while (parent) {
    x += parent.position.x;
    y += parent.position.y;
    parent = parent.parentId
      ? all.find((n) => n.id === parent!.parentId)
      : undefined;
  }
  return { x, y };
}

const sizeOf = (n: Node) => ({
  w: n.measured?.width ?? (typeof n.width === "number" ? n.width : 0),
  h: n.measured?.height ?? (typeof n.height === "number" ? n.height : 0),
});

/** Only device blocks block cables; zones are containers, not obstacles. */
const isObstacle = (n: Node) => n.type === "database";

/** Colours an edge by the signal class of the port it leaves. */
function decorateEdge(edge: Edge, nodes: Node[], signals: SignalDef[]): Edge {
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  const ports = (source?.data as AVDeviceData | undefined)?.ports;
  const port = ports?.find((p) => p.id === edge.sourceHandle);
  const color = port
    ? signalColor(signals, port.signal)
    : "var(--muted-foreground)";
  // AV devices have ports/obstacle semantics that need the cable-run router;
  // a plain arrow is enough for connections between generic nodes.
  const usesCableRouting =
    source?.type === "database" || target?.type === "database";
  const type = usesCableRouting ? "labeled" : "arrow";
  const data = { label: "", direction: "forward" as const, ...edge.data };
  return {
    ...edge,
    type,
    data,
    style: { stroke: color, strokeWidth: 2 },
    ...(type === "arrow"
      ? arrowMarkers(data.direction, color)
      : {
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
        }),
  };
}

function CanvasInner() {
  const t = useT();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [signals, setSignals] = useState<SignalDef[]>(DEFAULT_SIGNALS);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<Point[]>([]);
  const [room, setRoom] = useState<RoomSpec>(DEFAULT_ROOM);
  const [roomItems, setRoomItems] = useState<RoomItem[]>([]);
  const [showRoom, setShowRoom] = useState(false);
  const { theme, resolved, setTheme } = useTheme();

  const rf = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePos = useRef<Point | null>(null);
  const strokeRef = useRef<{ screen: Point[]; flow: Point[] } | null>(null);
  const rafRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirror of the node state, so persist() can sanity-check the flow store. */
  const nodesRef = useRef<Node[]>([]);

  /* ---------------------------------------------------------------- load */

  const loadFromDb = useCallback(async () => {
    {
      const [
        dbNodes,
        dbEdges,
        dbDrawings,
        viewport,
        dbSettings,
        dbSignals,
        dbRoom,
        dbItems,
      ] = await Promise.all([
        db.nodes.toArray(),
        db.edges.toArray(),
        db.drawings.toArray(),
        db.viewport.get("viewport"),
        db.settings.get("tools"),
        db.legend.get("signals"),
        db.room.get("room"),
        db.roomItems.toArray(),
      ]);

      setRoom(dbRoom ?? DEFAULT_ROOM);
      setRoomItems(dbItems);
      const currentSignals =
        dbSignals?.items && dbSignals.items.length > 0
          ? dbSignals.items
          : DEFAULT_SIGNALS;
      setSignals(currentSignals);

      const flowNodes: Node[] = dbNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.type === "database" ? normalizeDeviceData(n.data) : n.data,
        width: n.width,
        height: n.height,
        ...(n.parentId
          ? { parentId: n.parentId, extent: "parent" as const }
          : {}),
        ...(n.type === "zone" ? { zIndex: -1 } : {}),
      }));

      const drawNodes: Node[] = dbDrawings.map((d) => {
        const { minX, minY, width, height } = boundsOf(d.points);
        return {
          id: d.id,
          type: "drawing",
          position: { x: minX, y: minY },
          data: {
            points: d.points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
            color: d.color,
            strokeWidth: d.strokeWidth,
          },
          width,
          height,
          style: { pointerEvents: "none" as const },
        };
      });

      const allNodes = parentsFirst([...flowNodes, ...drawNodes]);
      setNodes(allNodes);
      setEdges(
        dbEdges.map((e) =>
          decorateEdge(
            {
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle,
              data: {
                label: e.label ?? "",
                midX: e.midX,
                midY: e.midY,
                direction: e.direction,
              },
            },
            allNodes,
            currentSignals,
          ),
        ),
      );
      // Merge over the defaults: a row saved before a setting existed would
      // otherwise load that field as undefined.
      if (dbSettings) setSettings({ ...DEFAULT_TOOL_SETTINGS, ...dbSettings });
      if (viewport) {
        rf.setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
      }
      setLoaded(true);
    }
  }, [rf, setNodes, setEdges]);

  useEffect(() => {
    void loadFromDb();
  }, [loadFromDb]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  /* ------------------------------------------------------------- persist */

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const current = rf.getNodes();
      const currentEdges = rf.getEdges();

      // Never let an unready or unmounted store blank a drawing that still has
      // content in React state — an overwrite here is unrecoverable.
      if (current.length === 0 && nodesRef.current.length > 0) return;

      const regular = current.filter((n) => n.type !== "drawing");
      const strokes = current.filter((n) => n.type === "drawing");

      await db.transaction(
        "rw",
        db.nodes,
        db.edges,
        db.drawings,
        db.viewport,
        async () => {
          await db.nodes.clear();
          await db.nodes.bulkPut(
            regular.map((n) => {
              const { autoFocus, ...data } = (n.data ?? {}) as Record<
                string,
                any
              >;
              return {
                id: n.id,
                type: n.type as any,
                position: n.position,
                data,
                width: typeof n.width === "number" ? n.width : undefined,
                height: typeof n.height === "number" ? n.height : undefined,
                parentId: n.parentId,
              };
            }),
          );

          await db.drawings.clear();
          await db.drawings.bulkPut(
            strokes.map((n) => {
              const data = n.data as any;
              return {
                id: n.id,
                points: data.points.map((p: Point) => ({
                  x: p.x + n.position.x,
                  y: p.y + n.position.y,
                })),
                color: data.color,
                strokeWidth: data.strokeWidth,
              };
            }),
          );

          await db.edges.clear();
          await db.edges.bulkPut(
            currentEdges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle,
              label: ((e.data as any)?.label as string) || undefined,
              midX: (e.data as any)?.midX as number | undefined,
              midY: (e.data as any)?.midY as number | undefined,
              direction: (e.data as any)?.direction as
                "forward" | "backward" | "both" | undefined,
            })),
          );

          const vp = rf.getViewport();
          await db.viewport.put({ id: "viewport", ...vp });
        },
      );
    }, 400);
  }, [rf]);

  useEffect(() => {
    if (loaded) persist();
  }, [nodes, edges, loaded, persist]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      await db.transaction("rw", db.room, db.roomItems, async () => {
        await db.room.put(room);
        await db.roomItems.clear();
        await db.roomItems.bulkPut(roomItems);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [room, roomItems, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(
      () => void db.settings.put(settings),
      300,
    );
  }, [settings, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (signalsTimer.current) clearTimeout(signalsTimer.current);
    signalsTimer.current = setTimeout(
      () => void db.legend.put({ id: "signals", items: signals }),
      300,
    );
  }, [signals, loaded]);

  /**
   * Re-colours every edge when the legend changes so the drawing always
   * matches what's on screen — without this, an edited signal colour would
   * only apply the next time the edge itself was reconnected.
   */
  useEffect(() => {
    if (!loaded) return;
    setEdges((eds) => eds.map((e) => decorateEdge(e, rf.getNodes(), signals)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, loaded]);

  /* --------------------------------------------------------- placing bits */

  /** Leaving the select tool drops the selection so edits target the tool. */
  const changeTool = useCallback(
    (next: Tool) => {
      setTool(next);
      if (next !== "select") {
        setNodes((nds) =>
          nds.some((n) => n.selected)
            ? nds.map((n) => (n.selected ? { ...n, selected: false } : n))
            : nds,
        );
        setEdges((eds) =>
          eds.some((e) => e.selected)
            ? eds.map((e) => (e.selected ? { ...e, selected: false } : e))
            : eds,
        );
      }
    },
    [setNodes, setEdges],
  );

  const placeNode = useCallback(
    (
      type:
        | "text"
        | "memo"
        | "database"
        | "icon-text"
        | "shape"
        | "zone"
        | "titleblock"
        | "rack",
      at: Point,
    ) => {
      const base = { id: nextId(), position: at, selected: false };
      if (type === "rack") {
        setNodes((nds) =>
          nds.concat({ ...base, type: "rack", data: makeRackData() }),
        );
        setTool("select");
        return;
      }
      if (type === "titleblock") {
        setNodes((nds) =>
          nds.concat({
            ...base,
            type: "titleblock",
            data: makeTitleBlockData(),
            width: 300,
            height: 900,
          }),
        );
        setTool("select");
        return;
      }
      if (type === "zone") {
        setNodes((nds) =>
          nds.concat({
            ...base,
            type: "zone",
            data: makeZoneData(
              "Zone",
              ZONE_COLORS[
                nds.filter((n) => n.type === "zone").length % ZONE_COLORS.length
              ]!,
            ),
            width: 460,
            height: 320,
            zIndex: -1,
          }),
        );
        setTool("select");
        return;
      }
      if (type === "icon-text") {
        setNodes((nds) =>
          nds.concat({ ...base, type: "icon-text", data: makeIconTextData() }),
        );
        setTool("select");
        return;
      }
      if (type === "shape") {
        setNodes((nds) =>
          nds.concat({
            ...base,
            type: "shape",
            data: { ...makeShapeData(), autoFocus: true },
            width: 140,
            height: 100,
          }),
        );
        setTool("select");
        return;
      }
      const node: Node =
        type === "text"
          ? {
              ...base,
              type: "text",
              data: {
                text: "",
                color: settings.textColor,
                fontSize: settings.textSize,
                autoFocus: true,
              },
              width: 160,
              height: 32,
            }
          : type === "memo"
            ? {
                ...base,
                type: "memo",
                data: {
                  text: "",
                  color: settings.memoColor,
                  fontSize: 13,
                  autoFocus: true,
                },
                width: 180,
                height: 130,
              }
            : { ...base, type: "database", data: makeDeviceData() };

      setNodes((nds) => nds.concat(node));
      setTool("select");
    },
    [setNodes, settings],
  );

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (tool === "select" || tool === "pan" || tool === "pen") return;
      const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (tool === "image") {
        pendingImagePos.current = at;
        fileInputRef.current?.click();
        return;
      }
      placeNode(tool === "device" ? "database" : tool, at);
    },
    [tool, rf, placeNode],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !pendingImagePos.current) return;
      const at = pendingImagePos.current;
      pendingImagePos.current = null;

      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const probe = new Image();
        probe.onload = () => {
          const scale = Math.min(1, 260 / Math.max(probe.width, probe.height));
          setNodes((nds) =>
            nds.concat({
              id: nextId(),
              type: "image",
              position: at,
              data: { src },
              width: Math.round(probe.width * scale),
              height: Math.round(probe.height * scale),
            }),
          );
        };
        probe.src = src;
        setTool("select");
      };
      reader.readAsDataURL(file);
    },
    [setNodes],
  );

  /* ---------------------------------------------------------------- pen */

  const flushPreview = useCallback(() => {
    rafRef.current = null;
    setPreview(strokeRef.current ? [...strokeRef.current.screen] : []);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (tool !== "pen" || e.button !== 0) return;
      const rect = paneRef.current!.getBoundingClientRect();
      strokeRef.current = {
        screen: [{ x: e.clientX - rect.left, y: e.clientY - rect.top }],
        flow: [rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })],
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [tool, rf],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const stroke = strokeRef.current;
      if (tool !== "pen" || !stroke) return;
      const rect = paneRef.current!.getBoundingClientRect();
      stroke.screen.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      stroke.flow.push(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      rafRef.current ??= requestAnimationFrame(flushPreview);
    },
    [tool, rf, flushPreview],
  );

  const onPointerUp = useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPreview([]);
    if (!stroke || stroke.flow.length < 2) return;

    const points = simplify(stroke.flow, 1.5);
    const { minX, minY, width, height } = boundsOf(points);
    setNodes((nds) =>
      nds.concat({
        id: nextId(),
        type: "drawing",
        position: { x: minX, y: minY },
        data: {
          points: points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
          color: settings.penColor,
          strokeWidth: settings.penWidth,
        },
        width,
        height,
        style: { pointerEvents: "none" as const },
      }),
    );
  }, [setNodes, settings.penColor, settings.penWidth]);

  /* ------------------------------------------------------------ wiring */

  const onConnect: OnConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(connection, eds).map((e) =>
          decorateEdge(e, rf.getNodes(), signals),
        ),
      ),
    [setEdges, rf, signals],
  );

  /**
   * Port signals drive edge colour and ports can be deleted, so re-derive the
   * edges whenever a device's port list changes. Keyed on a signature of the
   * ports alone, so edge updates cannot feed back into this effect.
   */
  const portSignature = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "database")
        .map((n) => {
          const ports = (n.data as AVDeviceData).ports ?? [];
          return `${n.id}:${ports.map((p) => `${p.id}=${p.signal}`).join(",")}`;
        })
        .join("|"),
    [nodes],
  );

  useEffect(() => {
    if (!loaded) return;
    const current = rf.getNodes();
    const hasPort = (nodeId: string, handle?: string | null) => {
      const node = current.find((n) => n.id === nodeId);
      if (node?.type !== "database") return true;
      const ports = (node.data as AVDeviceData).ports ?? [];
      return ports.some((p) => p.id === handle);
    };
    setEdges((eds) =>
      eds
        .filter(
          (e) =>
            hasPort(e.source, e.sourceHandle) &&
            hasPort(e.target, e.targetHandle),
        )
        .map((e) => decorateEdge(e, current, signals)),
    );
  }, [portSignature, loaded, setEdges, rf, signals]);

  /**
   * Dropping a device inside a zone parents it to that zone, so the zone can
   * then be moved as a unit. Dragging it back out detaches it again.
   */
  const onNodeDragStop = useCallback(
    (_e: MouseEvent | TouchEvent, dragged: Node) => {
      if (dragged.type === "zone" || dragged.type === "drawing") return;

      const all = rf.getNodes();
      const at = absolutePosition(dragged, all);
      const size = sizeOf(dragged);
      const centre = { x: at.x + size.w / 2, y: at.y + size.h / 2 };

      const zone = all.find((z) => {
        if (z.type !== "zone") return false;
        const zp = absolutePosition(z, all);
        const zs = sizeOf(z);
        return (
          centre.x >= zp.x &&
          centre.x <= zp.x + zs.w &&
          centre.y >= zp.y &&
          centre.y <= zp.y + zs.h
        );
      });

      if ((zone?.id ?? undefined) === (dragged.parentId ?? undefined)) return;

      setNodes((nds) =>
        parentsFirst(
          nds.map((n) => {
            if (n.id !== dragged.id) return n;
            if (!zone) {
              return {
                ...n,
                parentId: undefined,
                extent: undefined,
                position: at,
              };
            }
            const zp = absolutePosition(zone, all);
            return {
              ...n,
              parentId: zone.id,
              extent: "parent" as const,
              position: { x: at.x - zp.x, y: at.y - zp.y },
            };
          }),
        ),
      );
    },
    [rf, setNodes],
  );

  const onClear = useCallback(async () => {
    if (!confirm(t("Clear the entire canvas? This cannot be undone."))) return;
    setNodes([]);
    setEdges([]);
    await db.transaction("rw", db.nodes, db.edges, db.drawings, async () => {
      await db.nodes.clear();
      await db.edges.clear();
      await db.drawings.clear();
    });
  }, [setNodes, setEdges, t]);

  /* ------------------------------------------------------- file in/out */

  const projectInputRef = useRef<HTMLInputElement>(null);

  const onSaveJson = useCallback(async () => {
    const project = await readProject();
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      `av-schematic-${stamp()}.json`,
    );
  }, []);

  const onProjectFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const project = parseProject(await file.text());
        await writeProject(project);
        await loadFromDb();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : t("Could not open that file."),
        );
      }
    },
    [loadFromDb, t],
  );

  const onExportXlsx = useCallback(async () => {
    const {
      nodes: dbNodes,
      edges: dbEdges,
      signals: dbSignals,
    } = await readProject();
    downloadBlob(
      workbookBlob(buildWorkbook(dbNodes, dbEdges, dbSignals)),
      `av-schedules-${stamp()}.xlsx`,
    );
  }, []);

  /* ------------------------------------------------------- alignment */

  const selectedNodes = useMemo(
    () => nodes.filter((n) => n.selected && n.type !== "drawing"),
    [nodes],
  );

  /** Applies absolute moves, converting back into each node's own frame. */
  const applyMoves = useCallback(
    (moves: Map<string, { x: number; y: number }>) => {
      if (moves.size === 0) return;
      setNodes((nds) =>
        nds.map((n) => {
          const to = moves.get(n.id);
          if (!to) return n;
          const parent = n.parentId
            ? nds.find((p) => p.id === n.parentId)
            : undefined;
          const origin = parent
            ? absolutePosition(parent, nds)
            : { x: 0, y: 0 };
          return { ...n, position: { x: to.x - origin.x, y: to.y - origin.y } };
        }),
      );
    },
    [setNodes],
  );

  const onAlign = useCallback(
    (mode: AlignMode) => {
      const all = rf.getNodes();
      applyMoves(
        alignBoxes(
          selectedNodes,
          mode,
          (n) => absolutePosition(n, all),
          sizeOf,
        ),
      );
    },
    [applyMoves, rf, selectedNodes],
  );

  const onDistribute = useCallback(
    (mode: DistributeMode) => {
      const all = rf.getNodes();
      applyMoves(
        distributeBoxes(
          selectedNodes,
          mode,
          (n) => absolutePosition(n, all),
          sizeOf,
        ),
      );
    },
    [applyMoves, rf, selectedNodes],
  );

  /* ---------------------------------------------------------- printing */

  const onExportImage = useCallback(
    async (format: ImageFormat) => {
      try {
        await exportDrawing({ nodes: rf.getNodes(), format });
      } catch (err) {
        alert(err instanceof Error ? err.message : t("Export failed."));
      }
    },
    [rf, t],
  );

  const onExportHtml = useCallback(() => {
    const all = rf.getNodes();
    const html = buildViewerHtml({
      nodes: all,
      edges: rf.getEdges(),
      room,
      roomItems,
      signals,
      absolute: (n) => absolutePosition(n, all),
    });
    downloadBlob(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `av-schematic-viewer-${stamp()}.html`,
    );
  }, [rf, room, roomItems, signals]);

  const toggleSnap = useCallback(
    () => setSettings((s) => ({ ...s, snapToGrid: !s.snapToGrid })),
    [],
  );

  /* ------------------------------------------------------- AI bridge */

  const runCommand = useCallback(
    (cmd: AICommand): AIReply | void => {
      const ok = (command: string, detail?: unknown): AIReply => ({
        type: "ack",
        command,
        ok: true,
        detail,
      });
      const fail = (command: string, message: string): AIReply => ({
        type: "error",
        command,
        ok: false,
        message,
      });

      const current = rf.getNodes();
      const devices = current.filter((n) => n.type === "database");
      const dataOf = (n: Node) => n.data as unknown as AVDeviceData;
      const byTag = (tag: string) =>
        devices.find((n) => {
          const d = dataOf(n);
          return (
            d.tag?.toLowerCase() === tag.toLowerCase() ||
            d.name?.toLowerCase() === tag.toLowerCase()
          );
        });

      const snapshot = (): AIReply => {
        const map = new Map(devices.map((n) => [n.id, dataOf(n)]));
        return {
          type: "state",
          devices: devices.map((n) => {
            const d = dataOf(n);
            return {
              tag: d.tag,
              name: d.name,
              manufacturer: d.manufacturer,
              model: d.model,
              position: n.position,
              ports: (d.ports ?? []).map((p) => ({
                label: p.label,
                dir: p.dir,
                signal: p.signal,
                connector: p.connector,
              })),
            };
          }),
          cables: rf.getEdges().map((e) => {
            const from = map.get(e.source);
            const to = map.get(e.target);
            return {
              label: ((e.data as any)?.label as string) ?? "",
              from: from?.tag,
              fromPort: from?.ports?.find((p) => p.id === e.sourceHandle)
                ?.label,
              to: to?.tag,
              toPort: to?.ports?.find((p) => p.id === e.targetHandle)?.label,
            };
          }),
        };
      };

      /** Drops new devices into a tidy grid when no position is given. */
      const autoPlace = (index: number) => ({
        x: 80 + (index % 4) * 340,
        y: 80 + Math.floor(index / 4) * 260,
      });

      switch (cmd.type) {
        case "get_state":
          return snapshot();

        case "clear":
          setNodes([]);
          setEdges([]);
          return ok("clear");

        case "set_room": {
          const next: RoomSpec = {
            id: "room",
            name: cmd.name ?? room.name,
            width: cmd.width ?? room.width,
            depth: cmd.depth ?? room.depth,
            height: cmd.height ?? room.height,
          };
          setRoom(next);
          if (cmd.clearItems) setRoomItems([]);
          return ok("set_room", next);
        }

        case "add_room_item": {
          const item = makeRoomItem(
            {
              id: `r${nextId()}`,
              kind: cmd.kind,
              label: cmd.label,
              tag: cmd.tag,
              position: cmd.position as RoomItem["position"] | undefined,
              size: cmd.size as RoomItem["size"] | undefined,
              rotation: cmd.rotation,
              mount: cmd.mount,
              color: cmd.color,
              note: cmd.note,
            },
            room,
          );
          setRoomItems((prev) => prev.concat(item));
          return ok("add_room_item", { label: item.label, mount: item.mount });
        }

        case "clear_room":
          setRoomItems([]);
          return ok("clear_room");

        case "get_room":
          return {
            type: "state",
            devices: [{ room, items: roomItems }],
            cables: [],
          };

        case "add_rack": {
          const units = Math.max(1, cmd.units ?? 24);
          // Without an explicit U, stack upward from the bottom.
          let next = 1;
          const equipment: RackItem[] = (cmd.equipment ?? []).map((e) => {
            const height = Math.max(1, e.height ?? 1);
            const u = e.u ?? next;
            next = Math.max(next, u + height);
            return {
              ...makeRackItem(u, height),
              label: e.label,
              tag: e.tag,
              color: e.color ?? "#64748b",
            };
          });
          setNodes((nds) =>
            nds.concat({
              id: nextId(),
              type: "rack",
              position: cmd.position ?? autoPlace(devices.length),
              data: {
                ...makeRackData(),
                tag: cmd.tag ?? "RK-01",
                name: cmd.name ?? "Equipment Rack",
                units,
                items: equipment,
              },
            }),
          );
          return ok("add_rack", {
            tag: cmd.tag,
            units,
            items: equipment.length,
          });
        }

        case "add_title_block": {
          setNodes((nds) =>
            nds.concat({
              id: nextId(),
              type: "titleblock",
              position: cmd.position ?? { x: 40, y: 40 },
              data: { ...makeTitleBlockData(), ...(cmd.fields ?? {}) },
              width: 300,
              height: 900,
            }),
          );
          return ok("add_title_block");
        }

        case "add_zone": {
          const zones = current.filter((n) => n.type === "zone");
          const id = nextId();
          setNodes((nds) =>
            parentsFirst(
              nds.concat({
                id,
                type: "zone",
                position: cmd.position ?? {
                  x: 40 + zones.length * 520,
                  y: 40,
                },
                data: makeZoneData(
                  cmd.name,
                  cmd.color ?? ZONE_COLORS[zones.length % ZONE_COLORS.length]!,
                ),
                width: cmd.width ?? 460,
                height: cmd.height ?? 320,
                zIndex: -1,
              }),
            ),
          );
          return ok("add_zone", { name: cmd.name });
        }

        case "add_device": {
          const data = makeDeviceData();
          if (cmd.tag) data.tag = cmd.tag.toUpperCase();
          if (cmd.name) data.name = cmd.name;
          data.manufacturer = cmd.manufacturer ?? "";
          data.model = cmd.model ?? "";
          if (cmd.inputs || cmd.outputs) {
            const build = (
              specs: typeof cmd.inputs,
              dir: "in" | "out",
            ): DevicePort[] =>
              (specs ?? []).map((s) => ({
                ...makePort(dir, s.signal ?? "audio"),
                label: s.label ?? (dir === "in" ? "Input" : "Output"),
                connector: s.connector ?? "",
              }));
            data.ports = [
              ...build(cmd.inputs, "in"),
              ...build(cmd.outputs, "out"),
            ];
          }
          const id = nextId();
          // Placing into a zone means a parent-relative position.
          const zone = cmd.zone
            ? current.find(
                (n) =>
                  n.type === "zone" &&
                  (n.data as { name?: string }).name?.toLowerCase() ===
                    cmd.zone!.toLowerCase(),
              )
            : undefined;
          if (cmd.zone && !zone) {
            return fail("add_device", `No zone named "${cmd.zone}"`);
          }
          setNodes((nds) =>
            parentsFirst(
              nds.concat({
                id,
                type: "database",
                position: cmd.position ?? autoPlace(devices.length),
                data,
                ...(zone
                  ? { parentId: zone.id, extent: "parent" as const }
                  : {}),
              }),
            ),
          );
          return ok("add_device", { tag: data.tag, zone: cmd.zone });
        }

        case "add_text":
        case "add_memo": {
          const memo = cmd.type === "add_memo";
          setNodes((nds) =>
            nds.concat({
              id: nextId(),
              type: memo ? "memo" : "text",
              position: cmd.position ?? autoPlace(current.length),
              data: memo
                ? { text: cmd.text, color: settings.memoColor, fontSize: 13 }
                : {
                    text: cmd.text,
                    color: settings.textColor,
                    fontSize: settings.textSize,
                  },
              width: memo ? 180 : 160,
              height: memo ? 130 : 32,
            }),
          );
          return ok(cmd.type);
        }

        case "connect": {
          const from = byTag(cmd.from);
          const to = byTag(cmd.to);
          if (!from) return fail("connect", `No device tagged "${cmd.from}"`);
          if (!to) return fail("connect", `No device tagged "${cmd.to}"`);

          const pick = (node: Node, dir: "in" | "out", want?: string) => {
            const ports = (dataOf(node).ports ?? []).filter(
              (p) => p.dir === dir,
            );
            if (!want) return ports[0];
            return ports.find(
              (p) => p.label.toLowerCase() === want.toLowerCase(),
            );
          };
          const sourcePort = pick(from, "out", cmd.fromPort);
          const targetPort = pick(to, "in", cmd.toPort);
          if (!sourcePort)
            return fail("connect", `"${cmd.from}" has no matching output`);
          if (!targetPort)
            return fail("connect", `"${cmd.to}" has no matching input`);

          const edge = decorateEdge(
            {
              id: `ai-${nextId()}`,
              source: from.id,
              target: to.id,
              sourceHandle: sourcePort.id,
              targetHandle: targetPort.id,
              data: { label: cmd.label ?? "" },
            },
            current,
            signals,
          );
          setEdges((eds) => eds.concat(edge));
          return ok("connect", { from: cmd.from, to: cmd.to });
        }

        case "delete_device": {
          const node = byTag(cmd.tag);
          if (!node)
            return fail("delete_device", `No device tagged "${cmd.tag}"`);
          setNodes((nds) => nds.filter((n) => n.id !== node.id));
          setEdges((eds) =>
            eds.filter((e) => e.source !== node.id && e.target !== node.id),
          );
          return ok("delete_device", { tag: cmd.tag });
        }

        case "layout": {
          setNodes((nds) => {
            let i = 0;
            return nds.map((n) =>
              n.type === "database" ? { ...n, position: autoPlace(i++) } : n,
            );
          });
          return ok("layout");
        }

        default:
          return fail((cmd as { type: string }).type ?? "?", "Unknown command");
      }
    },
    [rf, setNodes, setEdges, settings, room, roomItems, signals],
  );

  const aiStatus = useAIBridge(runCommand);

  /* --------------------------------------------------------- history */

  const history = useHistory();

  // Record once a change has settled, on the same debounce as the autosave.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => history.record({ nodes, edges }), 350);
    return () => clearTimeout(t);
  }, [nodes, edges, loaded, history]);

  const applySnapshot = useCallback(
    (snap: Snapshot) => {
      setNodes(parentsFirst(snap.nodes));
      setEdges(snap.edges);
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(
    () => history.undo({ nodes, edges }, applySnapshot),
    [history, nodes, edges, applySnapshot],
  );
  const redo = useCallback(
    () => history.redo(applySnapshot),
    [history, applySnapshot],
  );

  /* ------------------------------------------------------- duplicate */

  const duplicateSelection = useCallback(() => {
    const all = rf.getNodes();
    const picked = all.filter((n) => n.selected && n.type !== "drawing");
    if (picked.length === 0) return;

    const idMap = new Map<string, string>();
    const copies = picked.map((n) => {
      const id = nextId();
      idMap.set(n.id, id);
      return {
        ...n,
        id,
        // Offset only top-level copies; children keep their parent-relative spot.
        position: n.parentId
          ? n.position
          : { x: n.position.x + 32, y: n.position.y + 32 },
        selected: true,
        data: structuredClone(n.data),
      };
    });
    // Re-point copied children at copied parents where both were selected.
    for (const copy of copies) {
      if (copy.parentId && idMap.has(copy.parentId)) {
        copy.parentId = idMap.get(copy.parentId);
      }
    }

    // Carry over any cable whose two ends were both duplicated.
    const copiedEdges = rf
      .getEdges()
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: `d${nextId()}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        selected: false,
        data: { ...e.data },
      }));

    setNodes((nds) =>
      parentsFirst([...nds.map((n) => ({ ...n, selected: false })), ...copies]),
    );
    if (copiedEdges.length) setEdges((eds) => eds.concat(copiedEdges));
  }, [rf, setNodes, setEdges]);

  /* -------------------------------------------------------- shortcuts */

  /** Tool the space bar interrupted, restored when it is released. */
  const toolBeforeSpace = useRef<Tool | null>(null);

  useEffect(() => {
    const typing = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      return (
        !!node &&
        (node.tagName === "INPUT" ||
          node.tagName === "TEXTAREA" ||
          node.isContentEditable)
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }
      if (mod || e.altKey) return;

      // Hold space to pan, like every other drawing tool.
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        if (tool !== "pan") {
          toolBeforeSpace.current = tool;
          setTool("pan");
        }
        return;
      }
      if (e.key === "Escape") {
        changeTool("select");
        return;
      }

      const match = TOOLS.find(
        (t) => t.key.toLowerCase() === e.key.toLowerCase() || t.digit === e.key,
      );
      if (match) {
        e.preventDefault();
        changeTool(match.id);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      const previous = toolBeforeSpace.current;
      toolBeforeSpace.current = null;
      if (previous) setTool(previous);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [changeTool, duplicateSelection, redo, setNodes, tool, undo]);

  /* -------------------------------------------------- properties panel */

  const panel = useMemo(() => {
    // A creation tool wins: you are about to draw, so show its defaults.
    if (tool === "pen" || tool === "text" || tool === "memo") {
      const color =
        tool === "pen"
          ? settings.penColor
          : tool === "text"
            ? settings.textColor
            : settings.memoColor;
      return { mode: tool, scope: "tool" as const, targets: [], color };
    }
    const picked = nodes.filter((n) => n.selected && COLORABLE[n.type ?? ""]);
    if (picked.length > 0) {
      const mode = COLORABLE[picked[0]!.type!]!;
      const targets = picked.filter((n) => COLORABLE[n.type ?? ""] === mode);
      return {
        mode,
        scope: "selection" as const,
        targets,
        color: (targets[0]!.data as any).color as string,
      };
    }
    return null;
  }, [nodes, tool, settings]);

  const applyColor = useCallback(
    (color: string) => {
      if (!panel) return;
      if (panel.scope === "selection") {
        panel.targets.forEach((n) => rf.updateNodeData(n.id, { color }));
        return;
      }
      const key =
        panel.mode === "pen"
          ? "penColor"
          : panel.mode === "text"
            ? "textColor"
            : "memoColor";
      setSettings((s) => ({ ...s, [key]: color }));
    },
    [panel, rf],
  );

  const applyStrokeWidth = useCallback(
    (strokeWidth: number) => {
      if (!panel) return;
      if (panel.scope === "selection") {
        panel.targets.forEach((n) => rf.updateNodeData(n.id, { strokeWidth }));
      } else {
        setSettings((s) => ({ ...s, penWidth: strokeWidth }));
      }
    },
    [panel, rf],
  );

  const applyFontSize = useCallback(
    (fontSize: number) => {
      if (!panel) return;
      if (panel.scope === "selection") {
        panel.targets.forEach((n) => rf.updateNodeData(n.id, { fontSize }));
      } else if (panel.mode === "text") {
        setSettings((s) => ({ ...s, textSize: fontSize }));
      }
    },
    [panel, rf],
  );

  /** Fan-out lanes are derived per render — never stored on the edge. */
  const laneEdges = useMemo(() => assignLanes(edges, nodes), [edges, nodes]);

  /** Device rectangles the router steers cables around. */
  const obstacles = useMemo<Rect[]>(
    () =>
      nodes.filter(isObstacle).map((n) => {
        const at = absolutePosition(n, nodes);
        const { w, h } = sizeOf(n);
        return { x: at.x, y: at.y, w, h };
      }),
    [nodes],
  );

  const isSelect = tool === "select";

  return (
    <ThemeContext.Provider value={resolved}>
      <div className="relative h-screen w-full">
        {/* Overlaid rather than swapped in: unmounting ReactFlow would empty its
          store, and both persist() and the AI commands read from it. */}
        {showRoom && (
          <RoomView
            room={room}
            items={roomItems}
            onClose={() => setShowRoom(false)}
            onMoveItem={(id, change) =>
              setRoomItems((prev) =>
                prev.map((i) => (i.id === id ? { ...i, ...change } : i)),
              )
            }
          />
        )}
        <FileMenu
          onOpen={() => projectInputRef.current?.click()}
          onSaveJson={onSaveJson}
          onExportXlsx={onExportXlsx}
          onExportImage={onExportImage}
          onExportHtml={onExportHtml}
          onOpenRoom={() => setShowRoom(true)}
          roomItemCount={roomItems.length}
          theme={theme}
          onThemeChange={setTheme}
          aiStatus={aiStatus}
        />
        <input
          ref={projectInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onProjectFile}
        />
        <Toolbar
          tool={tool}
          onToolChange={changeTool}
          onClear={onClear}
          snapToGrid={settings.snapToGrid}
          onToggleSnap={toggleSnap}
        />
        {selectedNodes.length > 1 && (
          <AlignBar
            count={selectedNodes.length}
            onAlign={onAlign}
            onDistribute={onDistribute}
          />
        )}

        {panel && (
          <PropertiesPanel
            mode={panel.mode}
            scope={panel.scope}
            color={panel.color}
            onColorChange={applyColor}
            strokeWidth={
              panel.mode === "pen"
                ? panel.scope === "selection"
                  ? ((panel.targets[0]!.data as any).strokeWidth as number)
                  : settings.penWidth
                : undefined
            }
            onStrokeWidthChange={
              panel.mode === "pen" ? applyStrokeWidth : undefined
            }
            fontSize={
              panel.mode === "text" || panel.mode === "memo"
                ? panel.scope === "selection"
                  ? ((panel.targets[0]!.data as any).fontSize as number)
                  : settings.textSize
                : undefined
            }
            onFontSizeChange={
              panel.mode === "text" || panel.mode === "memo"
                ? applyFontSize
                : undefined
            }
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />

        <div
          ref={paneRef}
          className="relative h-full w-full"
          style={{ cursor: CURSORS[tool] }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <ObstaclesContext.Provider value={obstacles}>
            <SignalsContext.Provider value={signals}>
              <ReactFlow
                ariaLabelConfig={{
                  "controls.ariaLabel": t("Control panel"),
                  "minimap.ariaLabel": t("Mini map"),
                  "controls.zoomIn.ariaLabel": t("Zoom in"),
                  "controls.zoomOut.ariaLabel": t("Zoom out"),
                  "controls.fitView.ariaLabel": t("Fit view"),
                }}
                nodes={nodes}
                edges={laneEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onPaneClick={onPaneClick}
                onNodeDragStop={onNodeDragStop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                panOnDrag={tool === "pan" ? true : isSelect ? [1, 2] : false}
                selectionOnDrag={isSelect}
                nodesDraggable={isSelect}
                nodesConnectable={isSelect}
                elementsSelectable={isSelect}
                zoomOnDoubleClick={isSelect}
                // Shift adds to the selection. Dragging the pane already box-selects
                // via selectionOnDrag, so Shift is deliberately not bound to that too.
                multiSelectionKeyCode="Shift"
                deleteKeyCode={["Backspace", "Delete"]}
                snapToGrid={settings.snapToGrid}
                snapGrid={[settings.gridSize, settings.gridSize]}
                connectionRadius={24}
                proOptions={{ hideAttribution: true }}
                fitView
              >
                <Background
                  variant={
                    resolved === "autocad"
                      ? BackgroundVariant.Lines
                      : BackgroundVariant.Dots
                  }
                  gap={resolved === "autocad" ? 32 : 16}
                  size={1}
                  color="var(--dots)"
                />
                <Controls showInteractive={false} />
                <MiniMap
                  pannable
                  zoomable
                  maskColor="rgba(0,0,0,0.06)"
                  className="!bg-[var(--glass)] !backdrop-blur-xl"
                  nodeColor={(n) =>
                    n.type === "database"
                      ? "#94a3b8"
                      : (((n.data as any)?.color as string) ?? "#cbd5e1")
                  }
                />
                {/* pointer-events-none: the panel's offset box would otherwise sit
              over the zoom controls and swallow their clicks. */}
                <Panel position="bottom-left" className="pointer-events-none">
                  <div className="pointer-events-auto ml-12">
                    <LegendPanel signals={signals} onChange={setSignals} />
                  </div>
                </Panel>
              </ReactFlow>
            </SignalsContext.Provider>
          </ObstaclesContext.Provider>

          {/* Live pen stroke, drawn in screen space above the graph. */}
          {preview.length > 1 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <path
                d={pointsToPath(preview)}
                fill="none"
                stroke={settings.penColor}
                strokeWidth={settings.penWidth * rf.getZoom()}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
    </ThemeContext.Provider>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
