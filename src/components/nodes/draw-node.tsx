import { memo, useMemo } from "react";
import type { NodeProps } from "@xyflow/react";

import { pointsToPath, type Point } from "@/lib/stroke";

export type DrawNodeData = {
  points: Point[];
  color: string;
  strokeWidth: number;
};

function DrawNodeImpl({ data, selected }: NodeProps & { data: DrawNodeData }) {
  const d = useMemo(() => pointsToPath(data.points), [data.points]);

  return (
    // The wrapper node is pointer-events:none so the stroke's bounding box does
    // not swallow clicks; only the stroke itself is a hit target.
    <svg className="pointer-events-none h-full w-full overflow-visible">
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(data.strokeWidth + 10, 14)}
        strokeLinecap="round"
        style={{ pointerEvents: "stroke" }}
      />
      {selected && (
        <path
          d={d}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={data.strokeWidth + 4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.3}
          style={{ pointerEvents: "none" }}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={data.color}
        strokeWidth={data.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />
    </svg>
  );
}

export const DrawNode = memo(DrawNodeImpl);
