import type { Edge, Node } from "@xyflow/react";

/** Horizontal gap between the vertical legs of cables leaving one device. */
export const LANE_GAP = 18;

/**
 * Cables that fan out of a single device would otherwise all drop through the
 * same vertical corridor and sit exactly on top of each other. Give each one a
 * lane, ordered by where it lands, so the bundle reads as separate runs.
 *
 * Lanes are centred on the natural mid-point (…, -1.5, -0.5, 0.5, 1.5, …) so a
 * fan-out stays visually balanced between the two devices.
 *
 * This is derived state, never persisted: a cable the user has routed by hand
 * keeps its own midX and is left out of the lane assignment entirely.
 */
export function assignLanes(edges: Edge[], nodes: Node[]): Edge[] {
  const posOf = new Map(nodes.map((n) => [n.id, n.position]));
  const groups = new Map<string, Edge[]>();

  for (const edge of edges) {
    // Hand-routed cables opt out — respect what the user drew.
    if ((edge.data as { midX?: number } | undefined)?.midX !== undefined) continue;
    const list = groups.get(edge.source);
    if (list) list.push(edge);
    else groups.set(edge.source, [edge]);
  }

  const lanes = new Map<string, number>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      const ay = posOf.get(a.target)?.y ?? 0;
      const by = posOf.get(b.target)?.y ?? 0;
      if (ay !== by) return ay - by;
      return String(a.targetHandle).localeCompare(String(b.targetHandle));
    });
    sorted.forEach((edge, i) => lanes.set(edge.id, i - (sorted.length - 1) / 2));
  }

  if (lanes.size === 0) return edges;
  return edges.map((edge) => {
    const lane = lanes.get(edge.id);
    return lane === undefined
      ? edge
      : { ...edge, data: { ...edge.data, lane } };
  });
}
