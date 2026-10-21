import { useT } from "@/lib/i18n";
import { memo, useCallback, useRef, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** One piece of equipment occupying a run of rack units. */
export type RackItem = {
  id: string;
  label: string;
  /** Device tag on the schematic, when this is one of the drawn devices. */
  tag?: string;
  /** Lowest rack unit it occupies. 1 is the bottom of the rack. */
  u: number;
  /** Height in rack units. */
  height: number;
  color?: string;
};

export type RackNodeData = {
  tag: string;
  name: string;
  /** Total usable rack units. */
  units: number;
  items: RackItem[];
};

/** Pixel height of one rack unit as drawn. */
export const RU_PX = 15;
const RAIL_W = 26;
const BODY_W = 250;

let seq = 0;
const newId = () => `ru${Date.now().toString(36)}${(++seq).toString(36)}`;

export const makeRackItem = (u = 1, height = 1): RackItem => ({
  id: newId(),
  label: "Equipment",
  u,
  height,
  color: "#64748b",
});

export const makeRackData = (): RackNodeData => ({
  tag: "RK-01",
  name: "Equipment Rack",
  units: 24,
  items: [],
});

/** True when [aU, aU+aH) overlaps [bU, bU+bH). */
const overlaps = (aU: number, aH: number, bU: number, bH: number) =>
  aU < bU + bH && bU < aU + aH;

/**
 * Finds the nearest free slot at or below `wanted`, so dropping equipment onto
 * an occupied position lands it somewhere sensible rather than stacking two
 * devices in the same U.
 */
function resolveSlot(
  wanted: number,
  height: number,
  units: number,
  others: RackItem[],
): number {
  const max = units - height + 1;
  const start = Math.min(Math.max(wanted, 1), Math.max(max, 1));
  const free = (u: number) =>
    u >= 1 &&
    u <= max &&
    !others.some((o) => overlaps(u, height, o.u, o.height));

  if (free(start)) return start;
  // Spiral outwards from the requested slot.
  for (let d = 1; d <= units; d++) {
    if (free(start - d)) return start - d;
    if (free(start + d)) return start + d;
  }
  return start;
}

function RackNodeImpl({
  id,
  data,
  selected,
}: NodeProps & { data: RackNodeData }) {
  const t = useT();
  const { updateNodeData } = useReactFlow();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const units = Math.max(1, data.units || 24);
  const items = data.items ?? [];

  const setItems = useCallback(
    (next: RackItem[]) => updateNodeData(id, { items: next }),
    [id, updateNodeData],
  );

  /** Top offset in px for a unit, measured from the top of the rack body. */
  const topOf = (item: RackItem) => (units - item.u - item.height + 1) * RU_PX;

  /**
   * Drag runs off window listeners: the pointer regularly leaves the small
   * bay while dragging, and capture can throw on synthetic pointer ids.
   */
  const beginDrag = (e: React.PointerEvent, item: RackItem) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(item.id);

    const startY = e.clientY;
    const startU = item.u;
    const zoom = bodyRef.current
      ? bodyRef.current.getBoundingClientRect().height / (units * RU_PX)
      : 1;
    let live = startU;

    const move = (ev: PointerEvent) => {
      // Screen Y grows downwards, rack units grow upwards.
      const deltaU = Math.round((startY - ev.clientY) / (RU_PX * zoom));
      const others = items.filter((x) => x.id !== item.id);
      const next = resolveSlot(startU + deltaU, item.height, units, others);
      if (next === live) return;
      live = next;
      setItems(items.map((x) => (x.id === item.id ? { ...x, u: next } : x)));
    };
    const up = () => {
      setDragging(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addItem = () => {
    const height = 1;
    const u = resolveSlot(1, height, units, items);
    setItems([...items, { ...makeRackItem(u, height) }]);
  };

  const patch = (itemId: string, p: Partial<RackItem>) =>
    setItems(items.map((x) => (x.id === itemId ? { ...x, ...p } : x)));

  // Unit ruler, numbered bottom-up like a real rack.
  const rulers = Array.from({ length: units }, (_, i) => units - i);

  return (
    <div
      className={cn(
        "w-[302px] overflow-hidden rounded-[12px] border border-[var(--hairline)]",
        "bg-[var(--glass)] text-card-foreground shadow-[var(--shadow-card)] backdrop-blur-xl",
        selected && "border-[var(--primary)] ring-2 ring-[var(--primary)]/25",
      )}
    >
      {/* Title block */}
      <div className="flex items-center gap-1.5 border-b border-[var(--hairline)] bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
        <input
          value={data.tag}
          onChange={(e) =>
            updateNodeData(id, { tag: e.target.value.toUpperCase() })
          }
          className="nodrag nopan w-[64px] shrink-0 rounded-md border border-[var(--hairline)] bg-background/70 py-[1px] text-center font-mono text-[10px] font-semibold uppercase outline-none"
        />
        <input
          value={data.name}
          onChange={(e) => updateNodeData(id, { name: e.target.value })}
          className="nodrag nopan min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-none"
        />
        <input
          type="number"
          min={1}
          max={60}
          value={units}
          title={t("Rack units")}
          onChange={(e) =>
            updateNodeData(id, {
              units: Math.max(1, Number(e.target.value) || 1),
            })
          }
          className="nodrag nopan w-[38px] shrink-0 rounded-md border border-[var(--hairline)] bg-background/70 text-center font-mono text-[10px] outline-none"
        />
        <span className="shrink-0 text-[9px] text-muted-foreground">U</span>
      </div>

      {/* Elevation */}
      <div className="flex">
        {/* Unit ruler */}
        <div
          className="shrink-0 border-r border-[var(--hairline)] bg-black/[0.02] dark:bg-white/[0.03]"
          style={{ width: RAIL_W }}
        >
          {rulers.map((u) => (
            <div
              key={u}
              className="flex items-center justify-center border-b border-[var(--hairline)]/40 font-mono text-[7px] text-muted-foreground/70"
              style={{ height: RU_PX }}
            >
              {u}
            </div>
          ))}
        </div>

        {/* Bays */}
        <div
          ref={bodyRef}
          className="relative"
          style={{ width: BODY_W, height: units * RU_PX }}
        >
          {/* Empty bay lines */}
          {rulers.map((u) => (
            <div
              key={u}
              className="absolute left-0 right-0 border-b border-dashed border-[var(--hairline)]/30"
              style={{ top: (units - u) * RU_PX, height: RU_PX }}
            />
          ))}

          {items.map((item) => (
            <div
              key={item.id}
              // nodrag: React Flow's node drag runs off a native listener on
              // the wrapper, which fires before React can stopPropagation.
              className={cn(
                "nodrag nopan group absolute left-1 right-1 flex items-center gap-1",
                "rounded-[3px] border px-1.5 text-[10px] shadow-sm transition-shadow",
                dragging === item.id
                  ? "z-10 cursor-grabbing shadow-lg"
                  : "cursor-grab",
              )}
              style={{
                top: topOf(item) + 1,
                height: item.height * RU_PX - 2,
                background: `color-mix(in srgb, ${item.color ?? "#64748b"} 22%, var(--card))`,
                borderColor: item.color ?? "#64748b",
              }}
              onPointerDown={(e) => beginDrag(e, item)}
              title={`${item.tag ? item.tag + " · " : ""}${item.label} — ${item.height}U ${t("at")} U${item.u}`}
            >
              <span
                className="h-2.5 w-1 shrink-0 rounded-[1px]"
                style={{ background: item.color ?? "#64748b" }}
              />
              {item.tag && (
                <span className="shrink-0 font-mono text-[9px] font-semibold opacity-80">
                  {item.tag}
                </span>
              )}
              <input
                value={item.label}
                onChange={(e) => patch(item.id, { label: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                className="nodrag nopan min-w-0 flex-1 bg-transparent outline-none"
              />
              <input
                type="number"
                min={1}
                max={units}
                value={item.height}
                title={t("Height in U")}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const h = Math.min(
                    Math.max(Number(e.target.value) || 1, 1),
                    units,
                  );
                  patch(item.id, {
                    height: h,
                    u: resolveSlot(
                      item.u,
                      h,
                      units,
                      items.filter((x) => x.id !== item.id),
                    ),
                  });
                }}
                className="nodrag nopan w-6 shrink-0 bg-transparent text-right font-mono text-[9px] opacity-60 outline-none"
              />
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setItems(items.filter((x) => x.id !== item.id))}
                className="nodrag nopan shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                title={t("Remove")}
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={addItem}
        className="nodrag nopan flex w-full items-center gap-1 border-t border-[var(--hairline)] px-2 py-1 text-[10px] text-muted-foreground/80 transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
      >
        <Plus size={10} strokeWidth={2.2} /> {t("Equipment")}{" "}
      </button>
    </div>
  );
}

export const RackNode = memo(RackNodeImpl);
