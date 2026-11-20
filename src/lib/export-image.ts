import { t } from "./i18n";
import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { jsPDF } from "jspdf";

import { downloadBlob, stamp } from "./schedules";

export type ImageFormat = "png" | "svg" | "pdf";

/** Whitespace left around the drawing, in pixels at export scale. */
const MARGIN = 48;
/** Cap so a huge drawing cannot blow up browser memory. */
const MAX_EDGE = 8000;
const MAX_PIXELS = 24_000_000;
const MAX_PDF_POINTS = 14_400;

export function rasterPixelRatio(width: number, height: number, scale: number) {
  return Math.min(scale, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
}

/** Edge paths and labels can extend outside the boxes occupied by nodes. */
function drawingBounds(element: HTMLElement, nodes: Node[], zoom: number) {
  const bounds = getNodesBounds(nodes);
  const origin = element.getBoundingClientRect();
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  for (const part of element.querySelectorAll(
    ".react-flow__node, .react-flow__edge-path, .react-flow__edgelabel-renderer > *",
  )) {
    const rect = part.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    left = Math.min(left, (rect.left - origin.left) / zoom);
    top = Math.min(top, (rect.top - origin.top) / zoom);
    right = Math.max(right, (rect.right - origin.left) / zoom);
    bottom = Math.max(bottom, (rect.bottom - origin.top) / zoom);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Captures the flow viewport only — controls, minimap and panels are siblings
 * of it, so they are naturally excluded from the output.
 */
function viewportElement(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) throw new Error(t("Nothing to export — the canvas is not ready."));
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
  zoom: number;
  /** Multiplier on the natural size; 2 gives a crisp print. */
  scale?: number;
  transparent?: boolean;
  filename?: string;
};

export async function exportDrawing({
  nodes,
  format,
  zoom,
  scale = 2,
  transparent = false,
  filename,
}: Options) {
  if (nodes.length === 0) {
    throw new Error(t("Nothing to export — the canvas is empty."));
  }

  const element = viewportElement();
  const bounds = drawingBounds(element, nodes, zoom);
  if (!bounds.width || !bounds.height) {
    throw new Error(t("Nothing to export — the canvas is empty."));
  }

  // Render at 1:1 in flow units, then let `scale` drive the pixel density.
  const width = Math.ceil(bounds.width + MARGIN * 2);
  const height = Math.ceil(bounds.height + MARGIN * 2);
  const pixelRatio = rasterPixelRatio(width, height, scale);

  // zoom 1 keeps text crisp; the transform just centres the content.
  const viewport = getViewportForBounds(bounds, width, height, 1, 1, MARGIN);

  const style = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  };
  const backgroundColor = sheetColor(transparent);
  const shared = {
    width,
    height,
    pixelRatio,
    skipAutoScale: true,
    style,
    // The edge-label layer is absolutely positioned and must come along.
    filter: (node: HTMLElement) =>
      !node.classList?.contains("react-flow__minimap") &&
      !node.classList?.contains("react-flow__controls"),
  };

  const name = filename ?? `av-schematic-${stamp()}`;

  if (format === "svg") {
    const dataUrl = await toSvg(element, shared);
    const xml = await (await fetch(dataUrl)).text();
    if (!backgroundColor) {
      downloadBlob(new Blob([xml], { type: "image/svg+xml" }), `${name}.svg`);
      return;
    }
    // Put the background on the sheet rather than on the translated viewport.
    const svg = new DOMParser().parseFromString(xml, "image/svg+xml").documentElement;
    const rect = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", backgroundColor);
    svg.prepend(rect);
    downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }), `${name}.svg`);
    return;
  }

  const dataUrl = await toPng(element, { ...shared, backgroundColor });

  if (format === "png") {
    downloadBlob(await (await fetch(dataUrl)).blob(), `${name}.png`);
    return;
  }

  // Fit the whole drawing on one PDF page, including drawings larger than
  // the maximum PDF page size. Preserve its aspect ratio at the page limit.
  const pointsPerUnit = Math.min(0.75, MAX_PDF_POINTS / Math.max(width, height));
  const pageWidth = width * pointsPerUnit;
  const pageHeight = height * pointsPerUnit;
  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [pageWidth, pageHeight],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  downloadBlob(pdf.output("blob"), `${name}.pdf`);
}
