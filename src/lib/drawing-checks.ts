import type { Edge, Node } from "@xyflow/react";
import type { AVDeviceData } from "@/components/nodes/av-device-node";
import { deviceIdentities, deviceLinkNeedsReview, tagKey, type DeviceLink } from "./device-identity";
import type { RoomItem } from "./room";

export type DrawingFinding = {
  kind: "node" | "edge" | "room-item";
  id: string;
  label: string;
  severity: "error" | "warning" | "info";
  message: string;
  details?: string[];
  canExplain?: boolean;
  explanation?: string;
};

function counts(values: string[]) {
  const result = new Map<string, number>();
  for (const value of values) {
    const key = tagKey(value);
    if (key) result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

export function checkDrawing(nodes: Node[], edges: Edge[], roomItems: RoomItem[]): DrawingFinding[] {
  const findings: DrawingFinding[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const devices = deviceIdentities(nodes);
  const deviceTags = new Map(devices.map(({ id, tag }) => [id, tag]));
  const tagCounts = counts(devices.map(({ tag }) => tag));
  const isCable = (edge: Edge) =>
    edge.type === "labeled" || deviceTags.has(edge.source) || deviceTags.has(edge.target);
  const cableCounts = counts(edges.filter(isCable).map((edge) => tagKey(edge.data?.label)));

  for (const { id, tag, name } of devices) {
    const object = { kind: "node" as const, id, label: tag || name || id };
    const data = byId.get(id)!.data as unknown as AVDeviceData;
    if (!tagKey(tag)) findings.push({ ...object, severity: "error", message: "Device tag is missing." });
    else if ((tagCounts.get(tagKey(tag)) ?? 0) > 1) findings.push({ ...object, severity: "error", message: "Device tag is duplicated." });
    if (!data.manufacturer?.trim() || !data.model?.trim()) {
      findings.push({ ...object, severity: "warning", message: "Manufacturer or model is unknown." });
    }
    if (data.provenance?.assumptions.length) {
      findings.push({ ...object, severity: "info", message: "Review assumptions from the import.", details: data.provenance.assumptions });
    }
  }

  for (const node of nodes) {
    if (node.type !== "rack" || !Array.isArray(node.data.items)) continue;
    const items = node.data.items as Array<DeviceLink & { label: string }>;
    const unresolved = items.filter((item) => deviceLinkNeedsReview(item, deviceTags));
    if (unresolved.length) findings.push({
      kind: "node", id: node.id, label: String(node.data.name || node.id),
      severity: "warning", message: "Review unresolved equipment links.", details: unresolved.map((item) => item.label),
    });
  }
  for (const item of roomItems) {
    if (deviceLinkNeedsReview(item, deviceTags)) findings.push({
      kind: "room-item", id: item.id, label: item.label, severity: "warning", message: "Review unresolved equipment links.",
    });
  }

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const out = source?.type === "database"
      ? (source.data as unknown as AVDeviceData).ports?.find((port) => port.id === edge.sourceHandle && port.dir === "out")
      : undefined;
    const input = target?.type === "database"
      ? (target.data as unknown as AVDeviceData).ports?.find((port) => port.id === edge.targetHandle && port.dir === "in")
      : undefined;
    const label = typeof edge.data?.label === "string" ? edge.data.label : "";
    const object = { kind: "edge" as const, id: edge.id, label: label || edge.id };
    if (!source || !target || (source.type === "database" && !out) || (target.type === "database" && !input)) {
      findings.push({ ...object, severity: "error", message: "Connection has an unresolved endpoint." });
    }
    // Generic diagram arrows do not represent scheduled AV cables.
    if (!isCable(edge)) continue;
    if (!tagKey(label)) findings.push({ ...object, severity: "warning", message: "Cable identifier is missing." });
    else if ((cableCounts.get(tagKey(label)) ?? 0) > 1) findings.push({ ...object, severity: "error", message: "Cable identifier is duplicated." });
    if (out && input && out.signal !== input.signal) {
      const explanation = typeof edge.data?.reviewExplanation === "string" ? edge.data.reviewExplanation.trim() : "";
      findings.push({
        ...object, severity: explanation ? "info" : "warning", message: "Endpoint signal classes differ.",
        details: [out.signal, input.signal], canExplain: true, explanation,
      });
    }
  }
  return findings;
}
