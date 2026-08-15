import { expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { buildWorkbook } from "./schedules";
import type { SchematicEdge, SchematicNode } from "./db";

const device = (
  id: string,
  tag: string,
  name: string,
  manufacturer: string,
  model: string,
  ports: { id: string; label: string; dir: "in" | "out"; connector?: string; signal?: string }[],
): SchematicNode => ({
  id,
  type: "database",
  position: { x: 0, y: 0 },
  data: {
    tag,
    name,
    manufacturer,
    model,
    ports: ports.map((p) => ({
      id: p.id,
      label: p.label,
      dir: p.dir,
      connector: p.connector ?? "",
      signal: p.signal ?? "audio",
    })),
  },
});

const nodes: SchematicNode[] = [
  device("n1", "DSP-01", "Audio DSP", "QSC", "Core 110f", [
    { id: "p1", label: "Mic 1", dir: "in", connector: "XLR-F" },
    { id: "p2", label: "Zone A", dir: "out", connector: "PHOENIX" },
  ]),
  device("n2", "AMP-01", "Power Amplifier", "Crown", "CDi 2|300", [
    { id: "p3", label: "In A", dir: "in", connector: "PHOENIX" },
  ]),
  // Second identical amp: the BOM must roll these two into one line of qty 2.
  device("n3", "AMP-02", "Power Amplifier", "Crown", "CDi 2|300", [
    { id: "p4", label: "In A", dir: "in", connector: "PHOENIX" },
  ]),
  {
    id: "t1",
    type: "text",
    position: { x: 0, y: 0 },
    data: { text: "not a device" },
  },
];

const edges: SchematicEdge[] = [
  {
    id: "e1",
    source: "n1",
    target: "n2",
    sourceHandle: "p2",
    targetHandle: "p3",
    label: "C-101",
  },
];

const sheetRows = (wb: XLSX.WorkBook, name: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]!);

test("workbook carries the three schedules", () => {
  const wb = buildWorkbook(nodes, edges);
  expect(wb.SheetNames).toEqual(["BOM", "Devices", "Cables"]);
});

test("device sheet lists only devices, with port counts", () => {
  const rows = sheetRows(buildWorkbook(nodes, edges), "Devices");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({
    Tag: "DSP-01",
    Description: "Audio DSP",
    Manufacturer: "QSC",
    Model: "Core 110f",
    Inputs: 1,
    Outputs: 1,
  });
});

test("BOM rolls identical make/model into one line", () => {
  const rows = sheetRows(buildWorkbook(nodes, edges), "BOM");
  expect(rows).toHaveLength(2);
  const amp = rows.find((r) => r.Model === "CDi 2|300");
  expect(amp).toMatchObject({ Qty: 2, Manufacturer: "Crown" });
  expect(rows.find((r) => r.Model === "Core 110f")).toMatchObject({ Qty: 1 });
});

test("cable schedule resolves both ends to tags, ports and connectors", () => {
  const rows = sheetRows(buildWorkbook(nodes, edges), "Cables");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    "Cable ID": "C-101",
    Signal: "Audio",
    "From Tag": "DSP-01",
    "From Port": "Zone A",
    "From Connector": "PHOENIX",
    "To Tag": "AMP-01",
    "To Port": "In A",
    "To Connector": "PHOENIX",
  });
});

test("survives an empty drawing", () => {
  const wb = buildWorkbook([], []);
  expect(wb.SheetNames).toEqual(["BOM", "Devices", "Cables"]);
  expect(sheetRows(wb, "Cables")).toHaveLength(0);
});
