import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

import {
  avoidObstacles,
  midpointOf,
  roundedPath,
  snap,
  type Side,
} from "@/lib/routing";
import { useObstacles } from "@/lib/obstacles";
import { useResolvedTheme } from "@/lib/theme";
import type { Point } from "@/lib/stroke";

export type LabeledEdgeData = {
  /** Cable / link designation shown on the run, e.g. "C-101". */
  label?: string;
  /** X of the vertical leg. Undefined means "auto". */
  midX?: number;
  /** Y of the horizontal leg. Undefined means "auto". */
  midY?: number;
  /** Derived fan-out lane; keeps parallel cables from overlapping. */
  lane?: number;
};

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
  selected,
}: EdgeProps) {
  const { updateEdgeData, screenToFlowPosition } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hovered, setHovered] = useState(false);

  const edgeData = (data ?? {}) as LabeledEdgeData;
  const label = (edgeData.label ?? "").trim();
  const color = (style as React.CSSProperties | undefined)?.stroke ?? "#64748b";

  const obstacles = useObstacles();
  // CAD polylines mitre; the app's default look softens them.
  const corner = useResolvedTheme() === "autocad" ? 0 : 8;

  const route = useMemo(
    () =>
      avoidObstacles(
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
        sourcePosition as Side,
        targetPosition as Side,
        obstacles,
        edgeData.midX,
        edgeData.midY,
        edgeData.lane ?? 0,
      ),
    [
      obstacles,
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      edgeData.midX,
      edgeData.midY,
      edgeData.lane,
    ],
  );

  const path = useMemo(() => roundedPath(route.points, corner), [route.points, corner]);
  const labelPoint = useMemo(() => midpointOf(route.points), [route.points]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const showHandles = selected || hovered;

  /**
   * Drags run off window listeners rather than pointer capture: the grab dots
   * are small, the pointer routinely leaves them mid-drag, and capture can
   * throw on synthetic pointer ids.
   */
  const beginDrag = (e: React.PointerEvent, axis: "x" | "y") => {
    e.stopPropagation();
    e.preventDefault();

    const move = (ev: PointerEvent) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      updateEdgeData(
        id,
        axis === "x" ? { midX: snap(p.x) } : { midY: snap(p.y) },
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** Double-click a grab dot to hand that axis back to auto-routing. */
  const reset = (axis: "x" | "y") =>
    updateEdgeData(id, axis === "x" ? { midX: undefined } : { midY: undefined });

  const startEditing = () => {
    setDraft(label);
    setEditing(true);
  };

  const commit = () => {
    updateEdgeData(id, { label: draft.trim() });
    setEditing(false);
  };

  const chip =
    "rounded-md border bg-[var(--glass)] text-foreground backdrop-blur-md shadow-sm";

  const grip = (at: Point, axis: "x" | "y") => (
    <div
      key={axis}
      className="nodrag nopan absolute"
      style={{
        transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)`,
        pointerEvents: "all",
        zIndex: 2,
      }}
    >
      {/* Padding gives the small dot a comfortable grab area. */}
      <div
        title={`Drag to move the cable ${axis === "x" ? "left/right" : "up/down"} · double-click to reset`}
        onPointerDown={(e) => beginDrag(e, axis)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          reset(axis);
        }}
        className="group/g flex items-center justify-center p-1.5"
        style={{ cursor: axis === "x" ? "ew-resize" : "ns-resize" }}
      >
        <div
          className="h-2.5 w-2.5 rounded-full border-2 border-white opacity-80 shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-transform duration-150 group-hover/g:scale-125 group-hover/g:opacity-100"
          style={{ background: "var(--primary)" }}
        />
      </div>
    </div>
  );

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {/* Wide invisible stroke: hover target and click surface for the cable. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        strokeLinecap="round"
        style={{ pointerEvents: "stroke" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <EdgeLabelRenderer>
        {showHandles && grip(route.handleX, "x")}
        {showHandles && grip(route.handleY, "y")}

        {/* Cable designation — lifted clear of the line so it never covers a
            grab dot, and in plain foreground ink for contrast in both themes. */}
        <div
          className="nodrag nopan absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y - 13}px)`,
            pointerEvents: "all",
            zIndex: 1,
          }}
        >
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              autoFocus
              placeholder="Cable ID"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              className={`${chip} w-24 px-1.5 py-0.5 text-center font-mono text-[9px] uppercase outline-none`}
              style={{ borderColor: color }}
            />
          ) : label ? (
            <button
              onClick={startEditing}
              title="Edit label"
              className={`${chip} px-1.5 py-0.5 font-mono text-[9px] uppercase leading-tight`}
              style={{ borderColor: color }}
            >
              {label}
            </button>
          ) : showHandles ? (
            <button
              onClick={startEditing}
              className={`${chip} border-dashed px-1.5 py-0.5 font-mono text-[9px] leading-tight text-muted-foreground hover:text-foreground`}
            >
              + label
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
