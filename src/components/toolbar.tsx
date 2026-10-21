import { ToolButton } from "./ui/tool-button";
import { useT } from "@/lib/i18n";
import {
  MousePointer2,
  Hand,
  Pencil,
  Type,
  StickyNote,
  Image as ImageIcon,
  Server,
  Group,
  LayoutTemplate,
  Server as ServerIcon,
  Rows3,
  Component,
  Shapes,
  Grid3x3,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type Tool =
  | "select"
  | "pan"
  | "pen"
  | "text"
  | "memo"
  | "image"
  | "device"
  | "icon-text"
  | "shape"
  | "zone"
  | "titleblock"
  | "rack";

export const TOOLS: {
  id: Tool;
  icon: typeof MousePointer2;
  label: string;
  /** Letter shortcut. */
  key: string;
  /** Number-row shortcut, matching the button order. */
  digit: string;
}[] = [
  { id: "select", icon: MousePointer2, label: "Select", key: "V", digit: "1" },
  { id: "pan", icon: Hand, label: "Pan", key: "H", digit: "2" },
  { id: "pen", icon: Pencil, label: "Pen", key: "P", digit: "3" },
  { id: "text", icon: Type, label: "Text", key: "T", digit: "4" },
  { id: "memo", icon: StickyNote, label: "Memo", key: "M", digit: "5" },
  { id: "image", icon: ImageIcon, label: "Image", key: "I", digit: "6" },
  { id: "device", icon: Server, label: "AV Device", key: "D", digit: "7" },
  {
    id: "icon-text",
    icon: Component,
    label: "Icon + Label",
    key: "N",
    digit: "",
  },
  { id: "shape", icon: Shapes, label: "Shape", key: "S", digit: "" },
  { id: "zone", icon: Group, label: "Zone", key: "G", digit: "8" },
  { id: "rack", icon: Rows3, label: "Equipment Rack", key: "R", digit: "9" },
  {
    id: "titleblock",
    icon: LayoutTemplate,
    label: "Title Block",
    key: "B",
    digit: "0",
  },
];

export function Toolbar({
  tool,
  onToolChange,
  onClear,
  snapToGrid,
  onToggleSnap,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onClear: () => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
}) {
  const t = useT();
  return (
    <div
      role="toolbar"
      aria-label={t("Schematic")}
      className="main-toolbar glass-panel absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[14px] p-1.5"
    >
      {TOOLS.map(({ id, icon: Icon, label, key, digit }) => (
        <ToolButton
          key={id}
          tooltip={t(label)}
          shortcut={[digit, key].filter(Boolean).join(" / ")}
          aria-pressed={tool === id}
          onClick={() => onToolChange(id)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[9px] text-muted-foreground",
            "transition-all duration-150 active:scale-90",
            tool === id
              ? "bg-[var(--primary)] text-white shadow-[0_1px_3px_rgba(0,0,0,.2)]"
              : "hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/10",
          )}
        >
          <Icon size={16} strokeWidth={1.9} />
        </ToolButton>
      ))}
      <div className="mx-0.5 h-5 w-px bg-[var(--hairline)]" />
      <ToolButton
        tooltip={`${t("Snap to grid")}: ${t(snapToGrid ? "On" : "Off")}`}
        aria-pressed={snapToGrid}
        onClick={onToggleSnap}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[9px] transition-all duration-150 active:scale-90",
          snapToGrid
            ? "bg-[var(--primary)] text-white shadow-[0_1px_3px_rgba(0,0,0,.2)]"
            : "text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/10",
        )}
      >
        <Grid3x3 size={16} strokeWidth={1.9} />
      </ToolButton>
      <ToolButton
        tooltip={t("Clear canvas")}
        onClick={onClear}
        className="flex h-8 w-8 items-center justify-center rounded-[9px] text-muted-foreground transition-all duration-150 hover:bg-red-500/10 hover:text-red-500 active:scale-90"
      >
        <Trash2 size={16} strokeWidth={1.9} />
      </ToolButton>
    </div>
  );
}
