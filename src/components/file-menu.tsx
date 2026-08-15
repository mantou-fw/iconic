import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  FileDown,
  FileImage,
  FileType,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Monitor,
  Moon,
  PenTool,
  Save,
  Sheet,
  Sun,
  Waypoints,
} from "lucide-react";

import type { ThemePref } from "@/lib/theme";

import { cn } from "@/lib/utils";

export type AIStatus = "off" | "connecting" | "live";

const STATUS_COLOR: Record<AIStatus, string> = {
  off: "#94a3b8",
  connecting: "#eab308",
  live: "#16a34a",
};

const STATUS_TEXT: Record<AIStatus, string> = {
  off: "AI bridge offline",
  connecting: "AI bridge connecting…",
  live: "AI bridge live",
};

function Item({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Save;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-[13px] text-foreground transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10"
    >
      <Icon size={14} strokeWidth={1.9} className="shrink-0 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {hint && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

export function FileMenu({
  onOpen,
  onSaveJson,
  onExportXlsx,
  onExportImage,
  onExportHtml,
  onOpenRoom,
  roomItemCount,
  theme,
  onThemeChange,
  aiStatus,
}: {
  onOpen: () => void;
  onSaveJson: () => void;
  onExportXlsx: () => void;
  onExportImage: (format: "png" | "svg" | "pdf") => void;
  onExportHtml: () => void;
  onOpenRoom: () => void;
  roomItemCount: number;
  theme: ThemePref;
  onThemeChange: (t: ThemePref) => void;
  aiStatus: AIStatus;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="absolute left-4 top-4 z-20">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "glass-panel flex items-center gap-2 rounded-[12px] px-2.5 py-2 text-[13px] font-medium",
          "transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
        )}
      >
        <Waypoints size={15} strokeWidth={2} className="text-[var(--primary)]" />
        <span>Schematic</span>
        <span
          title={STATUS_TEXT[aiStatus]}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: STATUS_COLOR[aiStatus] }}
        />
        <ChevronDown
          size={13}
          strokeWidth={2.2}
          className={cn(
            "text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="glass-panel mt-1.5 w-[212px] rounded-[12px] p-1">
          <Item icon={FolderOpen} label="Open project…" onClick={run(onOpen)} />
          <Item icon={Save} label="Save project" hint=".json" onClick={run(onSaveJson)} />
          <div className="my-1 h-px bg-[var(--hairline)]" />
          <Item
            icon={Sheet}
            label="Export schedules"
            hint=".xlsx"
            onClick={run(onExportXlsx)}
          />
          <div className="flex items-center gap-2 px-2 pb-1.5 pl-8">
            <FileDown size={11} className="text-muted-foreground/60" />
            <span className="text-[10px] leading-tight text-muted-foreground">
              BOM · Devices · Cables
            </span>
          </div>

          <div className="my-1 h-px bg-[var(--hairline)]" />
          <Item
            icon={FileType}
            label="Print / Export PDF"
            hint=".pdf"
            onClick={run(() => onExportImage("pdf"))}
          />
          <Item
            icon={ImageIcon}
            label="Export image"
            hint=".png"
            onClick={run(() => onExportImage("png"))}
          />
          <Item
            icon={FileImage}
            label="Export vector"
            hint=".svg"
            onClick={run(() => onExportImage("svg"))}
          />
          <Item
            icon={Globe}
            label="Interactive viewer"
            hint=".html"
            onClick={run(onExportHtml)}
          />
          <div className="flex items-center gap-2 px-2 pb-1.5 pl-8">
            <FileDown size={11} className="text-muted-foreground/60" />
            <span className="text-[10px] leading-tight text-muted-foreground">
              Read-only, self-contained, for clients
            </span>
          </div>

          <div className="my-1 h-px bg-[var(--hairline)]" />
          <Item
            icon={Boxes}
            label="3D room view"
            hint={roomItemCount ? `${roomItemCount}` : undefined}
            onClick={run(onOpenRoom)}
          />

          <div className="my-1 h-px bg-[var(--hairline)]" />
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="flex-1 text-[13px]">Appearance</span>
            <div className="flex items-center gap-0.5 rounded-[7px] bg-black/[0.06] p-0.5 dark:bg-white/10">
              {([
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
                ["autocad", PenTool, "AutoCAD drafting"],
                ["system", Monitor, "Follow system"],
              ] as const).map(([value, Icon, hint]) => (
                <button
                  key={value}
                  title={hint}
                  onClick={() => onThemeChange(value)}
                  className={cn(
                    "flex h-5 w-6 items-center justify-center rounded-[5px] transition-colors",
                    theme === value
                      ? "bg-[var(--glass)] text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={11} strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
