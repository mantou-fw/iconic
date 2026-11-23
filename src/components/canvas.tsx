import { useT } from "@/lib/i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from "@/lib/db";
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
import { DrawingReview } from "@/components/drawing-review";
import { ReusableLibraryDialog } from "@/components/reusable-library-dialog";
import { deviceDefinition, instantiateDevice, templateItems, type LibraryContent } from "@/lib/reusable-library";
import { checkDrawing, type DrawingFinding } from "@/lib/drawing-checks";
import { useAIBridge, type AICommand, type AIReply } from "@/lib/ai-bridge";
import { readProjectContext, readProjectObject } from "@/lib/project-read";
import { parseProject, type ProjectFile } from "@/lib/project";
import { blankProject, captureCanvas } from "@/lib/canvas-project";
import type { ProjectSession } from "@/lib/project-store";
import { prepareRoomImport } from "@/lib/ai-imports";
import { productSchema } from "../../shared/ai-imports.mjs";
import { downloadBlob, stamp } from "@/lib/download";
import { schedulesFeature, imageExportFeature, htmlExportFeature } from "@/lib/feature-imports";
import { createExportTask, type ExportTaskState } from "@/lib/export-task";
import { createReloadTask, type ReloadTaskState } from "@/lib/reload-task";
import { ExportStatus } from "@/components/export-status";
import { makePort, type DevicePort } from "@/components/nodes/av-device-node";
import {
  ZoneNode,
  makeZoneData,
  ZONE_COLORS,
} from "@/components/nodes/zone-node";
import { assignLanes } from "@/lib/lanes";
import { ObstaclesContext, type Rect } from "@/lib/obstacles";
import { DeviceLinkReview, type PendingLink } from "@/components/device-link-review";
import { DeviceIdentityContext } from "@/components/device-identity-context";
import { allocateTag, deviceIdentities, displayDeviceTag, deviceLinkNeedsReview, matchDevice, migrateDeviceLink, tagKey } from "@/lib/device-identity";
import { createDocumentHistory, type Snapshot } from "@/lib/history";
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
import type { ImageFormat } from "@/lib/export-image";
import { readRenderedEdges } from "@/lib/export-geometry";
import { RoomViewFeature } from "@/components/room-view-feature";
import {
  DEFAULT_ROOM,
  makeRoomItem,
  clampRoomPosition,
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
function parentsFirst(nodes: Node[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered: Node[] = [];
  const visited = new Set<string>();
  for (const node of [...nodes.filter((n) => n.type === "zone"), ...nodes.filter((n) => n.type !== "zone")]) {
    const chain: Node[] = [];
    let current: Node | undefined = node;
    while (current && !visited.has(current.id)) {
      chain.push(current);
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    while (chain.length) ordered.push(chain.pop()!);
  }
  return ordered;
}

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

export type CanvasHandle = { capture: () => ProjectFile; flush: () => Promise<void> };
type CanvasProps = {
  session: ProjectSession;
  initial: ProjectFile;
  blocked: boolean;
  onProjects: () => void;
  onImport: (project: ProjectFile, name: string) => Promise<void>;
  onReady: (handle: CanvasHandle | null) => void;
  onSaved: (session: ProjectSession) => Promise<void>;
};

function CanvasInner({ session, initial, blocked, onProjects, onImport, onReady, onSaved }: CanvasProps) {
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
  const [reviewLinks, setReviewLinks] = useState(false);
  const [exportState, setExportState] = useState<ExportTaskState>(null);
  const [exportTask] = useState(() => createExportTask(setExportState));
  const [reloadState, setReloadState] = useState<ReloadTaskState>(null);
  const [reloadTask] = useState(() => createReloadTask(setReloadState));
  useLayoutEffect(() => () => { exportTask.cancel(); reloadTask.cancel(); }, [exportTask, reloadTask]);
  const closeRoom = useCallback(() => {
    reloadTask.dismiss();
    setShowRoom(false);
  }, [reloadTask]);
  const { theme, resolved, setTheme } = useTheme();

  const rf = useReactFlow();
  const [review, setReview] = useState<"drawing" | "xlsx" | "html" | "pdf" | "png" | "svg" | null>(null);
  const [roomSelection, setRoomSelection] = useState<string>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePos = useRef<Point | null>(null);
  const strokeRef = useRef<{ screen: Point[]; flow: Point[] } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [viewRevision, setViewRevision] = useState(0);
  const editGeneration = useRef(0);
  /** Mirror of the node state, so capture() can sanity-check the flow store. */
  const nodesRef = useRef<Node[]>([]);

  const identities = useMemo(() => deviceIdentities(nodes), [nodes]);
  const tags = useMemo(() => new Map(identities.map((device) => [device.id, device.tag])), [identities]);
  const shownRoomItems = useMemo(() => roomItems.map((item) => {
    const tag = displayDeviceTag(item, tags);
    return tag === item.tag ? item : { ...item, tag };
  }), [roomItems, tags]);
  const duplicateDevices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const device of identities) {
      const tag = tagKey(device.tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return identities.filter((device) => (counts.get(tagKey(device.tag)) ?? 0) > 1);
  }, [identities]);
  const pendingLinks = useMemo<PendingLink[]>(() => [
    ...roomItems.filter((item) => deviceLinkNeedsReview(item, tags)).map((item) => ({
      kind: "room" as const, itemId: item.id, label: item.label, item,
    })),
    ...nodes.flatMap((node) => {
      if (node.type !== "rack" || !Array.isArray(node.data.items)) return [];
      return (node.data.items as RackItem[]).filter((item) => deviceLinkNeedsReview(item, tags)).map((item) => ({
        kind: "rack" as const, itemId: item.id, rackId: node.id, label: item.label, item,
      }));
    }),
  ], [roomItems, nodes, tags]);

  const renameDevice = useCallback((id: string, draft: string) => {
    const tag = tagKey(draft);
    const devices = deviceIdentities(rf.getNodes());
    const previous = devices.find((device) => device.id === id)?.tag;
    if (previous === draft) return;
    if (!tag) return t("Enter a device tag.");
    if (devices.some((device) => device.id !== id && tagKey(device.tag) === tag)) {
      return t("That device tag is already in use.");
    }
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, tag } } : node));
  }, [rf, setNodes, t]);

  const resolvePending = (link: PendingLink, deviceId: string | undefined) => {
    if (deviceId !== undefined && !tags.has(deviceId)) return;
    const patch = { deviceId, linkStatus: deviceId ? undefined : "unlinked" as const };
    if (link.kind === "room") {
      setRoomItems((items) => items.map((item) => item.id === link.itemId ? { ...item, ...patch } : item));
    } else {
      setNodes((current) => current.map((node) => node.id === link.rackId ? {
        ...node, data: { ...node.data, items: (node.data.items as RackItem[]).map((item) =>
          item.id === link.itemId ? { ...item, ...patch } : item,
        ) },
      } : node));
    }
  };

  /* ---------------------------------------------------------------- load */

  const loadInitialProject = useCallback(() => {
    {
      const { nodes: dbNodes, edges: dbEdges, drawings: dbDrawings, settings: dbSettings,
        room: dbRoom, roomItems: dbItems = [], viewport } = initial;
      const dbSignals = { items: initial.signals };

      setRoom(dbRoom ?? DEFAULT_ROOM);
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

      const identities = deviceIdentities(flowNodes);
      const allNodes = parentsFirst([...flowNodes, ...drawNodes].map((node) => {
        if (node.type !== "rack" || !Array.isArray(node.data.items)) return node;
        return { ...node, data: { ...node.data, items: node.data.items.map((item: RackItem) => migrateDeviceLink(item, identities)) } };
      }));
      setRoomItems(dbItems.map((item) => migrateDeviceLink(item, identities)));
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
                reviewExplanation: e.reviewExplanation,
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
  }, [rf, setNodes, setEdges, initial]);

  useEffect(() => {
    loadInitialProject();
  }, [loadInitialProject]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  /* ------------------------------------------------------------- persist */

  const capture = useCallback(() => {
    const current = rf.getNodes();
    if (current.length === 0 && nodesRef.current.length > 0) throw new Error('Canvas is not ready to save.');
    return captureCanvas(current, rf.getEdges(), settings, signals, room, roomItems, rf.getViewport());
  }, [rf, settings, signals, room, roomItems]);

  const flush = useCallback(async () => {
    const generation = editGeneration.current;
    setSaveStatus('saving');
    try {
      const before = session.lastEdited;
      await session.save(capture());
      if (before !== session.lastEdited) await onSaved(session).catch(() => undefined);
      if (generation === editGeneration.current) setSaveStatus('saved');
      setSaveError('');
    } catch (error) {
      setSaveStatus('error');
      setSaveError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [session, capture, onSaved]);

  useEffect(() => {
    if (!loaded) return;
    onReady({ capture, flush });
    return () => onReady(null);
  }, [loaded, capture, flush, onReady]);

  useEffect(() => {
    if (!loaded || blocked) return;
    editGeneration.current++;
    setSaveStatus('saving');
    const timer = setTimeout(() => void flush().catch(() => undefined), 400);
    return () => clearTimeout(timer);
  }, [nodes, edges, loaded, blocked, flush, viewRevision]);

  const warnBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    event.preventDefault(); event.returnValue = '';
  }, []);
  useEffect(() => {
    if (!loaded || saveStatus === 'saved') return;
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [loaded, saveStatus, warnBeforeUnload]);

  const reloadContext = useRef({ session, capture, flush, loaded, blocked });
  useLayoutEffect(() => {
    reloadContext.current = { session, capture, flush, loaded, blocked };
    // Project operations block this editor before switching or restoring it.
    if (blocked) reloadTask.dismiss();
  }, [session, capture, flush, loaded, blocked, reloadTask]);

  const saveAndReload = useCallback(() => {
    const current = reloadContext.current;
    const content = (project: ProjectFile) => JSON.stringify({ ...project, savedAt: undefined });
    let savedContent: string;
    void reloadTask.run({
      save: async () => {
        if (!current.loaded || current.blocked) throw new Error('Canvas is not ready to save.');
        savedContent = content(current.capture());
        await current.flush();
      },
      isCurrent: () => {
        const latest = reloadContext.current;
        // Edits during a slow save must not disappear in the subsequent reload.
        return latest.session === current.session && latest.loaded && !latest.blocked
          && content(latest.capture()) === savedContent;
      },
      reload: () => {
        // flush has saved the exact current content. React may not have removed
        // its old unsaved-work listener yet when the save promise resolves.
        window.removeEventListener('beforeunload', warnBeforeUnload);
        window.location.reload();
      },
    });
  }, [reloadTask, warnBeforeUnload]);

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

      setNodes((nds) => {
        if (node.type !== "database") return nds.concat(node);
        const used = new Set(deviceIdentities(nds).map((device) => tagKey(device.tag)));
        return nds.concat({ ...node, data: { ...node.data, tag: allocateTag(used) } });
      });
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
    if (!confirm(t("Clear the entire canvas?"))) return;
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges, t]);

  /* ------------------------------------------------------- file in/out */

  const projectInputRef = useRef<HTMLInputElement>(null);

  const onSaveJson = useCallback(async () => {
    const project = capture();
    downloadBlob(
      new Blob([JSON.stringify({ ...project, room, roomItems }, null, 2)], {
        type: "application/json",
      }),
      `av-schematic-${stamp()}.json`,
    );
  }, [capture, room, roomItems]);

  const onProjectFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const project = parseProject(await file.text());
        await onImport(project, file.name.replace(/\.json$/i, ''));
      } catch (err) {
        alert(
          err instanceof Error ? err.message : t("Could not open that file."),
        );
      }
    },
    [onImport, t],
  );

  const onExportXlsx = useCallback(() => {
    reloadTask.dismiss();
    void exportTask.run("xlsx", async (signal) => {
      const { nodes: dbNodes, edges: dbEdges, signals: dbSignals } = capture();
      const { buildWorkbook, workbookBlob } = await schedulesFeature.load();
      if (signal.aborted) return;
      downloadBlob(
        workbookBlob(buildWorkbook(dbNodes, dbEdges, dbSignals)),
        `av-schedules-${stamp()}.xlsx`, signal,
      );
    });
  }, [capture, exportTask, reloadTask]);

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
    (format: ImageFormat) => {
      reloadTask.dismiss();
      void exportTask.run(format, async (signal) => {
        const { exportDrawing } = await imageExportFeature.load();
        if (signal.aborted) return;
        await exportDrawing({ nodes: rf.getNodes(), zoom: rf.getZoom(), format, signal });
      });
    },
    [rf, exportTask, reloadTask],
  );

  const onExportHtml = useCallback(() => {
    reloadTask.dismiss();
    void exportTask.run("html", async (signal) => {
      const all = rf.getNodes();
      const drawing = {
        nodes: all,
        edges: rf.getEdges(),
        renderedEdges: readRenderedEdges(document.querySelector(".react-flow__viewport")),
        room,
        roomItems: shownRoomItems,
        signals,
        absolute: (n: Node) => absolutePosition(n, all),
      };
      const { buildViewerHtml } = await htmlExportFeature.load();
      if (signal.aborted) return;
      const html = buildViewerHtml(drawing);
      downloadBlob(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        `av-schematic-viewer-${stamp()}.html`, signal,
      );
    });
  }, [rf, room, shownRoomItems, signals, exportTask, reloadTask]);

  const retryExport = () => {
    if (!exportState) return;
    if (exportState.format === "xlsx") onExportXlsx();
    else if (exportState.format === "html") onExportHtml();
    else onExportImage(exportState.format);
  };

  const findings = useMemo(() => review ? checkDrawing(nodes, edges, roomItems) : [], [review, nodes, edges, roomItems]);
  const exportFormat = (format: Exclude<typeof review, "drawing" | null>) => {
    if (format === "xlsx") onExportXlsx();
    else if (format === "html") onExportHtml();
    else onExportImage(format);
  };
  const requestExport = (format: Exclude<typeof review, "drawing" | null>) => {
    if (checkDrawing(rf.getNodes(), rf.getEdges(), roomItems).length) setReview(format);
    else exportFormat(format);
  };
  const jumpToFinding = (finding: DrawingFinding) => {
    setReview(null);
    if (finding.kind === "room-item") {
      reloadTask.dismiss();
      exportTask.dismiss();
      setRoomSelection(finding.id);
      setShowRoom(true);
      return;
    }
    const edge = finding.kind === "edge" ? rf.getEdge(finding.id) : undefined;
    const targets = finding.kind === "node" ? [finding.id] : edge ? [edge.source, edge.target] : [];
    setNodes((current) => current.map((node) => {
      const selected = finding.kind === "node" && node.id === finding.id;
      return !!node.selected === selected ? node : { ...node, selected };
    }));
    setEdges((current) => current.map((candidate) => {
      const selected = candidate.id === edge?.id;
      return !!candidate.selected === selected ? candidate : { ...candidate, selected };
    }));
    if (targets.length) void rf.fitView({ nodes: targets.map((id) => ({ id })), maxZoom: 1.25, duration: 250 });
  };

  const captureLibraryDevice = (id: string) => {
    const node = rf.getNode(id);
    if (node?.type !== "database") throw new Error("Device not found.");
    return deviceDefinition(normalizeDeviceData(node.data), signals);
  };
  const useLibraryEntry = async (content: LibraryContent, name: string, target?: string) => {
    if (content.kind === "room") {
      const project = blankProject();
      project.room = structuredClone(content.room);
      project.roomItems = templateItems(content.items, nextId);
      await onImport(project, name);
      return;
    }
    if (target) {
      const node = rf.getNode(target);
      if (node?.type !== "database") throw new Error("Device not found.");
      const existing = normalizeDeviceData(node.data);
      const next = instantiateDevice(content.device, existing.tag, nextId, existing.ports);
      const valid = new Set(next.ports.map(port => port.id));
      if (rf.getEdges().some(edge => (edge.source === target && !valid.has(edge.sourceHandle ?? ""))
        || (edge.target === target && !valid.has(edge.targetHandle ?? "")))) {
        throw new Error("This version would remove a connected port.");
      }
      setNodes(current => current.map(item => item.id === target ? { ...item, data: next } : item));
    } else {
      const id = nextId();
      const at = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const instance = instantiateDevice(content.device, content.device.tag, nextId);
      setNodes(current => {
        const used = new Set(deviceIdentities(current).map(device => tagKey(device.tag)));
        const tag = allocateTag(used, content.device.tag);
        const offset = (used.size % 5) * 32;
        return [...current.map(node => node.selected ? { ...node, selected: false } : node), {
          id, type: "database", position: { x: at.x + offset, y: at.y + offset }, selected: true,
          data: { ...instance, tag },
        }];
      });
    }
    setSignals(current => [...current, ...content.signals.filter(signal => !current.some(existing => existing.key === signal.key))]);
  };

  const toggleSnap = useCallback(
    () => setSettings((s) => ({ ...s, snapToGrid: !s.snapToGrid })),
    [],
  );

  /* ------------------------------------------------------- AI bridge */

  const runCommand = useCallback(
    (rawCommand: AICommand): AIReply | void => {
      const cmd: AICommand = rawCommand.type === 'import_product'
        ? { type: 'import_product', ...productSchema.parse(rawCommand) }
        : rawCommand;
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

      if (!loaded || ((blocked || reviewLinks) && !['get_state', 'get_room', 'get_project_context', 'get_project_object'].includes(cmd.type))) {
        return fail(cmd.type, 'Project is loading or its version manager is open. Retry after it closes.');
      }
      const current = rf.getNodes();
      const devices = current.filter((n) => n.type === "database");
      const dataOf = (n: Node) => n.data as unknown as AVDeviceData;
      const identities = deviceIdentities(devices);
      const requireDevice = (reference: string) => {
        const matches = matchDevice(identities, reference);
        if (matches.length === 0) {
          throw new Error(`${t("Device not found.")} ${reference}`);
        }
        if (matches.length > 1) {
          throw new Error(`${t("Device reference is ambiguous. Use the device ID from the device list.")} ${matches.map((device) => device.id).join(", ")}`);
        }
        return devices.find((device) => device.id === matches[0]!.id)!;
      };

      const resolveLink = (tag?: string, deviceId?: string) => {
        if (deviceId !== undefined) {
          if (!identities.some((device) => device.id === deviceId)) {
            throw new Error(`${t("Device not found.")} ${deviceId}`);
          }
          return { tag, deviceId };
        }
        if (!tag) return {};
        const matches = matchDevice(identities, tag, true);
        if (matches.length > 1) {
          throw new Error(`${t("Device reference is ambiguous. Use the device ID from the device list.")} ${matches.map((device) => device.id).join(", ")}`);
        }
        return { tag, deviceId: matches[0]?.id, linkStatus: matches.length ? undefined : "unlinked" as const };
      };

      const snapshot = (): AIReply => {
        const map = new Map(devices.map((n) => [n.id, dataOf(n)]));
        return {
          type: "state",
          devices: devices.map((n) => {
            const d = dataOf(n);
            return {
              id: n.id,
              tag: d.tag,
              name: d.name,
              manufacturer: d.manufacturer,
              model: d.model,
              provenance: d.provenance,
              dimensions: d.dimensions,
              rackUnits: d.rackUnits,
              position: n.position,
              ports: (d.ports ?? []).map((p) => ({
                id: p.id,
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
              id: e.id,
              label: ((e.data as any)?.label as string) ?? "",
              sourceId: e.source,
              targetId: e.target,
              sourcePortId: e.sourceHandle,
              targetPortId: e.targetHandle,
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

        case "get_project_context":
          return ok(cmd.type, readProjectContext({ nodes: current, edges: rf.getEdges(), room, roomItems }));

        case "get_project_object":
          return ok(cmd.type, readProjectObject({ nodes: current, edges: rf.getEdges(), room, roomItems }, cmd.kind, cmd.id));

        case "clear":
          setNodes([]);
          setEdges([]);
          return ok("clear");

        case "set_room": {
          const next: RoomSpec = {
            ...room,
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

        case "import_room_layout": {
          const next = prepareRoomImport(cmd, room, roomItems, identities, () => `r${nextId()}`);
          if (!next.duplicate) {
            setRoom(next.room);
            setRoomItems(next.items);
          }
          return ok(cmd.type, { duplicate: next.duplicate, room: next.room, items: next.items });
        }

        case "add_room_item": {
          const item = makeRoomItem(
            {
              id: `r${nextId()}`,
              kind: cmd.kind,
              label: cmd.label,
              ...resolveLink(cmd.tag, cmd.deviceId),
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
            devices: [{ room, items: shownRoomItems }],
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
              ...resolveLink(e.tag, e.deviceId),
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

        case "import_product":
        case "add_device": {
          const used = new Set(identities.map((device) => tagKey(device.tag)));
          if (cmd.tag !== undefined && !tagKey(cmd.tag)) return fail(cmd.type, t("Enter a device tag."));
          if (cmd.tag && used.has(tagKey(cmd.tag))) return fail(cmd.type, t("That device tag is already in use."));
          const data = { ...makeDeviceData(), tag: allocateTag(used, cmd.tag) };
          if (cmd.name) data.name = cmd.name;
          data.manufacturer = cmd.manufacturer ?? "";
          data.model = cmd.model ?? "";
          if (cmd.type === "import_product") {
            data.provenance = cmd.provenance;
            data.dimensions = cmd.dimensions;
            data.rackUnits = cmd.rackUnits;
          }
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
            return fail(cmd.type, `No zone named "${cmd.zone}"`);
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
          return ok(cmd.type, { deviceId: id, tag: data.tag, zone: cmd.zone });
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
          const from = requireDevice(cmd.from);
          const to = requireDevice(cmd.to);

          const pick = (node: Node, dir: "in" | "out", want?: string) => {
            const ports = (dataOf(node).ports ?? []).filter(
              (p) => p.dir === dir,
            );
            if (!want) return ports[0];
            const exact = ports.find((port) => port.id === want);
            if (exact) return exact;
            const matches = ports.filter((port) => tagKey(port.label) === tagKey(want));
            if (matches.length > 1) throw new Error(`${t("Port label is ambiguous. Use the port ID from the device list.")} ${want}`);
            return matches[0];
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
          const node = requireDevice(cmd.tag);
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
    [rf, setNodes, setEdges, settings, room, roomItems, shownRoomItems, signals, loaded, blocked, reviewLinks, t],
  );

  const aiStatus = useAIBridge(runCommand);

  /* --------------------------------------------------------- history */

  const [history] = useState(createDocumentHistory);
  const historyGroup = useRef<{ pointer?: symbol; typing?: symbol }>({});
  const snapshot: Snapshot = useMemo(() => ({
    schematic: { nodes, edges, signals, grid: { snapToGrid: settings.snapToGrid, gridSize: settings.gridSize } },
    room: { room, items: roomItems },
  }), [nodes, edges, signals, settings.snapToGrid, settings.gridSize, room, roomItems]);

  const editGroup = () => historyGroup.current.typing ?? historyGroup.current.pointer;
  useLayoutEffect(() => {
    if (loaded) history.record(snapshot, editGroup());
  }, [history, loaded, snapshot]);

  useEffect(() => {
    let release: ReturnType<typeof setTimeout> | undefined;
    const endGesture = () => {
      const pointer = historyGroup.current.pointer;
      clearTimeout(release);
      // The final pointer event can finish the edit in the same React batch.
      release = setTimeout(() => {
        if (historyGroup.current.pointer === pointer) historyGroup.current.pointer = undefined;
      }, 0);
    };
    window.addEventListener("pointerup", endGesture);
    window.addEventListener("pointercancel", endGesture);
    window.addEventListener("blur", endGesture);
    return () => {
      clearTimeout(release);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
      window.removeEventListener("blur", endGesture);
    };
  }, []);

  const restoreHistory = (redo: boolean) => {
    const step = redo ? history.redo : history.undo;
    if (showRoom) {
      const next = step("room", snapshot, editGroup());
      if (!next) return;
      setRoom(next.room);
      setRoomItems(next.items);
      return;
    }
    const next = step("schematic", snapshot, editGroup());
    if (!next) return;
    setNodes((current) => {
      const selection = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return parentsFirst(next.nodes.map((node) => ({
        ...node, selected: selection.has(node.id), dragging: false, resizing: false,
        data: { ...node.data, autoFocus: undefined },
      })));
    });
    setEdges((current) => {
      const selection = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return next.edges.map((edge) => ({ ...edge, selected: selection.has(edge.id) }));
    });
    setSignals(next.signals);
    setSettings((current) => ({ ...current, ...next.grid }));
  };

  /* ------------------------------------------------------- duplicate */

  const duplicateSelection = useCallback(() => {
    const all = rf.getNodes();
    const picked = all.filter((n) => n.selected && n.type !== "drawing");
    if (picked.length === 0) return;

    const idMap = new Map<string, string>();
    const usedTags = new Set(deviceIdentities(all).map((device) => tagKey(device.tag)));
    const copies = picked.map((n) => {
      const id = nextId();
      idMap.set(n.id, id);
      const data = structuredClone(n.data);
      if (n.type === "database") data.tag = allocateTag(usedTags, String(data.tag ?? ""));
      return {
        ...n,
        id,
        // Offset only top-level copies; children keep their parent-relative spot.
        position: n.parentId
          ? n.position
          : { x: n.position.x + 32, y: n.position.y + 32 },
        selected: true,
        data,
      };
    });
    // Re-point copied children at copied parents where both were selected.
    for (const copy of copies) {
      if (copy.parentId && idMap.has(copy.parentId)) {
        copy.parentId = idMap.get(copy.parentId);
      }
      if (copy.type === "rack" && Array.isArray(copy.data.items)) {
        copy.data.items = (copy.data.items as RackItem[]).map((item) => ({
          ...item, deviceId: item.deviceId ? idMap.get(item.deviceId) ?? item.deviceId : undefined,
        }));
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
      if (blocked || reviewLinks || !loaded || typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        restoreHistory(e.shiftKey);
        return;
      }
      if (showRoom) return;
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
      if (blocked || !loaded || e.code !== "Space" || typing(e.target)) return;
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
  }, [blocked, loaded, changeTool, duplicateSelection, restoreHistory, setNodes, showRoom, reviewLinks, tool]);

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
        return { id: n.id, x: at.x, y: at.y, w, h };
      }),
    [nodes],
  );

  const isSelect = tool === "select";

  return (
    <ThemeContext.Provider value={resolved}>
      <DeviceIdentityContext.Provider value={{ tags, rename: renameDevice }}>
      <div
        className="relative h-screen w-full"
        inert={blocked || !loaded}
        onPointerDownCapture={() => { historyGroup.current.pointer = Symbol(); }}
        onFocusCapture={(event) => {
          const target = event.target;
          if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement
            && ["text", "number", "search", "tel", "url"].includes(target.type))) {
            historyGroup.current.typing = Symbol();
          }
        }}
        onBlurCapture={() => { historyGroup.current.typing = undefined; }}
      >
        {/* Overlaid rather than swapped in: unmounting ReactFlow would empty its
          store, and both capture() and the AI commands read from it. */}
        {showRoom && (
          <RoomViewFeature
            room={room}
            items={shownRoomItems}
            initialSelection={roomSelection}
            devices={identities}
            onEditRoom={(patch) => {
              const next = { ...room, ...patch };
              setRoom(next);
              setRoomItems((items) => items.map((item) => ({ ...item, position: clampRoomPosition(item.position, next) })));
            }}
            onAddItem={(kind, label, deviceId) => {
              const device = identities.find((entry) => entry.id === deviceId);
              const item = makeRoomItem({ id: nextId(), kind, label: label || device?.name || device?.tag || t(kind),
                deviceId: device?.id, tag: device?.tag }, room);
              item.position = clampRoomPosition(item.position, room);
              setRoomItems((items) => [...items, item]);
              return item.id;
            }}
            onDuplicateItem={(source) => {
              const id = nextId();
              const position = clampRoomPosition({ ...source.position, x: source.position.x + 0.25, z: source.position.z + 0.25 }, room);
              setRoomItems((items) => [...items, { ...source, id, position, size: { ...source.size },
                importId: undefined, deviceId: undefined, linkStatus: "unlinked", tag: undefined }]);
              return id;
            }}
            onClose={closeRoom}
            recovery={{ state: reloadState, onReload: saveAndReload, onCancel: reloadTask.dismiss }}
            onDeleteItem={(id) => setRoomItems((items) => items.filter((item) => item.id !== id))}
            onMoveItem={(id, change) =>
              setRoomItems((prev) =>
                prev.map((i) => (i.id === id ? { ...i, ...change } : i)),
              )
            }
          />
        )}
        <div className="absolute bottom-3 left-1/2 z-20 max-w-[60vw] -translate-x-1/2 rounded-lg bg-background/95 px-3 py-1.5 text-xs shadow" role={saveStatus === 'error' ? 'alert' : 'status'}>
          <span className="font-medium">{session.entry.name}</span> · {t(saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved locally')}
          {(duplicateDevices.length > 0 || pendingLinks.length > 0) && (
            <button className="ml-2 underline" onClick={() => setReviewLinks(true)}>{t("Review device references")}</button>
          )}
          {saveStatus === 'error' && <><p>{t(saveError)}</p><button className="underline" onClick={() => void flush().catch(() => undefined)}>{t('Retry save')}</button></>}
        </div>
        <FileMenu
          onProjects={onProjects}
          onReview={() => setReview("drawing")}
          onLibrary={() => setLibraryOpen(true)}
          onOpen={() => projectInputRef.current?.click()}
          onSaveJson={onSaveJson}
          onExportXlsx={() => requestExport("xlsx")}
          onExportImage={requestExport}
          onExportHtml={() => requestExport("html")}
          exportBusy={exportState?.phase === "preparing" || reloadState?.phase === "saving"}
          onOpenRoom={() => { reloadTask.dismiss(); setRoomSelection(undefined); setShowRoom(true); }}
          roomItemCount={roomItems.length}
          theme={theme}
          onThemeChange={setTheme}
          aiStatus={aiStatus}
        />
        {libraryOpen && <ReusableLibraryDialog devices={identities} onClose={() => setLibraryOpen(false)}
          captureDevice={captureLibraryDevice}
          captureRoom={() => ({ kind: "room", room: structuredClone(room), items: structuredClone(roomItems) })}
          onUse={useLibraryEntry} />}
        {review && <DrawingReview findings={findings} format={review === "drawing" ? undefined : review}
          onClose={() => setReview(null)}
          onProceed={() => { setReview(null); if (review !== "drawing") exportFormat(review); }}
          onJump={jumpToFinding}
          onExplain={(id, text) => setEdges((current) => current.map((edge) => edge.id === id
            ? { ...edge, data: { ...edge.data, reviewExplanation: text.trim() || undefined } } : edge))} />}
        <ExportStatus state={exportState} onRetry={retryExport}
          onDismiss={() => { reloadTask.dismiss(); exportTask.dismiss(); }}
          recovery={{ state: reloadState, onReload: saveAndReload, onCancel: reloadTask.dismiss }} />
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
          inert={showRoom}
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
                multiSelectionKeyCode={showRoom ? null : "Shift"}
                selectionKeyCode={showRoom ? null : "Shift"}
                deleteKeyCode={showRoom ? null : ["Backspace", "Delete"]}
                snapToGrid={settings.snapToGrid}
                snapGrid={[settings.gridSize, settings.gridSize]}
                connectionRadius={24}
                proOptions={{ hideAttribution: true }}
                fitView={!initial.viewport}
                onMoveEnd={() => setViewRevision(value => value + 1)}
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
      <DeviceLinkReview open={reviewLinks} devices={identities} duplicates={duplicateDevices}
        links={pendingLinks} onClose={() => setReviewLinks(false)} onResolve={resolvePending} />
      </DeviceIdentityContext.Provider>
    </ThemeContext.Provider>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
