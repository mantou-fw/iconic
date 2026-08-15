import { MarkerType, type Edge } from "@xyflow/react";

export type ArrowDirection = "forward" | "backward" | "both";

const ORDER: ArrowDirection[] = ["forward", "both", "backward"];

export const nextArrowDirection = (d: ArrowDirection | undefined): ArrowDirection =>
  ORDER[(ORDER.indexOf(d ?? "forward") + 1) % ORDER.length]!;

/** Which end(s) of the line get an arrowhead, given its configured direction. */
export function arrowMarkers(
  direction: ArrowDirection | undefined,
  color: string,
): Pick<Edge, "markerStart" | "markerEnd"> {
  const marker = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
  const d = direction ?? "forward";
  return {
    markerEnd: d === "backward" ? undefined : marker,
    markerStart: d === "backward" || d === "both" ? marker : undefined,
  };
}
