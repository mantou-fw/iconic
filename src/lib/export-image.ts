import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { jsPDF } from "jspdf";

import { downloadBlob, stamp } from "./schedules";

export type ImageFormat = "png" | "svg" | "pdf";

/** Whitespace left around the drawing, in pixels at export scale. */
const MARGIN = 48;
/** Cap so a huge drawing cannot blow up browser memory. */
const MAX_EDGE = 8000;

/**
 * Captures the flow viewport only — controls, minimap and panels are siblings
 * of it, so they are naturally excluded from the output.
 */
function viewportElement(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) throw new Error("Nothing to export — the canvas is not ready.");
  return el;
}

/** Page background, so a dark-theme drawing still prints on white. */
function sheetColor(transparent: boolean) {
  if (transparent) return undefined;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--canvas")
      .trim() || "#ffffff"
  );
}

type Options = {
  nodes: Node[];
  format: ImageFormat;
  /** Multiplier on the natural size; 2 gives a crisp print. */
  scale?: number;
  transparent?: boolean;
  filename?: string;
};

export async function exportDrawing({
  nodes,
  format,
  scale = 2,
  transparent = false,
  filename,
}: Options) {
  if (nodes.length === 0) {
    throw new Error("Nothing to export — the canvas is empty.");
  }

  const bounds = getNodesBounds(nodes);
  if (!bounds.width || !bounds.height) {
    throw new Error("Nothing to export — the canvas is empty.");
  }

  // Render at 1:1 in flow units, then let `scale` drive the pixel density.
  const width = Math.ceil(bounds.width + MARGIN * 2);
  const height = Math.ceil(bounds.height + MARGIN * 2);
  const longest = Math.max(width, height);
  const pixelRatio =
    longest * scale > MAX_EDGE ? Math.max(1, MAX_EDGE / longest) : scale;

  // zoom 1 keeps text crisp; the transform just centres the content.
  const viewport = getViewportForBounds(bounds, width, height, 1, 1, MARGIN);

  const element = viewportElement();
  const style = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  };
  const shared = {
    backgroundColor: sheetColor(transparent),
    width,
    height,
    pixelRatio,
    style,
    // The edge-label layer is absolutely positioned and must come along.
    filter: (node: HTMLElement) =>
      !node.classList?.contains("react-flow__minimap") &&
      !node.classList?.contains("react-flow__controls"),
  };

  const name = filename ?? `av-schematic-${stamp()}`;

  if (format === "svg") {
    const dataUrl = await toSvg(element, shared);
    downloadBlob(await (await fetch(dataUrl)).blob(), `${name}.svg`);
    return;
  }

  const dataUrl = await toPng(element, shared);

  if (format === "png") {
    downloadBlob(await (await fetch(dataUrl)).blob(), `${name}.png`);
    return;
  }

  // PDF: one page sized to the drawing, so nothing is cropped or rescaled.
  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [width, height],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, width, height, undefined, "FAST");
  downloadBlob(pdf.output("blob"), `${name}.pdf`);
}
