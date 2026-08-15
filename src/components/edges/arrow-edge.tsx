import { useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

import { arrowMarkers, nextArrowDirection, type ArrowDirection } from "@/lib/arrow-direction";

export type ArrowEdgeData = {
  /** Short caption shown on the connection, e.g. "RTMP Out". */
  label?: string;
  /** Which end(s) get an arrowhead. */
  direction?: ArrowDirection;
};

const DIRECTION_GLYPH: Record<ArrowDirection, string> = {
  forward: "→",
  both: "↔",
  backward: "←",
};

/**
 * A direct point-to-point arrow: no obstacle-avoidance routing, no draggable
 * mid-leg grips. For connections where the cable-run semantics of
 * `LabeledEdge` (ports, lanes, signal colouring) don't apply — e.g. wiring
 * between generic icon+text nodes.
 */
export function ArrowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  data,
  selected,
}: EdgeProps) {
  const { updateEdgeData, setEdges } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hovered, setHovered] = useState(false);

  const edgeData = (data ?? {}) as ArrowEdgeData;
  const label = (edgeData.label ?? "").trim();
  const direction = edgeData.direction ?? "forward";
  const color = (style as React.CSSProperties | undefined)?.stroke ?? "#64748b";

  const cycleDirection = () => {
    const next = nextArrowDirection(direction);
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id
          ? { ...e, data: { ...e.data, direction: next }, ...arrowMarkers(next, color) }
          : e,
      ),
    );
  };

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const showHandles = selected || hovered;

  const startEditing = () => {
    setDraft(label);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commit = () => {
    updateEdgeData(id, { label: draft.trim() });
    setEditing(false);
  };

  const chip =
    "rounded-md border bg-[var(--glass)] text-foreground backdrop-blur-md shadow-sm";

  return (
    <>
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} style={style} />
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
        {(showHandles || direction !== "forward") && (
          <button
            title={`Arrow direction: ${direction} — click to change`}
            onClick={cycleDirection}
            className={`${chip} nodrag nopan absolute flex h-5 w-5 items-center justify-center text-[11px] leading-none`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX - 24}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1,
              borderColor: color,
            }}
          >
            {DIRECTION_GLYPH[direction]}
          </button>
        )}
        <div
          className="nodrag nopan absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            zIndex: 1,
          }}
        >
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              autoFocus
              placeholder="Label"
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
