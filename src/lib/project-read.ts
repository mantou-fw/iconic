import type { Edge, Node } from "@xyflow/react";
import { deviceIdentities, displayDeviceTag } from "./device-identity";
import type { RoomItem, RoomSpec } from "./room";

export const projectObjectKinds = ["node", "cable", "room-item"] as const;
export type ProjectObjectKind = (typeof projectObjectKinds)[number];

type ProjectRead = {
  nodes: Node[];
  edges: Edge[];
  room: RoomSpec;
  roomItems: RoomItem[];
};

function describeNode(node: Node, detail: boolean) {
  const { src, ...imageFields } = node.type === "image" ? node.data : {};
  const { points, ...drawingFields } = node.type === "drawing" && !detail ? node.data : {};
  const data = node.type === "image"
    ? { ...imageFields, source: typeof src === "string" ? { embedded: src.startsWith("data:"), length: src.length } : null }
    : node.type === "drawing" && !detail
      ? { ...drawingFields, pointCount: Array.isArray(points) ? points.length : 0 }
      : node.data;
  return {
    id: node.id, type: node.type, parentId: node.parentId ?? null,
    position: { ...node.position, relativeTo: node.parentId ? "parent" : "canvas" },
    width: node.width ?? node.measured?.width, height: node.height ?? node.measured?.height,
    data,
  };
}

function describeCable(edge: Edge, nodes: ReadonlyMap<string, Node>) {
  const endpoint = (nodeId: string, portId: string | null | undefined) => {
    const node = nodes.get(nodeId);
    const ports: unknown = node?.data.ports;
    const port = Array.isArray(ports) ? ports.find((entry) => entry.id === portId) : undefined;
    return { nodeId, portId: portId ?? null, tag: node?.data.tag, label: port?.label ?? portId };
  };
  return {
    id: edge.id, type: edge.type, source: endpoint(edge.source, edge.sourceHandle),
    target: endpoint(edge.target, edge.targetHandle), data: edge.data,
  };
}

export function readProjectContext(project: ProjectRead) {
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const tags = new Map(deviceIdentities(project.nodes).map(({ id, tag }) => [id, tag]));
  return {
    version: 1,
    nodes: project.nodes.map((node) => describeNode(node, false)),
    cables: project.edges.map((edge) => describeCable(edge, nodes)),
    room: {
      spec: project.room,
      coordinateSpace: "room-metres",
      items: project.roomItems.map((item) => ({ ...item, displayTag: displayDeviceTag(item, tags) })),
    },
  };
}

export function readProjectObject(project: ProjectRead, kind: ProjectObjectKind, id: string) {
  const node = kind === "node" ? project.nodes.find((node) => node.id === id) : undefined;
  const cable = kind === "cable" ? project.edges.find((edge) => edge.id === id) : undefined;
  const item = kind === "room-item" ? project.roomItems.find((item) => item.id === id) : undefined;
  const object = node ? describeNode(node, true)
    : cable ? describeCable(cable, new Map(project.nodes.map((node) => [node.id, node])))
    : item ? { ...item, coordinateSpace: "room-metres", displayTag: displayDeviceTag(item,
      new Map(deviceIdentities(project.nodes).map(({ id, tag }) => [id, tag]))) }
    : null;
  return { version: 1, kind, id, found: object !== null, object };
}
