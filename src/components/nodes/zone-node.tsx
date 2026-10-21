import { useT } from "@/lib/i18n";
import { memo } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

export type ZoneNodeData = {
  name: string;
  /** Accent used for the border and title chip. */
  color: string;
};

/** Palette offered for zones — muted enough to sit behind device blocks. */
export const ZONE_COLORS = [
  "#0071e3",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
];

export const makeZoneData = (
  name = "Zone",
  color = ZONE_COLORS[0]!,
): ZoneNodeData => ({
  name,
  color,
});

function ZoneNodeImpl({
  id,
  data,
  selected,
}: NodeProps & { data: ZoneNodeData }) {
  const t = useT();
  const { updateNodeData } = useReactFlow();
  const color = data.color ?? ZONE_COLORS[0]!;

  return (
    <div
      className={cn(
        "h-full w-full rounded-[14px] border-2 border-dashed transition-colors",
        selected && "border-solid",
      )}
      style={{
        borderColor: selected
          ? color
          : `color-mix(in srgb, ${color} 55%, transparent)`,
        background: `color-mix(in srgb, ${color} 7%, transparent)`,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={160}
        lineStyle={{ borderColor: color }}
        handleStyle={{ background: color, borderColor: "#fff" }}
      />
      {/* Title chip sits on the border, like a fieldset legend. */}
      <div
        className="absolute -top-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 shadow-sm"
        style={{ background: `color-mix(in srgb, ${color} 16%, var(--glass))` }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
        <input
          value={data.name}
          placeholder={t("Zone")}
          onChange={(e) => updateNodeData(id, { name: e.target.value })}
          className="nodrag nopan w-[136px] bg-transparent text-[11px] font-semibold tracking-tight outline-none"
          style={{ color }}
        />
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeImpl);
