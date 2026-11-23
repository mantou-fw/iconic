import type { Edge, Node } from "@xyflow/react";
import { expect, test } from "vitest";
import { checkDrawing } from "./drawing-checks";

const device = (id: string, tag: string, dir: "in" | "out", signal: string): Node => ({
  id, type: "database", position: { x: 0, y: 0 },
  data: { tag, manufacturer: "Example", model: id, ports: [{ id: "port", dir, signal }] },
});

const cable = (id: string, label: string): Edge => ({
  id, data: { label }, source: "source", target: "target", sourceHandle: "port", targetHandle: "port",
});

test("reports actionable conflicts, unknowns and authored assumptions and refreshes after correction", () => {
  const source = device("source", "DSP-01", "out", "audio");
  const target = device("target", " dsp-01 ", "in", "network");
  target.data = { ...target.data, manufacturer: "", provenance: { assumptions: ["Confirm adapter at site"] } };
  const first = cable("first", "C-01");
  const second = { ...cable("second", "c-01"), targetHandle: "removed" };
  const findings = checkDrawing([source, target], [first, second], []);
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "source", severity: "error", message: "Device tag is duplicated." }),
    expect.objectContaining({ id: "target", severity: "warning", message: "Manufacturer or model is unknown." }),
    expect.objectContaining({ id: "target", severity: "info", details: ["Confirm adapter at site"] }),
    expect.objectContaining({ id: "second", severity: "error", message: "Connection has an unresolved endpoint." }),
    expect.objectContaining({ id: "first", severity: "error", message: "Cable identifier is duplicated." }),
    expect.objectContaining({ id: "first", severity: "warning", canExplain: true, details: ["audio", "network"] }),
  ]));
  const corrected = device("target", "DSP-02", "in", "audio");
  expect(checkDrawing([source, corrected], [first], [])).toEqual([]);
});

test("retains adapter explanations as information while leaving unrelated errors visible", () => {
  const source = device("source", "", "out", "audio");
  const target = device("target", "DSP-02", "in", "network");
  const edge = cable("first", "C-01");
  edge.data = { ...edge.data, reviewExplanation: "  Audio network adapter  " };
  expect(checkDrawing([source, target], [edge], [])).toEqual([
    expect.objectContaining({ id: "source", severity: "error" }),
    expect.objectContaining({ id: "first", severity: "info", explanation: "Audio network adapter" }),
  ]);
});
