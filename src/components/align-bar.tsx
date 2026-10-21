import { ToolButton } from "./ui/tool-button";
import { useT } from "@/lib/i18n";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from "lucide-react";

import type { AlignMode, DistributeMode } from "@/lib/align";

const ALIGN: {
  mode: AlignMode;
  icon: typeof AlignStartVertical;
  label: string;
}[] = [
  { mode: "left", icon: AlignStartVertical, label: "Align left" },
  { mode: "center-h", icon: AlignCenterVertical, label: "Align centres" },
  { mode: "right", icon: AlignEndVertical, label: "Align right" },
  { mode: "top", icon: AlignStartHorizontal, label: "Align top" },
  { mode: "middle-v", icon: AlignCenterHorizontal, label: "Align middles" },
  { mode: "bottom", icon: AlignEndHorizontal, label: "Align bottom" },
];

const DISTRIBUTE: {
  mode: DistributeMode;
  icon: typeof AlignStartVertical;
  label: string;
}[] = [
  {
    mode: "horizontal",
    icon: AlignHorizontalDistributeCenter,
    label: "Distribute horizontally",
  },
  {
    mode: "vertical",
    icon: AlignVerticalDistributeCenter,
    label: "Distribute vertically",
  },
];

/** Appears only while several nodes are selected. */
export function AlignBar({
  count,
  onAlign,
  onDistribute,
}: {
  count: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
}) {
  const t = useT();
  const button =
    "flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground transition-all duration-150 hover:bg-black/[0.06] hover:text-foreground active:scale-90 dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="align-toolbar glass-panel absolute left-1/2 top-[70px] z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] p-1.5">
      <span className="px-1.5 text-[10px] tabular-nums text-muted-foreground">
        {count} {t("selected")}{" "}
      </span>
      <div className="mx-0.5 h-5 w-px bg-[var(--hairline)]" />
      {ALIGN.map(({ mode, icon: Icon, label }) => (
        <ToolButton
          key={mode}
          tooltip={t(label)}
          onClick={() => onAlign(mode)}
          className={button}
        >
          <Icon size={15} strokeWidth={1.9} />
        </ToolButton>
      ))}
      <div className="mx-0.5 h-5 w-px bg-[var(--hairline)]" />
      {DISTRIBUTE.map(({ mode, icon: Icon, label }) => (
        <ToolButton
          key={mode}
          tooltip={`${t(label)}${count < 3 ? " — " + t("Needs 3 or more") : ""}`}
          disabled={count < 3}
          onClick={() => onDistribute(mode)}
          className={button}
        >
          <Icon size={15} strokeWidth={1.9} />
        </ToolButton>
      ))}
    </div>
  );
}
