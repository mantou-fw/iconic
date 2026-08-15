import { memo, useEffect, useRef } from "react";
import {
  NodeResizer,
  NodeToolbar,
  Position,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { Square, Circle, Diamond, Triangle } from "lucide-react";

import { SideHandles } from "@/components/nodes/side-handles";
import { cn } from "@/lib/utils";

export type ShapeKind = "rectangle" | "ellipse" | "diamond" | "triangle";

export type ShapeData = {
  shape: ShapeKind;
  text: string;
  color: string;
  autoFocus?: boolean;
};

export const makeShapeData = (shape: ShapeKind = "rectangle"): ShapeData => ({
  shape,
  text: "",
  color: "#64748b",
});

const SHAPES: { kind: ShapeKind; icon: typeof Square; label: string }[] = [
  { kind: "rectangle", icon: Square, label: "Rectangle" },
  { kind: "ellipse", icon: Circle, label: "Ellipse" },
  { kind: "diamond", icon: Diamond, label: "Diamond" },
  { kind: "triangle", icon: Triangle, label: "Triangle" },
];

function ShapeNodeImpl({ id, data, selected }: NodeProps & { data: ShapeData }) {
  const { updateNodeData } = useReactFlow();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data.autoFocus) return;
    ref.current?.focus();
    updateNodeData(id, { autoFocus: undefined });
  }, [data.autoFocus, id, updateNodeData]);

  return (
    <div className="relative h-full min-h-[60px] w-full min-w-[80px]">
      <NodeResizer isVisible={selected} minWidth={80} minHeight={60} />

      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        className="nodrag nopan flex gap-0.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--glass)] p-1 backdrop-blur-xl shadow-[var(--shadow-panel)]"
      >
        {SHAPES.map(({ kind, icon: ShapeIcon, label }) => (
          <button
            key={kind}
            title={label}
            onClick={() => updateNodeData(id, { shape: kind })}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/[0.06] dark:hover:bg-white/10",
              data.shape === kind && "bg-[var(--primary)]/15",
            )}
          >
            <ShapeIcon size={14} />
          </button>
        ))}
      </NodeToolbar>

      <SideHandles position={Position.Top} id="top" />
      <SideHandles position={Position.Right} id="right" />
      <SideHandles position={Position.Bottom} id="bottom" />
      <SideHandles position={Position.Left} id="left" />

      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {data.shape === "rectangle" && (
          <rect
            x="1.5" y="1.5" width="97" height="97" rx="6"
            fill="var(--glass)" fillOpacity="0.3"
            stroke={data.color} strokeWidth="2" vectorEffect="non-scaling-stroke"
          />
        )}
        {data.shape === "ellipse" && (
          <ellipse
            cx="50" cy="50" rx="48.5" ry="48.5"
            fill="var(--glass)" fillOpacity="0.3"
            stroke={data.color} strokeWidth="2" vectorEffect="non-scaling-stroke"
          />
        )}
        {data.shape === "diamond" && (
          <polygon
            points="50,2 98,50 50,98 2,50"
            fill="var(--glass)" fillOpacity="0.3"
            stroke={data.color} strokeWidth="2" vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        )}
        {data.shape === "triangle" && (
          <polygon
            points="50,4 97,96 3,96"
            fill="var(--glass)" fillOpacity="0.3"
            stroke={data.color} strokeWidth="2" vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {selected && (
        <div className="pointer-events-none absolute inset-0 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_25%,transparent)]" />
      )}

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-2.5">
        <textarea
          ref={ref}
          value={data.text}
          placeholder="Text"
          rows={1}
          onChange={(e) => {
            updateNodeData(id, { text: e.target.value });
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          className={cn(
            "nodrag nopan pointer-events-auto w-full resize-none overflow-hidden bg-transparent text-center",
            "text-[12px] font-medium leading-snug text-foreground outline-none",
            "placeholder:text-muted-foreground/40",
          )}
        />
      </div>
    </div>
  );
}

export const ShapeNode = memo(ShapeNodeImpl);
