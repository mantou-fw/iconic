import { memo, useEffect, useRef, useState } from "react";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Icon } from "@iconify/react";

import { SideHandles } from "@/components/nodes/side-handles";
import { cn } from "@/lib/utils";

export type IconTextData = {
  /** Any Iconify icon id, e.g. "mdi:laptop" or "logos:microsoft-teams". */
  icon: string;
  label: string;
};

/** A handful of icons common on AV/network schematics, for quick picking. */
const ICON_PRESETS = [
  "mdi:laptop",
  "mdi:desktop-tower-monitor",
  "mdi:monitor",
  "mdi:server",
  "mdi:router-network",
  "mdi:wifi",
  "mdi:cloud-outline",
  "mdi:video",
  "mdi:microphone",
  "mdi:speaker",
  "mdi:cellphone",
  "mdi:cast-connected",
  "logos:microsoft-teams",
  "logos:zoom-icon",
  "logos:google-meet",
];

export const makeIconTextData = (): IconTextData => ({
  icon: "mdi:laptop",
  label: "Device",
});

/** A textarea that grows to fit its content instead of clipping or scrolling. */
function AutoTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="Label"
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "nodrag nopan w-full resize-none overflow-hidden rounded-md bg-transparent px-1 text-center text-[11px] font-medium leading-tight outline-none",
        "focus:bg-background/40 focus:ring-2 focus:ring-[var(--primary)]/35",
        "placeholder:text-muted-foreground/45",
      )}
    />
  );
}

function IconTextNodeImpl({ id, data, selected }: NodeProps & { data: IconTextData }) {
  const { updateNodeData } = useReactFlow();
  const [pickerOpen, setPickerOpen] = useState(false);

  const patch = (p: Partial<IconTextData>) => updateNodeData(id, p);

  return (
    <div
      className={cn(
        "relative flex w-[132px] flex-col items-center gap-1 rounded-[10px] p-2 transition-shadow",
        selected && "ring-2 ring-[var(--primary)]/50 ring-offset-2 ring-offset-transparent",
      )}
    >
      <SideHandles position={Position.Top} id="top" />
      <SideHandles position={Position.Right} id="right" />
      <SideHandles position={Position.Bottom} id="bottom" />
      <SideHandles position={Position.Left} id="left" />

      <button
        title="Change icon"
        onClick={() => setPickerOpen((v) => !v)}
        className="nodrag nopan flex h-10 w-10 items-center justify-center rounded-[9px] text-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10"
      >
        <Icon icon={data.icon || "mdi:help-circle-outline"} width={28} height={28} />
      </button>

      <AutoTextarea value={data.label} onChange={(label) => patch({ label })} />

      {pickerOpen && (
        <div
          className={cn(
            "nodrag nopan absolute left-1/2 top-full z-10 mt-1.5 w-[176px] -translate-x-1/2 rounded-[10px] p-2",
            "border border-[var(--hairline)] bg-[var(--glass)] backdrop-blur-xl shadow-[var(--shadow-panel)]",
          )}
        >
          <div className="grid grid-cols-5 gap-1">
            {ICON_PRESETS.map((name) => (
              <button
                key={name}
                title={name}
                onClick={() => {
                  patch({ icon: name });
                  setPickerOpen(false);
                }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/[0.06] dark:hover:bg-white/10",
                  data.icon === name && "bg-[var(--primary)]/15",
                )}
              >
                <Icon icon={name} width={18} height={18} />
              </button>
            ))}
          </div>
          <input
            defaultValue={data.icon}
            placeholder="any-set:icon-name"
            title="Any Iconify icon id — see icon-sets.iconify.design"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                patch({ icon: e.currentTarget.value.trim() });
                setPickerOpen(false);
              }
              if (e.key === "Escape") setPickerOpen(false);
            }}
            className="mt-1.5 w-full rounded-md border border-[var(--hairline)] bg-background/70 px-1.5 py-1 font-mono text-[9px] outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
          />
        </div>
      )}
    </div>
  );
}

export const IconTextNode = memo(IconTextNodeImpl);
