import type { Point } from "./stroke";

export type RenderedEdge = {
  path: string;
  bounds: { x: number; y: number; width: number; height: number };
  label?: Point;
};

/** Read the same path already resolved by the editor, including manual bends. */
export function readRenderedEdges(viewport: HTMLElement | null) {
  const edges = new Map<string, RenderedEdge>();
  if (!viewport) return edges;

  const labels = new Map(
    Array.from(viewport.querySelectorAll<HTMLElement>("[data-export-edge-label]"), (label) => [
      label.dataset.exportEdgeLabel,
      { x: Number(label.dataset.exportX), y: Number(label.dataset.exportY) },
    ]),
  );
  for (const group of viewport.querySelectorAll<SVGElement>(".react-flow__edge[data-id]")) {
    const id = group.dataset.id;
    const element = group.querySelector<SVGPathElement>("path.react-flow__edge-path");
    const path = element?.getAttribute("d");
    if (!id || !element || !path) continue;
    const { x, y, width, height } = element.getBBox();
    edges.set(id, { path, bounds: { x, y, width, height }, label: labels.get(id) });
  }
  return edges;
}
