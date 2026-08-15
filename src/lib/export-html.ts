import type { Edge, Node } from "@xyflow/react";

import { orthogonalRoute, roundedPath } from "./routing";
import { DEFAULT_SIGNALS, findSignal, signalColor, type SignalDef } from "./signal-types";
import type { RoomItem, RoomSpec } from "./room";
import type { AVDeviceData, DevicePort } from "@/components/nodes/av-device-node";
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

const portY = (index: number) => HEADER_H + COLHEAD_H + index * ROW_H + ROW_H / 2;

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
  edges: Edge[];
  absolute: (n: Node) => { x: number; y: number };
  signals: SignalDef[];
};

const deviceOf = (n: Node) => n.data as unknown as AVDeviceData;

function portIndex(ports: DevicePort[], id: unknown, dir: "in" | "out") {
  return ports.filter((p) => p.dir === dir).findIndex((p) => p.id === id);
}

/* ------------------------------------------------------------ svg parts */

function zoneSvg(n: Node, at: { x: number; y: number }) {
  const d = n.data as { name?: string; color?: string };
  const w = (typeof n.width === "number" ? n.width : 460) || 460;
  const h = (typeof n.height === "number" ? n.height : 320) || 320;
  const color = d.color ?? "#0071e3";
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

function deviceSvg(n: Node, at: { x: number; y: number }, signals: SignalDef[]) {
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
  const w = (typeof n.width === "number" ? n.width : 160) || 160;
  const h = (typeof n.height === "number" ? n.height : 40) || 40;
  const data = n.data as Record<string, unknown>;

  if (n.type === "memo") {
    return `<g><rect x="${at.x}" y="${at.y}" width="${w}" height="${h}" rx="8" fill="${esc(data.color ?? "#fef08a")}"/>
    <foreignObject x="${at.x + 8}" y="${at.y + 6}" width="${w - 16}" height="${h - 12}">
      <div xmlns="http://www.w3.org/1999/xhtml" class="memo">${esc(data.text)}</div>
    </foreignObject></g>`;
  }
  if (n.type === "text") {
    return `<text x="${at.x}" y="${at.y + 14}" class="freetext" fill="${esc(data.color ?? "#0f172a")}"
      style="font-size:${Number(data.fontSize) || 14}px">${esc(data.text)}</text>`;
  }
  if (n.type === "image" && typeof data.src === "string") {
    return `<image x="${at.x}" y="${at.y}" width="${w}" height="${h}" href="${esc(data.src)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  if (n.type === "drawing") {
    const pts = (data.points as { x: number; y: number }[]) ?? [];
    const dPath = pts.map((p, i) => `${i ? "L" : "M"} ${at.x + p.x} ${at.y + p.y}`).join(" ");
    return `<path d="${dPath}" fill="none" stroke="${esc(data.color ?? "#dc2626")}"
      stroke-width="${Number(data.strokeWidth) || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return "";
}

/* --------------------------------------------------------------- cables */

function cableSvg(edge: Edge, ctx: Ctx) {
  const source = ctx.nodes.find((n) => n.id === edge.source);
  const target = ctx.nodes.find((n) => n.id === edge.target);
  if (!source || !target) return null;

  const sd = deviceOf(source);
  const td = deviceOf(target);
  const si = portIndex(sd.ports ?? [], edge.sourceHandle, "out");
  const ti = portIndex(td.ports ?? [], edge.targetHandle, "in");
  if (si < 0 || ti < 0) return null;

  const sAt = ctx.absolute(source);
  const tAt = ctx.absolute(target);
  const from = { x: sAt.x + W, y: sAt.y + portY(si) };
  const to = { x: tAt.x, y: tAt.y + portY(ti) };

  const data = (edge.data ?? {}) as { midX?: number; midY?: number; lane?: number; label?: string };
  const route = orthogonalRoute(from, to, "right", "left", data.midX, data.midY, data.lane ?? 0);
  const port = (sd.ports ?? []).filter((p) => p.dir === "out")[si];
  const signal = findSignal(ctx.signals, port?.signal).key;
  const color = signalColor(ctx.signals, signal);

  const mid = route.points[Math.floor(route.points.length / 2)] ?? from;
  const label = (data.label ?? "").trim();

  return {
    signal,
    svg: `<g class="cable" data-id="${esc(edge.id)}" data-signal="${signal}">
  <path d="${roundedPath(route.points)}" fill="none" stroke="${color}" stroke-width="2"
        marker-end="url(#arrow-${signal})"/>
  <path d="${roundedPath(route.points)}" fill="none" stroke="transparent" stroke-width="14" class="hit"/>
  ${label ? `<g class="cable-label"><rect x="${mid.x - label.length * 3.2 - 5}" y="${mid.y - 20}"
        width="${label.length * 6.4 + 10}" height="14" rx="4" class="chip"/>
  <text x="${mid.x}" y="${mid.y - 10}" text-anchor="middle" class="cable-text">${esc(label)}</text></g>` : ""}
</g>`,
  };
}

/* ----------------------------------------------------------- room plan */

function roomPlanSvg(room: RoomSpec, items: RoomItem[]) {
  const S = 90; // pixels per metre
  const pad = 40;
  const w = room.width * S;
  const d = room.depth * S;

  const grid: string[] = [];
  for (let x = 1; x < room.width; x++) {
    grid.push(`<line x1="${pad + x * S}" y1="${pad}" x2="${pad + x * S}" y2="${pad + d}" class="grid"/>`);
  }
  for (let z = 1; z < room.depth; z++) {
    grid.push(`<line x1="${pad}" y1="${pad + z * S}" x2="${pad + w}" y2="${pad + z * S}" class="grid"/>`);
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
        transform="rotate(${item.rotation} ${cx} ${cy})">
    <rect x="${cx - iw / 2}" y="${cy - id / 2}" width="${iw}" height="${id}" rx="3"
          fill="${esc(item.color ?? "#94a3b8")}" fill-opacity="${wall ? 0.95 : 0.75}"
          stroke="${wall ? "#0071e3" : "rgba(0,0,0,.35)"}" stroke-width="${wall ? 1.6 : 1}"/>
    <title>${esc(item.label)}${item.tag ? ` (${esc(item.tag)})` : ""} — ${esc(item.mount)} @ ${item.position.y.toFixed(2)}m</title>
  </g>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${w + pad * 2} ${d + pad * 2}" class="plan" xmlns="http://www.w3.org/2000/svg">
  <rect x="${pad}" y="${pad}" width="${w}" height="${d}" class="floor"/>
  ${grid.join("")}
  <rect x="${pad}" y="${pad}" width="${w}" height="${d}" class="walls"/>
  ${shapes}
  <text x="${pad + w / 2}" y="${pad - 14}" text-anchor="middle" class="plan-dim">${room.width} m</text>
  <text x="${pad - 14}" y="${pad + d / 2}" text-anchor="middle" class="plan-dim"
        transform="rotate(-90 ${pad - 14} ${pad + d / 2})">${room.depth} m</text>
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
    return [{
      id: e.id,
      label: ((e.data as { label?: string })?.label ?? "").trim(),
      signal: fp?.signal ?? "audio",
      fromTag: from.tag ?? "",
      fromPort: fp?.label ?? "",
      fromConn: fp?.connector ?? "",
      toTag: to.tag ?? "",
      toPort: tp?.label ?? "",
      toConn: tp?.connector ?? "",
    }];
  });

  const bom = new Map<string, { qty: number; mfr: string; model: string; desc: string }>();
  for (const d of deviceRows) {
    const key = `${d.manufacturer}|${d.model || d.name}`;
    const row = bom.get(key);
    if (row) row.qty += 1;
    else bom.set(key, { qty: 1, mfr: d.manufacturer, model: d.model, desc: d.name });
  }

  return { deviceRows, cableRows, bomRows: [...bom.values()] };
}

/* ------------------------------------------------------------------ main */

export function buildViewerHtml({
  nodes,
  edges,
  room,
  roomItems,
  signals = DEFAULT_SIGNALS,
  absolute,
}: {
  nodes: Node[];
  edges: Edge[];
  room: RoomSpec;
  roomItems: RoomItem[];
  signals?: SignalDef[];
  absolute: (n: Node) => { x: number; y: number };
}) {
  const ctx: Ctx = { nodes, edges, absolute, signals };

  const zones = nodes.filter((n) => n.type === "zone");
  const devices = nodes.filter((n) => n.type === "database");
  const others = nodes.filter(
    (n) => !["zone", "database", "titleblock"].includes(n.type ?? ""),
  );
  const titleNode = nodes.find((n) => n.type === "titleblock");
  const title = (titleNode?.data ?? {}) as Partial<TitleBlockData>;

  // Bounds across everything we are going to draw.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of [...zones, ...devices, ...others]) {
    const at = absolute(n);
    const w = n.type === "database" ? W : (typeof n.width === "number" ? n.width : 160) || 160;
    const h =
      n.type === "database"
        ? deviceHeight(deviceOf(n))
        : (typeof n.height === "number" ? n.height : 40) || 40;
    minX = Math.min(minX, at.x); minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x + w); maxY = Math.max(maxY, at.y + h);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  const M = 60;
  const viewBox = `${minX - M} ${minY - M} ${maxX - minX + M * 2} ${maxY - minY + M * 2}`;

  const cables = edges.map((e) => cableSvg(e, ctx)).filter(Boolean) as {
    signal: string; svg: string;
  }[];

  const markers = signals
    .map(
      (s) => `<marker id="arrow-${s.key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"
      markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${s.color}"/></marker>`,
    )
    .join("");

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
      (s) => `<label class="sig"><input type="checkbox" checked data-signal="${s.key}">
      <span class="dot" style="background:${s.color}"></span>${s.label}</label>`,
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
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("");

  const table = (head: string[], rows: string[][], id: string) =>
    `<table id="${id}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
     <tbody>${rows
       .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
       .join("")}</tbody></table>`;

  return `<!doctype html>
<html lang="en" data-theme="light">
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
  <button data-tab="schematic" class="on">Schematic</button>
  <button data-tab="room">Room plan</button>
  <button data-tab="schedules">Schedules</button>
  <span class="spacer"></span>
  <input id="search" type="search" placeholder="Find a device…">
  <button class="tool" id="fit">Fit</button>
  <button class="tool" id="themer">Dark</button>
</nav>

<main>
  <section class="tab on" id="tab-schematic">
    <div id="stage">${schematic}</div>
    <div class="hint">Drag to pan · scroll to zoom · click a device or cable</div>
    <div class="legend">${legend}</div>
    <aside id="panel"></aside>
  </section>

  <section class="tab" id="tab-room">
    ${
      roomItems.length
        ? `<div class="planwrap">${roomPlanSvg(room, roomItems)}<div class="planlist" id="planlist"></div></div>`
        : `<div class="empty">No room layout in this drawing.</div>`
    }
  </section>

  <section class="tab" id="tab-schedules">
    <div class="sheet">
      <h2>Bill of materials</h2>
      ${table(["Qty", "Manufacturer", "Model", "Description"],
        bomRows.map((r) => [String(r.qty), r.mfr, r.model, r.desc]), "t-bom")}
      <h2>Devices</h2>
      ${table(["Tag", "Description", "Manufacturer", "Model", "In", "Out"],
        deviceRows.map((r) => [r.tag, r.name, r.manufacturer, r.model, String(r.inputs), String(r.outputs)]), "t-dev")}
      <h2>Cable schedule</h2>
      ${table(["Cable", "Signal", "From", "Port", "Conn.", "To", "Port", "Conn."],
        cableRows.map((r) => [
          r.label, findSignal(signals, r.signal).label,
          r.fromTag, r.fromPort, r.fromConn, r.toTag, r.toPort, r.toConn,
        ]), "t-cab")}
    </div>
  </section>
</main>

<script>
(function(){
  "use strict";
  var DEVICES = ${json(deviceRows)};
  var CABLES  = ${json(cableRows)};
  var ITEMS   = ${json(roomItems)};
  var SIGNALS = ${json(Object.fromEntries(signals.map((s) => [s.key, s])))};

  var byId = {};
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
    themer.textContent = dark ? "Dark" : "Light";
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
      '<button class="close" title="Close">&times;</button>' +
      '<h2>' + escapeHtml(d.name) + '</h2>' +
      '<div class="tagline">' + escapeHtml(d.tag) + '</div>' +
      '<table><tr><th>Manufacturer</th></tr><tr><td>' + (escapeHtml(d.manufacturer) || "—") + '</td></tr>' +
      '<tr><th>Model</th></tr><tr><td>' + (escapeHtml(d.model) || "—") + '</td></tr></table>' +
      '<table><tr><th>Ports</th></tr>' +
      d.ports.map(function(p){
        var c = (SIGNALS[p.signal] || {}).color || "#888";
        return '<tr><td><span class="sw" style="background:' + c + '"></span>' +
          escapeHtml(p.label) + ' <span style="opacity:.55">' + (p.dir === "in" ? "IN" : "OUT") +
          (p.connector ? " · " + escapeHtml(p.connector) : "") + '</span></td></tr>';
      }).join("") + '</table>' +
      (links.length
        ? '<table><tr><th>Cables (' + links.length + ')</th></tr>' +
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
    var col = (SIGNALS[c.signal] || {}).color || "#888";
    panel.innerHTML =
      '<button class="close" title="Close">&times;</button>' +
      '<h2>' + (escapeHtml(c.label) || "Cable") + '</h2>' +
      '<div class="tagline"><span class="sw" style="background:' + col + '"></span>' +
      escapeHtml((SIGNALS[c.signal] || {}).label || c.signal) + '</div>' +
      '<table><tr><th>From</th></tr><tr><td>' + escapeHtml(c.fromTag) + " · " + escapeHtml(c.fromPort) +
      (c.fromConn ? ' <span style="opacity:.55">' + escapeHtml(c.fromConn) + "</span>" : "") + '</td></tr>' +
      '<tr><th>To</th></tr><tr><td>' + escapeHtml(c.toTag) + " · " + escapeHtml(c.toPort) +
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
      document.querySelectorAll('.cable[data-signal="' + s + '"]').forEach(function(c){
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
        "Size: " + it.size.w + "×" + it.size.h + "×" + it.size.d + " m" +
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
