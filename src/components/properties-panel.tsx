import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type PanelMode = "pen" | "text" | "memo";

/** Ink colours for pen strokes and text labels. */
export const INK_PALETTE = [
  "#0f172a",
  "#64748b",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

/** Paper colours for memo notes. */
export const NOTE_PALETTE = [
  "#fef08a",
  "#fed7aa",
  "#fecaca",
  "#fbcfe8",
  "#ddd6fe",
  "#bfdbfe",
  "#a5f3fc",
  "#bbf7d0",
  "#e5e7eb",
  "#ffffff",
];

const MODE_LABEL: Record<PanelMode, string> = {
  pen: "Pen",
  text: "Text",
  memo: "Memo",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function PropertiesPanel({
  mode,
  scope,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  fontSize,
  onFontSizeChange,
}: {
  mode: PanelMode;
  /** Whether edits hit the selected objects or the tool's defaults. */
  scope: "tool" | "selection";
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth?: number;
  onStrokeWidthChange?: (width: number) => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
}) {
  const palette = mode === "memo" ? NOTE_PALETTE : INK_PALETTE;

  return (
    <div className="glass-panel absolute right-4 top-4 z-10 w-[204px] rounded-[14px] p-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">
          {MODE_LABEL[mode]}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {scope === "selection" ? "Selected" : "Defaults"}
        </span>
      </div>

      <div className="space-y-2.5">
        <Row label="Color">
          <div className="grid flex-1 grid-cols-5 gap-1.5">
            {palette.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => onColorChange(c)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-full border border-black/10",
                  "transition-transform duration-150 hover:scale-110 active:scale-95",
                  color.toLowerCase() === c.toLowerCase() &&
                    "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--glass)]",
                )}
                style={{ background: c }}
              >
                {color.toLowerCase() === c.toLowerCase() && (
                  <Check
                    size={10}
                    strokeWidth={3}
                    className={mode === "memo" ? "text-black/60" : "text-white"}
                  />
                )}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Custom">
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="h-7 w-full cursor-pointer rounded-lg border border-[var(--hairline)] bg-transparent p-0.5"
          />
        </Row>

        {strokeWidth !== undefined && onStrokeWidthChange && (
          <Row label="Width">
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={strokeWidth}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-black/15 accent-[var(--primary)] dark:bg-white/20"
            />
            <span className="w-5 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {strokeWidth}
            </span>
          </Row>
        )}

        {fontSize !== undefined && onFontSizeChange && (
          <Row label="Size">
            <input
              type="range"
              min={8}
              max={48}
              step={1}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-black/15 accent-[var(--primary)] dark:bg-white/20"
            />
            <span className="w-5 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {fontSize}
            </span>
          </Row>
        )}
      </div>
    </div>
  );
}
