import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";

import { makeSignal, type SignalDef } from "@/lib/signal-types";
import { cn } from "@/lib/utils";

/**
 * The drawing's signal legend — shown as a compact strip of dot+code chips,
 * with an editor popover for changing colours/labels or adding/removing
 * signal classes. Cable and port colours across the whole drawing follow
 * whatever is configured here.
 */
export function LegendPanel({
  signals,
  onChange,
}: {
  signals: SignalDef[];
  onChange: (signals: SignalDef[]) => void;
}) {
  const [editing, setEditing] = useState(false);

  const patch = (key: string, p: Partial<SignalDef>) =>
    onChange(signals.map((s) => (s.key === key ? { ...s, ...p } : s)));

  const remove = (key: string) => onChange(signals.filter((s) => s.key !== key));

  const add = () => onChange([...signals, makeSignal()]);

  return (
    <div className="relative">
      <div className="glass-panel flex items-center gap-3 rounded-[10px] px-3 py-1.5">
        {signals.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-[10px] font-medium tracking-tight text-muted-foreground">
              {s.short}
            </span>
          </div>
        ))}
        <button
          title="Edit legend"
          onClick={() => setEditing((v) => !v)}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/10",
            editing && "bg-[var(--primary)]/15 text-foreground",
          )}
        >
          <Pencil size={11} strokeWidth={2} />
        </button>
      </div>

      {editing && (
        <div
          className={cn(
            "nodrag nopan absolute bottom-full left-0 z-10 mb-1.5 w-[280px] rounded-[10px] p-2",
            "border border-[var(--hairline)] bg-[var(--glass)] backdrop-blur-xl shadow-[var(--shadow-panel)]",
          )}
        >
          <div className="flex flex-col gap-1">
            {signals.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => patch(s.key, { color: e.target.value })}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-[var(--hairline)] bg-transparent p-0.5"
                />
                <input
                  value={s.short}
                  placeholder="CODE"
                  onChange={(e) => patch(s.key, { short: e.target.value.toUpperCase() })}
                  className="w-14 shrink-0 rounded-md border border-[var(--hairline)] bg-background/70 px-1 py-1 text-center font-mono text-[9px] uppercase outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
                />
                <input
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => patch(s.key, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-background/70 px-1.5 py-1 text-[10px] outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
                />
                <button
                  title="Remove signal"
                  onClick={() => remove(s.key)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={add}
            className="nodrag nopan mt-1.5 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] text-muted-foreground/80 transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <Plus size={11} strokeWidth={2.2} /> Add signal
          </button>
        </div>
      )}
    </div>
  );
}
