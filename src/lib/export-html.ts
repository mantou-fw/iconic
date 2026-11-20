import { t, getLocale } from "./i18n";
import { getSmoothStepPath, Position, type Edge, type Node } from "@xyflow/react";
import { buildIcon, getIcon } from "@iconify/react";

import { avoidObstacles, midpointOf, roundedPath } from "./routing";
import type { RenderedEdge } from "./export-geometry";
import { arrowMarkers, type ArrowDirection } from "./arrow-direction";
import type { RackNodeData } from "@/components/nodes/rack-node";
import {
  DEFAULT_SIGNALS,
  findSignal,
  signalColor,
  type SignalDef,
} from "./signal-types";
import type { RoomItem, RoomSpec } from "./room";
import type {
  AVDeviceData,
  DevicePort,
} from "@/components/nodes/av-device-node";
import type { TitleBlockData } from "@/components/nodes/title-block";

/**
 * Builds a self-contained, read-only viewer for a client.
 *
 * The schematic is rendered to SVG here rather than shipping the editor: the
 * result is one small file with no dependencies, no network access and no way
 * to change the drawing, which is what you want to hand to a client. Cable
 * geometry reuses the app's own router so the exported drawing matches what
 * was on screen.
 */

/* ---------------------------------------------------------------- layout */

const W = 268;
const HEADER_H = 44;
const COLHEAD_H = 16;
const ROW_H = 26;
const PAD_B = 8;

const deviceHeight = (d: AVDeviceData) => {
  const ports = d.ports ?? [];
  const rows = Math.max(
    ports.filter((p) => p.dir === "in").length,
    ports.filter((p) => p.dir === "out").length,
    1,
  );
  return HEADER_H + COLHEAD_H + rows * ROW_H + PAD_B;
};

const portY = (index: number) =>
  HEADER_H + COLHEAD_H + index * ROW_H + ROW_H / 2;

/**
 * SVG text does not wrap or clip, so a long port name would run straight
 * across the column divider and collide with the connector. Ellipsize to what
 * the column can hold; the full text is still in the detail panel and the
 * cable schedule.
 */
const fit = (s: unknown, max: number) => {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "\u2026" : t;
};

const LABEL_MAX = 12;
const CONN_MAX = 7;

/* ----------------------------------------------------------- escaping */

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Safe to sit inside a <script> block: `<` is escaped so a string containing
 * "</script>" cannot close it, and the two Unicode line separators are escaped
 * because a JS parser treats them as literal newlines though JSON allows them.
 */
const json = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/* ------------------------------------------------------------- helpers */

type Ctx = {
  nodes: Node[];
  absolute: (n: Node) => { x: number; y: number };
  signals: SignalDef[];
  renderedEdges: ReadonlyMap<string, RenderedEdge>;
  obstacles: { x: number; y: number; w: number; h: number }[];
};

const safeColor = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#(?:[a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value)
    ? value
    : fallback;

function finite(value: unknown, fallback: number): number;
function finite(value: unknown): number | undefined;
function finite(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const deviceOf = (n: Node) => n.data as unknown as AVDeviceData;

function portIndex(ports: DevicePort[], id: unknown, dir: "in" | "out") {
  return ports.filter((p) => p.dir === dir).findIndex((p) => p.id === id);
}

const rackUnits = (value: unknown) => Math.min(100, Math.max(1, Math.floor(finite(value, 24))));

function nodeSize(node: Node) {
  if (node.type === "database") return { w: W, h: deviceHeight(deviceOf(node)) };
  const defaults = {
    zone: [460, 320],
    rack: [302, 32 + rackUnits(node.data.units) * 15],
    titleblock: [320, 480],
    "icon-text": [132, 72],
    shape: [160, 80],
  };
  const [w, h] = Object.hasOwn(defaults, node.type ?? "")
    ? defaults[node.type as keyof typeof defaults] : [160, 40];
  return {
    w: finite(node.measured?.width, 0) || finite(node.width, 0) || w!,
    h: finite(node.measured?.height, 0) || finite(node.height, 0) || h!,
  };
}

/* ------------------------------------------------------------ svg parts */

function zoneSvg(n: Node, at: { x: number; y: number }) {
  const d = n.data as { name?: string; color?: string };
  const { w, h } = nodeSize(n);
  const color = safeColor(d.color, "#0071e3");
  return `<g class="zone">
  <rect x="${at.x}" y="${at.y}" width="${w}" height="${h}" rx="14"
        fill="${color}" fill-opacity="0.06" stroke="${color}" stroke-opacity="0.5"
        stroke-width="2" stroke-dasharray="7 5"/>
  <rect x="${at.x + 12}" y="${at.y - 9}" width="${Math.max(60, esc(d.name).length * 6.6 + 22)}" height="18" rx="9"
        fill="${color}" fill-opacity="0.16"/>
  <circle cx="${at.x + 24}" cy="${at.y}" r="3" fill="${color}"/>
  <text x="${at.x + 32}" y="${at.y + 3.5}" class="zone-label" fill="${color}">${esc(d.name)}</text>
</g>`;
}

function deviceSvg(
  n: Node,
  at: { x: number; y: number },
  signals: SignalDef[],
) {
  const d = deviceOf(n);
  const ports = d.ports ?? [];
  const ins = ports.filter((p) => p.dir === "in");
  const outs = ports.filter((p) => p.dir === "out");
  const h = deviceHeight(d);
  const mid = at.x + W / 2;

  const row = (p: DevicePort, i: number, dir: "in" | "out") => {
    const y = at.y + portY(i);
    const color = signalColor(signals, p.signal);
    if (dir === "in") {
      return `<g>
      <rect x="${at.x + 6}" y="${y - 7}" width="3" height="14" rx="1.5" fill="${color}"/>
      <text x="${at.x + 14}" y="${y + 3.5}" class="port">${esc(fit(p.label, LABEL_MAX))}</text>
      <text x="${mid - 8}" y="${y + 3}" class="conn" text-anchor="end">${esc(fit(p.connector, CONN_MAX))}</text>
      <circle cx="${at.x}" cy="${y}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    </g>`;
    }
    return `<g>
      <rect x="${at.x + W - 9}" y="${y - 7}" width="3" height="14" rx="1.5" fill="${color}"/>
      <text x="${at.x + W - 14}" y="${y + 3.5}" class="port" text-anchor="end">${esc(fit(p.label, LABEL_MAX))}</text>
      <text x="${mid + 8}" y="${y + 3}" class="conn">${esc(fit(p.connector, CONN_MAX))}</text>
      <circle cx="${at.x + W}" cy="${y}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    </g>`;
  };

  return `<g class="device" data-id="${esc(n.id)}" tabindex="0">
  <rect class="device-body" x="${at.x}" y="${at.y}" width="${W}" height="${h}" rx="12"/>
  <path d="M ${at.x} ${at.y + HEADER_H} H ${at.x + W}" class="rule"/>
  <rect x="${at.x + 6}" y="${at.y + 7}" width="64" height="15" rx="5" class="tagbox"/>
  <text x="${at.x + 38}" y="${at.y + 18}" class="tag" text-anchor="middle">${esc(d.tag)}</text>
  <text x="${at.x + 78}" y="${at.y + 18.5}" class="dev-name">${esc(fit(d.name, 22))}</text>
  <text x="${at.x + 8}" y="${at.y + 36}" class="meta">${esc(fit(d.manufacturer, 18))}</text>
  <text x="${at.x + W - 8}" y="${at.y + 36}" class="meta mono" text-anchor="end">${esc(fit(d.model, 16))}</text>
  <text x="${at.x + 8}" y="${at.y + HEADER_H + 12}" class="colhead">IN</text>
  <text x="${at.x + W - 8}" y="${at.y + HEADER_H + 12}" class="colhead" text-anchor="end">OUT</text>
  <path d="M ${mid} ${at.y + HEADER_H} V ${at.y + h}" class="rule"/>
  ${ins.map((p, i) => row(p, i, "in")).join("")}
  ${outs.map((p, i) => row(p, i, "out")).join("")}
</g>`;
}

function simpleNodeSvg(n: Node, at: { x: number; y: number }) {
  const { w, h } = nodeSize(n);
  const data = n.data as Record<string, unknown>;

  if (n.type === "memo") {
    return `<g><rect x="${at.x}" y="${at.y}" width="${w}" height="${h}" rx="8" fill="${safeColor(data.color, "#fef08a")}"/>
    <foreignObject x="${at.x + 8}" y="${at.y + 6}" width="${w - 16}" height="${h - 12}">
      <div xmlns="http://www.w3.org/1999/xhtml" class="memo">${esc(data.text)}</div>
    </foreignObject></g>`;
  }
  if (n.type === "text") {
    return `<text x="${at.x}" y="${at.y + 14}" class="freetext" fill="${safeColor(data.color, "#0f172a")}"
      style="font-size:${Number(data.fontSize) || 14}px">${esc(data.text)}</text>`;
  }
  if (
    n.type === "image" &&
    typeof data.src === "string" &&
    /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,[a-z0-9+/]+={0,2}$/i.test(data.src)
  ) {
    return `<image x="${at.x}" y="${at.y}" width="${w}" height="${h}" href="${esc(data.src)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  if (n.type === "drawing") {
    const pts = (data.points as { x: number; y: number }[]) ?? [];
    const dPath = pts
      .map((p, i) => `${i ? "L" : "M"} ${at.x + finite(p.x, 0)} ${at.y + finite(p.y, 0)}`)
      .join(" ");
    return `<path d="${dPath}" fill="none" stroke="${safeColor(data.color, "#dc2626")}"
      stroke-width="${Number(data.strokeWidth) || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (n.type === "shape") {
    const shapes = {
      rectangle: '<rect x="2" y="2" width="96" height="96" rx="6"/>',
      ellipse: '<ellipse cx="50" cy="50" rx="48" ry="48"/>',
      diamond: '<polygon points="50,2 98,50 50,98 2,50"/>',
      triangle: '<polygon points="50,2 98,98 2,98"/>',
    };
    const shape = Object.hasOwn(shapes, String(data.shape))
      ? shapes[data.shape as keyof typeof shapes] : shapes.rectangle;
    return `<g data-id="${esc(n.id)}">
      <svg x="${at.x}" y="${at.y}" width="${w}" height="${h}" viewBox="0 0 100 100" preserveAspectRatio="none"
        fill="var(--card)" fill-opacity=".6" stroke="${safeColor(data.color, "#64748b")}" stroke-width="1.4">${shape}</svg>
      <foreignObject x="${at.x + 8}" y="${at.y}" width="${w - 16}" height="${h}">
        <div xmlns="http://www.w3.org/1999/xhtml" class="shape-text">${esc(data.text)}</div>
      </foreignObject></g>`;
  }
  if (n.type === "icon-text") {
    const name = typeof data.icon === "string" ? data.icon : "";
    const icon = name ? getIcon(name) : null;
    const drawing = icon ? buildIcon(icon) : null;
    // Icon library markup stays inside an SVG image resource.
    const src = drawing && "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(drawing.attributes.viewBox)}" color="#64748b">${drawing.body}</svg>`,
    );
    return `<g data-id="${esc(n.id)}">
      <title>${esc(name)}</title>
      ${src
        ? `<image x="${at.x + w / 2 - 14}" y="${at.y + 10}" width="28" height="28" href="${esc(src)}"/>`
        : `<text x="${at.x + w / 2}" y="${at.y + 31}" text-anchor="middle" class="dev-name">${esc(name)}</text>`}
      <foreignObject x="${at.x}" y="${at.y + 40}" width="${w}" height="${Math.max(18, h - 40)}">
        <div xmlns="http://www.w3.org/1999/xhtml" class="annotation">${esc(data.label)}</div>
      </foreignObject></g>`;
  }
  if (n.type === "rack") {
    const rack = n.data as unknown as RackNodeData;
    const units = rackUnits(rack.units);
    const unitHeight = Math.max(1, (h - 32) / units);
    const slots = Array.from({ length: units }, (_, i) => {
      const y = at.y + 32 + i * unitHeight;
      return `<path class="rule" d="M ${at.x} ${y} h ${w}"/><text class="meta" x="${at.x + 5}" y="${y + 11}">${units - i}</text>`;
    }).join("");
    const items = (rack.items ?? []).map((item) => {
      const height = Math.max(1, finite(item.height, 1));
      const y = at.y + 32 + (units - finite(item.u, 1) - height + 1) * unitHeight;
      return `<g>
        <rect x="${at.x + 26}" y="${y}" width="${w - 26}" height="${height * unitHeight}" rx="2"
          fill="${safeColor(item.color, "#64748b")}" fill-opacity=".22"/>
        <text x="${at.x + 30}" y="${y + 11}" class="port">${esc(item.tag)} ${esc(item.label)}</text>
      </g>`;
    }).join("");
    return `<g data-id="${esc(n.id)}">
      <rect x="${at.x}" y="${at.y}" width="${w}" height="${h}" rx="8" class="device-body"/>
      <text x="${at.x + 8}" y="${at.y + 20}" class="dev-name">${esc(rack.tag)} ${esc(rack.name)}</text>
      ${slots}${items}</g>`;
  }
  if (n.type === "titleblock") {
    const title = n.data as Partial<TitleBlockData>;
    const fields = [
      title.company, title.address, title.cityStateZip, title.phone, title.website,
      title.client, title.project, title.projectNumber, title.title, title.description,
      title.projectManager, title.drawnBy, title.checkedBy, title.date, title.revised,
      title.rev, title.scale, title.page, title.notice,
    ];
    return `<g data-id="${esc(n.id)}">
      <rect x="${at.x}" y="${at.y}" width="${w}" height="${h}" class="device-body"/>
      <foreignObject x="${at.x + 8}" y="${at.y + 8}" width="${w - 16}" height="${h - 16}">
        <div xmlns="http://www.w3.org/1999/xhtml" class="sheet-fields">
          ${fields.filter(Boolean).map((value) => `<div>${esc(value)}</div>`).join("")}
        </div>
      </foreignObject></g>`;
  }
  const message = n.type === "image" ? t("Image could not be embedded.") : t("Unsupported drawing object.");
  return `<g data-id="${esc(n.id)}">
    <rect x="${at.x}" y="${at.y}" width="${w}" height="${h}" class="device-body"/>
    <foreignObject x="${at.x + 4}" y="${at.y + 4}" width="${w - 8}" height="${h - 8}">
      <div xmlns="http://www.w3.org/1999/xhtml" class="annotation">${esc(message)}</div>
    </foreignObject></g>`;
}

/* --------------------------------------------------------------- cables */

function edgeAnchor(node: Node, handle: string | null | undefined, output: boolean, ctx: Ctx) {
  const at = ctx.absolute(node);
  const { w, h } = nodeSize(node);
  if (node.type === "database") {
    const i = portIndex(deviceOf(node).ports ?? [], handle, output ? "out" : "in");
    if (i === -1) return null;
    return { x: at.x + (output ? w : 0), y: at.y + portY(i), side: output ? Position.Right : Position.Left };
  }
  const side = Object.values(Position).find((value) => handle === value || handle?.startsWith(value + "-"))
    ?? (output ? Position.Right : Position.Left);
  switch (side) {
    case Position.Left: return { x: at.x, y: at.y + h / 2, side };
    case Position.Right: return { x: at.x + w, y: at.y + h / 2, side };
    case Position.Top: return { x: at.x + w / 2, y: at.y, side };
    case Position.Bottom: return { x: at.x + w / 2, y: at.y + h, side };
  }
}

function fallbackEdge(
  edge: Edge,
  source: Node,
  target: Node,
  isCable: boolean,
  ctx: Ctx,
): RenderedEdge | null {
  const from = edgeAnchor(source, edge.sourceHandle, true, ctx);
  const to = edgeAnchor(target, edge.targetHandle, false, ctx);
  if (!from || !to) return null;
  const data = edge.data ?? {};
  if (isCable) {
    const { points } = avoidObstacles(
      from, to, from.side, to.side, ctx.obstacles,
      finite(data.midX), finite(data.midY), finite(data.lane, 0),
    );
    const mid = midpointOf(points);
    const x = Math.min(...points.map((point) => point.x));
    const y = Math.min(...points.map((point) => point.y));
    return {
      path: roundedPath(points),
      bounds: {
        x, y,
        width: Math.max(...points.map((point) => point.x)) - x,
        height: Math.max(...points.map((point) => point.y)) - y,
      },
      label: { x: mid.x, y: mid.y - 13 },
    };
  }
  const [path, x, y] = getSmoothStepPath({
    sourceX: from.x, sourceY: from.y, sourcePosition: from.side,
    targetX: to.x, targetY: to.y, targetPosition: to.side, borderRadius: 8,
  });
  return {
    path,
    bounds: {
      x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
      width: Math.abs(from.x - to.x), height: Math.abs(from.y - to.y),
    },
    label: { x, y },
  };
}

function cableSvg(edge: Edge, ctx: Ctx) {
  const source = ctx.nodes.find((node) => node.id === edge.source);
  const target = ctx.nodes.find((node) => node.id === edge.target);
  if (!source || !target) return null;
  const isCable = source.type === "database" || target.type === "database";
  const geometry = ctx.renderedEdges.get(edge.id) ?? fallbackEdge(edge, source, target, isCable, ctx);
  if (!geometry) return null;

  const port = source.type === "database"
    ? deviceOf(source).ports?.find((p) => p.id === edge.sourceHandle)
    : undefined;
  const definition = findSignal(ctx.signals, port?.signal);
  const signal = isCable ? definition.key : "";
  const marker = isCable ? ctx.signals.indexOf(definition) : "generic";
  const color = isCable ? definition.color : "var(--muted)";
  const directions = arrowMarkers(isCable ? "forward" : edge.data?.direction as ArrowDirection, color);
  const markerAttributes = [
    directions.markerStart && `marker-start="url(#arrow-${marker})"`,
    directions.markerEnd && `marker-end="url(#arrow-${marker})"`,
  ].filter(Boolean).join(" ");

  const label = String(edge.data?.label ?? "").trim();
  const mid = geometry.label ?? geometry.bounds;
  const labelX = finite(mid.x, 0);
  const labelY = finite(mid.y, 0);
  const labelWidth = label.length * 11 + 10;
  const path = esc(geometry.path);
  return {
    bounds: geometry.bounds,
    labelBounds: label ? { x: labelX - labelWidth / 2, y: labelY - 8, width: labelWidth, height: 16 } : undefined,
    svg: `<g class="cable" data-id="${esc(edge.id)}" data-signal="${esc(signal)}">
  <path d="${path}" fill="none" stroke="${color}" stroke-width="2" ${markerAttributes}/>
  <path d="${path}" fill="none" stroke="transparent" stroke-width="14" class="hit"/>
  ${label
    ? `<g class="cable-label"><rect x="${labelX - labelWidth / 2}" y="${labelY - 8}"
        width="${labelWidth}" height="16" rx="4" class="chip"/>
      <text x="${labelX}" y="${labelY + 3}" text-anchor="middle" class="cable-text">${esc(label)}</text></g>`
    : ""}
</g>`,
  };
}

/* ----------------------------------------------------------- room plan */

function roomPlanSvg(room: RoomSpec, items: RoomItem[]) {
  const S = 90; // pixels per metre
  const pad = 40;
  const width = finite(room.width, 0);
  const depth = finite(room.depth, 0);
  const w = width * S;
  const d = depth * S;
  const gridStep = Math.max(1, Math.ceil(Math.max(width, depth) / 100));

  const grid: string[] = [];
  for (let x = 1; x < width; x += gridStep) {
    grid.push(
      `<line x1="${pad + x * S}" y1="${pad}" x2="${pad + x * S}" y2="${pad + d}" class="grid"/>`,
    );
  }
  for (let z = 1; z < depth; z += gridStep) {
    grid.push(
      `<line x1="${pad}" y1="${pad + z * S}" x2="${pad + w}" y2="${pad + z * S}" class="grid"/>`,
    );
  }

  const shapes = items
    .slice()
    // Big flat things first so small devices stay clickable on top.
    .sort((a, b) => b.size.w * b.size.d - a.size.w * a.size.d)
    .map((item) => {
      const iw = item.size.w * S;
      const id = item.size.d * S;
      const cx = pad + item.position.x * S;
      const cy = pad + item.position.z * S;
      const wall = item.mount === "wall" || item.mount === "ceiling";
      return `<g class="plan-item" data-id="${esc(item.id)}" tabindex="0"
        transform="rotate(${finite(item.rotation, 0)} ${cx} ${cy})">
    <rect x="${cx - iw / 2}" y="${cy - id / 2}" width="${iw}" height="${id}" rx="3"
          fill="${safeColor(item.color, "#94a3b8")}" fill-opacity="${wall ? 0.95 : 0.75}"
          stroke="${wall ? "#0071e3" : "rgba(0,0,0,.35)"}" stroke-width="${wall ? 1.6 : 1}"/>
    <title>${esc(item.label)}${item.tag ? ` (${esc(item.tag)})` : ""} — ${esc(item.mount)} @ ${finite(item.position.y, 0).toFixed(2)}m</title>
  </g>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${w + pad * 2} ${d + pad * 2}" class="plan" xmlns="http://www.w3.org/2000/svg">
  <rect x="${pad}" y="${pad}" width="${w}" height="${d}" class="floor"/>
  ${grid.join("")}
  <rect x="${pad}" y="${pad}" width="${w}" height="${d}" class="walls"/>
  ${shapes}
  <text x="${pad + w / 2}" y="${pad - 14}" text-anchor="middle" class="plan-dim">${width} m</text>
  <text x="${pad - 14}" y="${pad + d / 2}" text-anchor="middle" class="plan-dim"
        transform="rotate(-90 ${pad - 14} ${pad + d / 2})">${depth} m</text>
</svg>`;
}

/* -------------------------------------------------------------- schedules */

function scheduleRows(nodes: Node[], edges: Edge[]) {
  const devices = nodes.filter((n) => n.type === "database");
  const byId = new Map(devices.map((n) => [n.id, deviceOf(n)]));

  const deviceRows = devices.map((n) => {
    const d = deviceOf(n);
    const ports = d.ports ?? [];
    return {
      id: n.id,
      tag: d.tag ?? "",
      name: d.name ?? "",
      manufacturer: d.manufacturer ?? "",
      model: d.model ?? "",
      inputs: ports.filter((p) => p.dir === "in").length,
      outputs: ports.filter((p) => p.dir === "out").length,
      ports: ports.map((p) => ({
        label: p.label,
        dir: p.dir,
        connector: p.connector,
        signal: p.signal,
      })),
    };
  });

  const cableRows = edges.flatMap((e) => {
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to) return [];
    const fp = (from.ports ?? []).find((p) => p.id === e.sourceHandle);
    const tp = (to.ports ?? []).find((p) => p.id === e.targetHandle);
    return [
      {
        id: e.id,
        label: ((e.data as { label?: string })?.label ?? "").trim(),
        signal: fp?.signal ?? "audio",
        fromTag: from.tag ?? "",
        fromPort: fp?.label ?? "",
        fromConn: fp?.connector ?? "",
        toTag: to.tag ?? "",
        toPort: tp?.label ?? "",
        toConn: tp?.connector ?? "",
      },
    ];
  });

  const bom = new Map<
    string,
    { qty: number; mfr: string; model: string; desc: string }
  >();
  for (const d of deviceRows) {
    const key = `${d.manufacturer}|${d.model || d.name}`;
    const row = bom.get(key);
    if (row) row.qty += 1;
    else
      bom.set(key, {
        qty: 1,
        mfr: d.manufacturer,
        model: d.model,
        desc: d.name,
      });
  }

  return { deviceRows, cableRows, bomRows: [...bom.values()] };
}

/* ------------------------------------------------------------------ main */

export function buildViewerHtml({
  nodes,
  edges,
  room,
  roomItems: projectRoomItems,
  signals: projectSignals = DEFAULT_SIGNALS,
  renderedEdges = new Map(),
  absolute: getAbsolute,
}: {
  nodes: Node[];
  edges: Edge[];
  room: RoomSpec;
  roomItems: RoomItem[];
  signals?: SignalDef[];
  renderedEdges?: ReadonlyMap<string, RenderedEdge>;
  absolute: (n: Node) => { x: number; y: number };
}) {
  const validSignals = projectSignals.filter((signal) => typeof signal?.key === "string");
  const signals = (validSignals.length ? validSignals : DEFAULT_SIGNALS)
    .map((signal) => ({ ...signal, color: safeColor(signal.color, "#64748b") }));
  const roomItems = projectRoomItems.map((item) => ({
    ...item,
    color: safeColor(item.color, "#94a3b8"),
  }));
  const absolute = (node: Node) => {
    const { x, y } = getAbsolute(node);
    return { x: finite(x, 0), y: finite(y, 0) };
  };
  const zones = nodes.filter((n) => n.type === "zone");
  const devices = nodes.filter((n) => n.type === "database");
  const others = nodes.filter((n) => !["zone", "database"].includes(n.type ?? ""));
  // The first title block also identifies the document in the viewer header.
  const titleNode = nodes.find((n) => n.type === "titleblock");
  const title = (titleNode?.data ?? {}) as Partial<TitleBlockData>;
  const obstacles = devices.map((n) => ({ ...absolute(n), ...nodeSize(n) }));
  const ctx: Ctx = { nodes, absolute, signals, renderedEdges, obstacles };
  const cables = edges.map((edge) => cableSvg(edge, ctx)).filter((edge) => edge !== null);

  const parts = nodes.map((node) => {
    const { w, h } = nodeSize(node);
    return { ...absolute(node), width: w, height: h };
  });
  for (const cable of cables) {
    parts.push(cable.bounds);
    if (cable.labelBounds) parts.push(cable.labelBounds);
  }
  if (!parts.length) parts.push({ x: 0, y: 0, width: 800, height: 600 });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const part of parts) {
    minX = Math.min(minX, part.x);
    minY = Math.min(minY, part.y);
    maxX = Math.max(maxX, part.x + part.width);
    maxY = Math.max(maxY, part.y + part.height);
  }
  const margin = 60;
  const viewBox = `${minX - margin} ${minY - margin} ${maxX - minX + margin * 2} ${maxY - minY + margin * 2}`;

  const marker = (id: number | string, color: string) =>
    `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"
      markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
  const markers = signals.map((signal, index) => marker(index, signal.color)).join("")
    + marker("generic", "var(--muted)");

  const { deviceRows, cableRows, bomRows } = scheduleRows(nodes, edges);

  const schematic = `<svg id="schematic" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
  <defs>${markers}</defs>
  <g id="scene">
    ${zones.map((n) => zoneSvg(n, absolute(n))).join("\n")}
    ${others.map((n) => simpleNodeSvg(n, absolute(n))).join("\n")}
    ${cables.map((c) => c.svg).join("\n")}
    ${devices.map((n) => deviceSvg(n, absolute(n), signals)).join("\n")}
  </g>
</svg>`;

  const legend = signals
    .map(
      (
        s,
      ) => `<label class="sig"><input type="checkbox" checked data-signal="${esc(s.key)}">
      <span class="dot" style="background:${s.color}"></span>${esc(s.label)}</label>`,
    )
    .join("");

  const meta = [
    ["Client", title.client],
    ["Project", title.project],
    ["Project No.", title.projectNumber],
    ["Rev", title.rev],
    ["Date", title.date],
    ["Drawn by", title.drawnBy],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${esc(t(k ?? ""))}</dt><dd>${esc(v)}</dd></div>`)
    .join("");

  const table = (head: string[], rows: string[][], id: string) =>
    `<table id="${id}"><thead><tr>${head.map((h) => `<th>${esc(t(h))}</th>`).join("")}</tr></thead>
     <tbody>${rows
       .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
       .join("")}</tbody></table>`;

  return `<!doctype html>
<html lang="${getLocale()}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title.title || "AV System Schematic")}${title.project ? ` — ${esc(title.project)}` : ""}</title>
<style>
  :root{
    --bg:#f5f5f7; --fg:#1d1d1f; --muted:#6e6e73; --card:#fff; --line:rgba(0,0,0,.11);
    --accent:#0071e3; --chip:rgba(255,255,255,.85);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang TC",system-ui,sans-serif;
  }
  html[data-theme="dark"]{
    --bg:#1c1c1e; --fg:#f5f5f7; --muted:#98989d; --card:#2a2a2d; --line:rgba(255,255,255,.14);
    --accent:#0a84ff; --chip:rgba(40,40,44,.9);
  }
  *{box-sizing:border-box}
  html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased}
  body{display:flex;flex-direction:column;overflow:hidden}

  header{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--card)}
  header h1{font-size:14px;margin:0;font-weight:650;letter-spacing:-.01em}
  header .sub{font-size:11px;color:var(--muted)}
  header dl{display:flex;gap:14px;margin:0 0 0 auto;flex-wrap:wrap}
  header dl div{display:flex;gap:5px;align-items:baseline}
  header dt{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  header dd{margin:0;font-size:11px;font-weight:550}

  nav{display:flex;gap:2px;padding:6px 12px;border-bottom:1px solid var(--line);background:var(--card);align-items:center}
  nav button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:12px;
    padding:5px 12px;border-radius:7px;cursor:pointer}
  nav button:hover{background:rgba(127,127,127,.12);color:var(--fg)}
  nav button.on{background:var(--accent);color:#fff}
  nav .spacer{flex:1}
  .tool{border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-size:11px;
    padding:4px 9px;border-radius:7px;cursor:pointer}
  .tool:hover{border-color:var(--accent)}
  #search{border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-size:11px;
    padding:4px 9px;border-radius:7px;width:150px}

  main{flex:1;position:relative;overflow:hidden}
  .tab{position:absolute;inset:0;display:none}
  .tab.on{display:block}

  #stage{width:100%;height:100%;cursor:grab;overflow:hidden}
  .export-warning{position:absolute;top:10px;left:12px;padding:6px;background:var(--card);font-size:12px}
  #stage.grabbing{cursor:grabbing}
  #schematic{width:100%;height:100%;display:block;touch-action:none}

  .device-body{fill:var(--card);stroke:var(--line);stroke-width:1.5}
  .device.sel .device-body{stroke:var(--accent);stroke-width:2.5}
  .device.dim{opacity:.22}
  .device{cursor:pointer}
  .rule{stroke:var(--line);stroke-width:1}
  .tagbox{fill:rgba(127,127,127,.14);stroke:var(--line)}
  .tag{font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;fill:var(--fg)}
  .dev-name{font-size:12px;font-weight:600;fill:var(--fg)}
  .meta{font-size:9px;fill:var(--muted);text-transform:uppercase}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:none}
  .colhead{font-size:9px;font-weight:600;fill:var(--muted);letter-spacing:.08em}
  .port{font-size:11px;fill:var(--fg)}
  .conn{font:9px ui-monospace,SFMono-Regular,Menlo,monospace;fill:var(--muted)}
  .zone-label{font-size:11px;font-weight:600}
  .annotation,.shape-text,.sheet-fields{font-size:11px;color:var(--fg);white-space:pre-wrap;overflow-wrap:anywhere}
  .annotation,.shape-text{text-align:center}
  .shape-text{height:100%;display:grid;place-items:center}
  .sheet-fields div{padding:3px 0;border-bottom:1px solid var(--line)}
  .memo{font-size:12px;color:#111;white-space:pre-wrap}
  .freetext{font-family:inherit}
  .cable .hit{cursor:pointer}
  .cable.dim{opacity:.12}
  .cable.hi path:first-child{stroke-width:3.5}
  .chip{fill:var(--chip);stroke:var(--line)}
  .cable-text{font:9px ui-monospace,SFMono-Regular,Menlo,monospace;fill:var(--fg)}

  aside{position:absolute;top:12px;right:12px;width:250px;max-height:calc(100% - 24px);overflow:auto;
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;
    box-shadow:0 8px 28px rgba(0,0,0,.10);font-size:12px;display:none}
  aside.on{display:block}
  aside h2{margin:0;font-size:13px}
  aside .tagline{font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);margin-bottom:8px}
  aside table{width:100%;border-collapse:collapse;font-size:11px}
  aside th{text-align:left;font-weight:600;color:var(--muted);font-size:9px;text-transform:uppercase;
    letter-spacing:.07em;padding:6px 0 2px}
  aside td{padding:2px 0;border-bottom:1px solid var(--line)}
  aside .sw{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  aside .close{float:right;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:15px;line-height:1}

  .legend{position:absolute;left:12px;bottom:12px;display:flex;gap:10px;align-items:center;
    background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:11px}
  .sig{display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--muted)}
  .sig input{accent-color:var(--accent);margin:0}
  .dot{width:9px;height:9px;border-radius:2px;display:inline-block}
  .hint{position:absolute;left:12px;top:12px;background:var(--card);border:1px solid var(--line);
    border-radius:9px;padding:5px 9px;font-size:10px;color:var(--muted)}

  .sheet{height:100%;overflow:auto;padding:16px}
  .sheet h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:18px 0 6px}
  .sheet h2:first-child{margin-top:0}
  table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);
    border-radius:10px;overflow:hidden;font-size:11.5px}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
  th{background:rgba(127,127,127,.07);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  tbody tr:last-child td{border-bottom:0}
  tbody tr:hover{background:rgba(127,127,127,.06)}

  .planwrap{height:100%;display:flex;align-items:center;justify-content:center;padding:24px;gap:16px}
  .plan{max-height:100%;max-width:100%}
  .floor{fill:rgba(127,127,127,.10)}
  .walls{fill:none;stroke:var(--fg);stroke-opacity:.5;stroke-width:2.5}
  .grid{stroke:var(--fg);stroke-opacity:.10}
  .plan-item{cursor:pointer}
  .plan-item:hover rect{stroke:var(--accent);stroke-width:2.4}
  .plan-item.sel rect{stroke:var(--accent);stroke-width:3}
  .plan-dim{font-size:11px;fill:var(--muted)}
  .planlist{width:230px;max-height:100%;overflow:auto;background:var(--card);border:1px solid var(--line);
    border-radius:12px;padding:10px;font-size:12px}
  .planlist button{display:flex;width:100%;gap:8px;align-items:center;border:0;background:transparent;
    color:var(--fg);font:inherit;font-size:11.5px;padding:4px 6px;border-radius:6px;cursor:pointer;text-align:left}
  .planlist button:hover{background:rgba(127,127,127,.12)}
  .planlist button.on{background:var(--accent);color:#fff}
  .planlist .grp{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);padding:8px 6px 2px}
  .planlist .mt{margin-left:auto;font-size:9px;opacity:.65}
  .empty{color:var(--muted);font-size:12px;padding:20px;text-align:center}
</style>
</head>
<body>
<header>
  <div>
    <h1>${esc(title.title || "AV System Schematic")}</h1>
    <div class="sub">${esc(title.company || "")}${title.description ? " · " + esc(title.description) : ""}</div>
  </div>
  <dl>${meta}</dl>
</header>

<nav>
  <button data-tab="schematic" class="on">${esc(t("Schematic"))}</button>
  <button data-tab="room">${esc(t("Room plan"))}</button>
  <button data-tab="schedules">${esc(t("Schedules"))}</button>
  <span class="spacer"></span>
  <input id="search" type="search" placeholder="${esc(t("Find a device…"))}">
  <button class="tool" id="fit">${esc(t("Fit"))}</button>
  <button class="tool" id="themer">${esc(t("Dark"))}</button>
</nav>

<main>
  <section class="tab on" id="tab-schematic">
    <div id="stage">${schematic}</div>
    <div class="hint">${esc(t("Drag to pan \u00b7 scroll to zoom \u00b7 click a device or cable"))}</div>
    <div class="legend">${legend}</div>
    ${cables.length < edges.length
      ? `<div class="export-warning" role="status">${esc(t("Some connections could not be drawn. Check their endpoints in the project."))}</div>`
      : ""}
    <aside id="panel"></aside>
  </section>

  <section class="tab" id="tab-room">
    ${
      roomItems.length
        ? `<div class="planwrap">${roomPlanSvg(room, roomItems)}<div class="planlist" id="planlist"></div></div>`
        : `<div class="empty">${esc(t("No room layout in this drawing."))}</div>`
    }
  </section>

  <section class="tab" id="tab-schedules">
    <div class="sheet">
      <h2>${esc(t("Bill of materials"))}</h2>
      ${table(
        ["Qty", "Manufacturer", "Model", "Description"],
        bomRows.map((r) => [String(r.qty), r.mfr, r.model, r.desc]),
        "t-bom",
      )}
      <h2>${esc(t("Devices"))}</h2>
      ${table(
        ["Tag", "Description", "Manufacturer", "Model", "In", "Out"],
        deviceRows.map((r) => [
          r.tag,
          r.name,
          r.manufacturer,
          r.model,
          String(r.inputs),
          String(r.outputs),
        ]),
        "t-dev",
      )}
      <h2>${esc(t("Cable schedule"))}</h2>
      ${table(
        ["Cable", "Signal", "From", "Port", "Conn.", "To", "Port", "Conn."],
        cableRows.map((r) => [
          r.label,
          findSignal(signals, r.signal).label,
          r.fromTag,
          r.fromPort,
          r.fromConn,
          r.toTag,
          r.toPort,
          r.toConn,
        ]),
        "t-cab",
      )}
    </div>
  </section>
</main>

<script>
(function(){
  "use strict";
  var DEVICES = ${json(deviceRows)};
  var CABLES  = ${json(cableRows)};
  var ITEMS   = ${json(roomItems)};
  var SIGNALS = new Map(${json(signals.map((s) => [s.key, s]))});

  var byId = Object.create(null);
  DEVICES.forEach(function(d){ byId[d.id] = d; });

  /* ---- tabs ---- */
  document.querySelectorAll("nav button[data-tab]").forEach(function(b){
    b.onclick = function(){
      document.querySelectorAll("nav button[data-tab]").forEach(function(x){ x.classList.remove("on"); });
      document.querySelectorAll(".tab").forEach(function(x){ x.classList.remove("on"); });
      b.classList.add("on");
      document.getElementById("tab-" + b.dataset.tab).classList.add("on");
    };
  });

  /* ---- theme ---- */
  var themer = document.getElementById("themer");
  themer.onclick = function(){
    var dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    themer.textContent = dark ? ${json(t("Dark"))} : ${json(t("Light"))};
  };

  /* ---- pan & zoom ---- */
  var svg = document.getElementById("schematic");
  var stage = document.getElementById("stage");
  var vb = svg.getAttribute("viewBox").split(" ").map(Number);
  var home = vb.slice();
  var view = vb.slice();
  function apply(){ svg.setAttribute("viewBox", view.join(" ")); }

  stage.addEventListener("wheel", function(e){
    e.preventDefault();
    var r = svg.getBoundingClientRect();
    var mx = view[0] + (e.clientX - r.left) / r.width * view[2];
    var my = view[1] + (e.clientY - r.top) / r.height * view[3];
    var k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    var nw = Math.min(Math.max(view[2] * k, home[2] / 40), home[2] * 6);
    var nh = nw * (view[3] / view[2]);
    view[0] = mx - (mx - view[0]) * (nw / view[2]);
    view[1] = my - (my - view[1]) * (nh / view[3]);
    view[2] = nw; view[3] = nh;
    apply();
  }, { passive: false });

  var drag = null;
  stage.addEventListener("pointerdown", function(e){
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, v: view.slice() };
    stage.classList.add("grabbing");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", function(e){
    if (!drag) return;
    var r = svg.getBoundingClientRect();
    view[0] = drag.v[0] - (e.clientX - drag.x) / r.width * view[2];
    view[1] = drag.v[1] - (e.clientY - drag.y) / r.height * view[3];
    apply();
  });
  function endDrag(){ drag = null; stage.classList.remove("grabbing"); }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  document.getElementById("fit").onclick = function(){ view = home.slice(); apply(); };

  /* ---- selection ---- */
  var panel = document.getElementById("panel");
  function clearSel(){
    document.querySelectorAll(".device.sel, .cable.hi").forEach(function(n){
      n.classList.remove("sel"); n.classList.remove("hi");
    });
  }
  function closePanel(){ panel.classList.remove("on"); clearSel(); }

  function showDevice(id){
    var d = byId[id]; if (!d) return;
    clearSel();
    var g = document.querySelector('.device[data-id="' + CSS.escape(id) + '"]');
    if (g) g.classList.add("sel");

    var links = CABLES.filter(function(c){ return c.fromTag === d.tag || c.toTag === d.tag; });
    panel.innerHTML =
      '<button class="close" title="${esc(t("Close"))}">&times;</button>' +
      '<h2>' + escapeHtml(d.name) + '</h2>' +
      '<div class="tagline">' + escapeHtml(d.tag) + '</div>' +
      '<table><tr><th>${esc(t("Manufacturer"))}</th></tr><tr><td>' + (escapeHtml(d.manufacturer) || "—") + '</td></tr>' +
      '<tr><th>${esc(t("Model"))}</th></tr><tr><td>' + (escapeHtml(d.model) || "—") + '</td></tr></table>' +
      '<table><tr><th>${esc(t("Ports"))}</th></tr>' +
      d.ports.map(function(p){
        var c = (SIGNALS.get(p.signal) || {}).color || "#888";
        return '<tr><td><span class="sw" style="background:' + c + '"></span>' +
          escapeHtml(p.label) + ' <span style="opacity:.55">' + (p.dir === "in" ? ${json(t("In"))} : ${json(t("Out"))}) +
          (p.connector ? " · " + escapeHtml(p.connector) : "") + '</span></td></tr>';
      }).join("") + '</table>' +
      (links.length
        ? '<table><tr><th>${esc(t("Cables"))} (' + links.length + ')</th></tr>' +
          links.map(function(c){
            var other = c.fromTag === d.tag ? (c.toTag + "/" + c.toPort) : (c.fromTag + "/" + c.fromPort);
            var dir = c.fromTag === d.tag ? "→" : "←";
            return '<tr><td><b>' + (escapeHtml(c.label) || "—") + '</b> ' + dir + " " + escapeHtml(other) + '</td></tr>';
          }).join("") + '</table>'
        : "");
    panel.classList.add("on");
    panel.querySelector(".close").onclick = closePanel;
  }

  function showCable(id){
    var c = CABLES.filter(function(x){ return x.id === id; })[0]; if (!c) return;
    clearSel();
    var g = document.querySelector('.cable[data-id="' + CSS.escape(id) + '"]');
    if (g) g.classList.add("hi");
    var col = (SIGNALS.get(c.signal) || {}).color || "#888";
    panel.innerHTML =
      '<button class="close" title="${esc(t("Close"))}">&times;</button>' +
      '<h2>' + (escapeHtml(c.label) || ${json(t("Cable"))}) + '</h2>' +
      '<div class="tagline"><span class="sw" style="background:' + col + '"></span>' +
      escapeHtml((SIGNALS.get(c.signal) || {}).label || c.signal) + '</div>' +
      '<table><tr><th>${esc(t("From"))}</th></tr><tr><td>' + escapeHtml(c.fromTag) + " · " + escapeHtml(c.fromPort) +
      (c.fromConn ? ' <span style="opacity:.55">' + escapeHtml(c.fromConn) + "</span>" : "") + '</td></tr>' +
      '<tr><th>${esc(t("To"))}</th></tr><tr><td>' + escapeHtml(c.toTag) + " · " + escapeHtml(c.toPort) +
      (c.toConn ? ' <span style="opacity:.55">' + escapeHtml(c.toConn) + "</span>" : "") + '</td></tr></table>';
    panel.classList.add("on");
    panel.querySelector(".close").onclick = closePanel;
  }

  document.querySelectorAll(".device").forEach(function(g){
    g.onclick = function(e){ e.stopPropagation(); showDevice(g.dataset.id); };
  });
  document.querySelectorAll(".cable .hit").forEach(function(p){
    p.onclick = function(e){ e.stopPropagation(); showCable(p.parentNode.dataset.id); };
  });
  svg.addEventListener("click", function(e){ if (e.target === svg || e.target.id === "scene") closePanel(); });

  /* ---- signal filter ---- */
  document.querySelectorAll(".sig input").forEach(function(box){
    box.onchange = function(){
      var s = box.dataset.signal;
      document.querySelectorAll('.cable[data-signal="' + CSS.escape(s) + '"]').forEach(function(c){
        c.style.display = box.checked ? "" : "none";
      });
    };
  });

  /* ---- search ---- */
  document.getElementById("search").addEventListener("input", function(e){
    var q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".device").forEach(function(g){
      var d = byId[g.dataset.id];
      var hit = !q || (d && ((d.tag + " " + d.name + " " + d.manufacturer + " " + d.model).toLowerCase().indexOf(q) >= 0));
      g.classList.toggle("dim", !hit);
    });
  });

  /* ---- room plan ---- */
  var list = document.getElementById("planlist");
  if (list && ITEMS.length) {
    var DEV = ["tv","projector","screen","speaker","subwoofer","rack","camera","keypad"];
    function group(title, arr){
      if (!arr.length) return "";
      return '<div class="grp">' + title + "</div>" + arr.map(function(i){
        return '<button data-id="' + escapeHtml(i.id) + '">' +
          '<span class="sw" style="background:' + escapeHtml(i.color || "#94a3b8") + '"></span>' +
          escapeHtml(i.label) + '<span class="mt">' + escapeHtml(i.mount) + "</span></button>";
      }).join("");
    }
    list.innerHTML =
      group("Devices", ITEMS.filter(function(i){ return DEV.indexOf(i.kind) >= 0; })) +
      group("Furniture", ITEMS.filter(function(i){ return DEV.indexOf(i.kind) < 0; })) +
      '<div id="planinfo" style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;display:none"></div>';

    var info = document.getElementById("planinfo");
    function selectItem(id){
      var it = ITEMS.filter(function(x){ return x.id === id; })[0]; if (!it) return;
      list.querySelectorAll("button").forEach(function(b){ b.classList.toggle("on", b.dataset.id === id); });
      document.querySelectorAll(".plan-item").forEach(function(g){ g.classList.toggle("sel", g.dataset.id === id); });
      info.style.display = "block";
      info.innerHTML = "<b>" + escapeHtml(it.label) + "</b>" +
        (it.tag ? ' <span style="color:var(--accent);font-family:ui-monospace,Menlo,monospace">' + escapeHtml(it.tag) + "</span>" : "") +
        '<div style="color:var(--muted);font-size:11px;margin-top:4px">' +
        "Mount: " + escapeHtml(it.mount) + "<br>" +
        "Height: " + it.position.y.toFixed(2) + " m<br>" +
        "Position: " + it.position.x.toFixed(2) + ", " + it.position.z.toFixed(2) + " m<br>" +
        "Size: " + escapeHtml(it.size.w) + "×" + escapeHtml(it.size.h) + "×" + escapeHtml(it.size.d) + " m" +
        (it.note ? "<br><br>" + escapeHtml(it.note) : "") + "</div>";
    }
    list.querySelectorAll("button").forEach(function(b){ b.onclick = function(){ selectItem(b.dataset.id); }; });
    document.querySelectorAll(".plan-item").forEach(function(g){ g.onclick = function(){ selectItem(g.dataset.id); }; });
  }

  function escapeHtml(s){
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
})();
</script>
</body>
</html>`;
}
