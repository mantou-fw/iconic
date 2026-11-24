import { expect, test } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { buildViewerHtml } from "./export-html";
import { setLocale, translate } from "./i18n";
import { DEFAULT_ROOM, makeRoomItem, type MountKind } from "./room";

const device = (id: string, tag: string, name: string, x: number, y: number): Node => ({
  id,
  type: "database",
  position: { x, y },
  data: {
    tag,
    name,
    manufacturer: "QSC",
    model: "Core 110f",
    ports: [
      { id: `${id}-i1`, label: "Mic 1", dir: "in", connector: "XLR-F", signal: "audio" },
      { id: `${id}-o1`, label: "Zone 1", dir: "out", connector: "PHOENIX", signal: "audio" },
      { id: `${id}-o2`, label: "LAN", dir: "out", connector: "RJ45", signal: "network" },
    ],
  },
});

const nodes: Node[] = [
  device("n1", "DSP-01", "Audio DSP", 0, 0),
  device("n2", "AMP-01", "Amplifier", 600, 0),
  {
    id: "tb",
    type: "titleblock",
    position: { x: 1200, y: 0 },
    data: { title: "MULTI-ROOM AUDIO", client: "Acme Ltd", project: "HQ Fitout", rev: "B" },
    width: 300,
    height: 900,
  },
];

const edges: Edge[] = [
  {
    id: "e1",
    source: "n1",
    target: "n2",
    sourceHandle: "n1-o1",
    targetHandle: "n2-i1",
    data: { label: "A-101" },
  },
];

const items = [
  makeRoomItem({ id: "r1", kind: "tv", label: '85" Display' }, DEFAULT_ROOM),
  makeRoomItem({ id: "r2", kind: "sofa", label: "Sofa" }, DEFAULT_ROOM),
];

const build = (over: Partial<Parameters<typeof buildViewerHtml>[0]> = {}) =>
  buildViewerHtml({
    nodes,
    edges,
    room: DEFAULT_ROOM,
    roomItems: items,
    absolute: (n) => n.position,
    ...over,
  });

test("produces a standalone document with no external references", () => {
  const html = build();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  // Nothing may be fetched at open time — the client may be offline.
  expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
  expect(html).not.toMatch(/<link[^>]+stylesheet/i);
  expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
});

test("renders every device and cable into the SVG", () => {
  const html = build();
  expect(html).toContain('data-id="n1"');
  expect(html).toContain('data-id="n2"');
  expect(html).toContain('data-id="e1"');
  expect(html).toContain("DSP-01");
  expect(html).toContain("Amplifier");
  expect(html).toContain("A-101");
});

test("carries the port and connector detail a client needs", () => {
  const html = build();
  expect(html).toContain("Mic 1");
  expect(html).toContain("PHOENIX");
  expect(html).toContain("RJ45");
});

test("cables are tagged with their signal class so they can be filtered", () => {
  const html = build();
  expect(html).toContain('data-signal="audio"');
});

test("bakes literal colours, never the app's theme variables", () => {
  // The viewer has no access to the app's stylesheet: a var(--sig-*) would
  // render as black. Signal colours must be resolved to hex at export time.
  const html = build();
  expect(html).not.toContain("var(--sig-");
  expect(html).toContain("#16a34a"); // audio
  expect(html).toContain("#9333ea"); // network
});

test("includes the schedules and the title block identity", () => {
  const html = build();
  expect(html).toContain("Bill of materials");
  expect(html).toContain("Cable schedule");
  expect(html).toContain("MULTI-ROOM AUDIO");
  expect(html).toContain("Acme Ltd");
});

test("includes the room plan when the drawing has one", () => {
  expect(build()).toContain('85&quot; Display');
  // …and degrades to a message rather than an empty tab when it does not.
  expect(build({ roomItems: [] })).toContain("No room layout");
});

test.each([[30, -30], [-30, 30], [0, 0]])(
  "uses plan rotation %s° as 3D yaw and draws an SVG footprint at %s°",
  (yaw, planAngle) => {
    const table = makeRoomItem({
      id: "table", kind: "table", label: "Conference table",
      position: { x: 1.5, y: 0.5, z: 2 },
      size: { w: 2, h: 0.73, d: 0.8 }, rotation: yaw,
    }, DEFAULT_ROOM);
    expect(build({ roomItems: [table] })).toContain(
      `data-id="table" tabindex="0"\n        transform="rotate(${planAngle} 175 220)"`,
    );
  },
);

test("is read-only: no editing affordances are emitted", () => {
  const html = build();
  expect(html).not.toContain("contenteditable");
  expect(html).not.toMatch(/<textarea/i);
  // The only inputs are the viewer's own search box and signal filters.
  const inputs = html.match(/<input[^>]*>/gi) ?? [];
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.every((i) => /type="(search|checkbox)"/.test(i))).toBe(true);
});

test("escapes markup in user content instead of injecting it", () => {
  const nasty: Node[] = [device("n1", "</script><b>x", '"><img>', 0, 0)];
  const html = buildViewerHtml({
    nodes: nasty,
    edges: [],
    room: DEFAULT_ROOM,
    roomItems: [],
    absolute: (n) => n.position,
  });
  expect(html).not.toContain("</script><b>x");
  expect(html).not.toContain('"><img>');
  expect(html).toContain("&lt;/script&gt;");
});

test("survives an empty drawing", () => {
  const html = buildViewerHtml({
    nodes: [],
    edges: [],
    room: DEFAULT_ROOM,
    roomItems: [],
    absolute: (n) => n.position,
  });
  expect(html).toContain("<svg");
  expect(html.length).toBeGreaterThan(1000);
});

// Exported clients receive the current UI language without altering drawing data.
test.each(["en", "zh-Hant", "ja"] as const)("exports a working localized viewer in %s", language => {
  try {
    setLocale(language);
    const html = build();
    expect(html).toContain(`lang="${language}"`);
    expect(html).toContain(translate("Room plan", language));
    expect(html).toContain("MULTI-ROOM AUDIO");
    expect(html).toContain("DSP-01");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  } finally { setLocale("en"); }
});

test.each([
  ["en", "Devices", "Furniture", "Mount", "Height", "Position", "Size", "wall", "ceiling", "floor", "table", "rack"],
  ["zh-Hant", "設備", "傢俬", "安裝方式", "高度", "位置", "尺寸", "牆壁", "天花", "地面", "桌面", "機架"],
  ["ja", "機器", "家具", "取付方法", "高さ", "位置", "サイズ", "壁", "天井", "床", "卓上", "ラック"],
] as const)("localizes room-plan controls and mount values in %s without translating authored content",
  (language, devices, furniture, mount, height, position, size, ...mountLabels) => {
    const mounts = ["wall", "ceiling", "floor", "table", "rack"] satisfies MountKind[];
    const roomItems = mounts.map((mount, index) => makeRoomItem({
      id: `item-${index}`, kind: index === 0 ? "tv" : "table",
      label: "自訂桌 & Display", tag: "AV-01", note: "保留原稿。", mount,
    }, DEFAULT_ROOM));
    try {
      setLocale(language);
      const html = build({ roomItems });
      expect(html).toContain(`group("${devices}",`);
      expect(html).toContain(`group("${furniture}",`);
      for (const field of [mount, height, position, size]) {
        expect(html).toContain(`escapeHtml("${field}") + ": "`);
      }
      for (const label of mountLabels) {
        expect(html).toContain(`"mountLabel":"${label}"`);
        expect(html).toContain(`自訂桌 &amp; Display (AV-01) — ${label} @`);
      }
      expect(html).toContain('"note":"保留原稿。"');
    } finally { setLocale("en"); }
  },
);

test("keeps legend content literal and gives SVG markers internal IDs", () => {
  const html = build({
    signals: [{
      key: 'AC & "custom"',
      label: '影音 & <span>確認</span> "音声"',
      short: "AV",
      color: "#0088cc; color: red",
    }],
  });
  expect(html).toContain("影音 &amp; &lt;span&gt;確認&lt;/span&gt; &quot;音声&quot;");
  expect(html).toContain('data-signal="AC &amp; &quot;custom&quot;"');
  expect(html).toContain('id="arrow-0"');
  expect(html).toContain('marker-end="url(#arrow-0)"');
  expect(html).toContain('style="background:#64748b"');
  expect(html).not.toContain("#0088cc; color: red");
});

test("keeps inline image data and rejects other image sources and invalid colors", () => {
  const image = (id: string, src: string): Node => ({
    id, type: "image", position: { x: 0, y: 0 }, data: { src },
  });
  const html = build({
    nodes: [
      ...nodes,
      image("inline", "data:image/png;base64,AQID"),
      image("external", "https://example.invalid/image.png"),
      image("document", "data:text/html;base64,AQID"),
      { id: "zone", type: "zone", position: { x: 0, y: 0 }, data: {
        name: "映像 <グループ>", color: "url(#other)",
      } },
    ],
    roomItems: [{ ...items[0]!, color: "url(#other)" }],
  });
  expect(html.match(/<image\b/g)).toHaveLength(1);
  expect(html).toContain('href="data:image/png;base64,AQID"');
  expect(html).toContain("映像 &lt;グループ&gt;");
  expect(html).toContain('fill="#0071e3"');
  expect(html).toContain('fill="#94a3b8"');
  expect(html).not.toContain("url(#other)");
  expect(html).not.toContain("example.invalid");
});

test("embeds a valid two-frame APNG with its registered MIME type", () => {
  const src = "data:image/apng;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAIAAAACAAAAAAAAAAAAAMAFAAAnjZneAAAABZJREFUeJxjdGva8p8BD2DCJzl8FAAAkNwCi+haYmIAAAAaZmNUTAAAAAEAAAAIAAAACAAAAAAAAAAAAAMAFAAABUWNrAAAABpmZEFUAAAAAnicY/y/lOE/Ax7AhE9y+CgAALs5ArPmRDrmAAAAAElFTkSuQmCC";
  const html = build({
    nodes: [...nodes, { id: "apng", type: "image", position: { x: 0, y: 200 }, data: { src } }],
  });
  expect(html).toContain(`href="${src}"`);
  expect(html).not.toContain("Image could not be embedded.");
});

test("keeps persisted drawing objects and rendered routes, labels, and arrow directions", () => {
  const outgoingPath = "M 268 73 L 350 73 L 350 -700 L 550 -700 L 550 73 L 600 73";
  const path = build({
    nodes: [
      ...nodes,
      { id: "z1", type: "zone", position: { x: 0, y: 300 }, data: { name: "Rack zone" } },
      { id: "r1", type: "rack", position: { x: 30, y: 330 }, parentId: "z1",
        data: { tag: "RACK-01", name: "AV rack", units: 5, items: [{ u: 2, height: 1, label: "Rack Switch" }] } },
      { id: "s1", type: "shape", position: { x: 800, y: 500 }, data: { shape: "diamond", text: "Decision" } },
      { id: "i1", type: "icon-text", position: { x: 1000, y: 500 }, data: { icon: "mdi:laptop", label: "Meeting console" } },
      { id: "m1", type: "memo", position: { x: 50, y: 800 }, data: { text: "Memo annotation" } },
      { id: "txt1", type: "text", position: { x: 50, y: 900 }, data: { text: "Free text" } },
      { id: "pen1", type: "drawing", position: { x: 150, y: 900 }, data: { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] } },
      { id: "img1", type: "image", position: { x: 250, y: 900 }, data: { src: "data:image/png;base64,AQID" } },
    ],
    edges: [
      ...edges,
      { id: "a1", source: "s1", target: "i1", sourceHandle: "right-source", targetHandle: "left-target",
        type: "arrow", data: { direction: "both", label: "Control link" } },
    ],
    renderedEdges: new Map([["e1", {
      path: outgoingPath,
      label: { x: 450, y: -713 },
      bounds: { x: 268, y: -700, width: 332, height: 773 },
    }]]),
  });
  for (const text of ["Rack zone", "Rack Switch", "Decision", "Meeting console", "Memo annotation",
    "Free text", "L 155 905", "data:image/png;base64,AQID", 'data-id="tb"', "Control link", outgoingPath]) {
    expect(path).toContain(text);
  }
  expect(path).toContain('marker-start="url(#arrow-generic)" marker-end="url(#arrow-generic)"');
  expect(path).toContain('id="schematic" viewBox="-60 -781 ');
});
