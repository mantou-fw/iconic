import { useLocale, setLocale, type Locale, useT } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Boxes,
  BookOpen,
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
import { AIGuide } from "./ai-guide";

export type AIStatus = "off" | "connecting" | "live";

const STATUS_COLOR: Record<AIStatus, string> = {
  off: "#94a3b8",
  connecting: "#eab308",
  live: "#16a34a",
};

const STATUS_TEXT: Record<AIStatus, string> = {
  off: "MCP canvas bridge offline",
  connecting: "MCP canvas bridge connecting…",
  live: "MCP canvas bridge ready",
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
      <Icon
        size={14}
        strokeWidth={1.9}
        className="shrink-0 text-muted-foreground"
      />
      <span className="flex-1 text-left">{label}</span>
      {hint && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {hint}
        </span>
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
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeGuide = useCallback(() => {
    setShowGuide(false);
    trigger.current?.focus();
  }, []);
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
    <>
      <div ref={ref} className="absolute left-4 top-4 z-20">
        <button
          ref={trigger}
          aria-expanded={open}
          aria-label={t("Schematic menu")}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "glass-panel flex items-center gap-2 rounded-[12px] px-2.5 py-2 text-[13px] font-medium",
            "transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
          )}
        >
          <img src="/icon.svg" width={20} height={20} alt="" />
          <span>iconic</span>
          <span
            title={t(STATUS_TEXT[aiStatus])}
            aria-label={t(STATUS_TEXT[aiStatus])}
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
          <div className="glass-panel mt-1.5 w-[260px] rounded-[12px] p-1">
            <Item
              icon={FolderOpen}
              label={t("Open project…")}
              onClick={run(onOpen)}
            />
            <Item
              icon={Save}
              label={t("Save project")}
              hint=".json"
              onClick={run(onSaveJson)}
            />
            <div className="my-1 h-px bg-[var(--hairline)]" />
            <Item
              icon={Sheet}
              label={t("Export schedules")}
              hint=".xlsx"
              onClick={run(onExportXlsx)}
            />
            <div className="flex items-center gap-2 px-2 pb-1.5 pl-8">
              <FileDown size={11} className="text-muted-foreground/60" />
              <span className="text-[10px] leading-tight text-muted-foreground">
                {" "}
                {t("BOM · Devices · Cables")}{" "}
              </span>
            </div>

            <div className="my-1 h-px bg-[var(--hairline)]" />
            <Item
              icon={FileType}
              label={t("Print / Export PDF")}
              hint=".pdf"
              onClick={run(() => onExportImage("pdf"))}
            />
            <Item
              icon={ImageIcon}
              label={t("Export image")}
              hint=".png"
              onClick={run(() => onExportImage("png"))}
            />
            <Item
              icon={FileImage}
              label={t("Export vector")}
              hint=".svg"
              onClick={run(() => onExportImage("svg"))}
            />
            <Item
              icon={Globe}
              label={t("Interactive viewer")}
              hint=".html"
              onClick={run(onExportHtml)}
            />
            <div className="flex items-center gap-2 px-2 pb-1.5 pl-8">
              <FileDown size={11} className="text-muted-foreground/60" />
              <span className="text-[10px] leading-tight text-muted-foreground">
                {" "}
                {t("Read-only, self-contained, for clients")}{" "}
              </span>
            </div>

            <div className="my-1 h-px bg-[var(--hairline)]" />
            <Item
              icon={Boxes}
              label={t("3D room view")}
              hint={roomItemCount ? `${roomItemCount}` : undefined}
              onClick={run(onOpenRoom)}
            />

            <div className="my-1 h-px bg-[var(--hairline)]" />
            <Item
              icon={BookOpen}
              label={t("AI guide")}
              hint="MCP · Skill"
              onClick={run(() => setShowGuide(true))}
            />

            <div className="my-1 h-px bg-[var(--hairline)]" />
            <label className="flex items-center gap-2 px-2 py-2">
              <span className="flex-1 text-[13px]">{t("Language")}</span>
              <select
                aria-label={t("Language")}
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
                className="rounded-md border border-[var(--hairline)] bg-background px-2 py-1 text-[13px]"
              >
                <option value="en">English</option>
                <option value="zh-Hant">繁體中文</option>
                <option value="ja">日本語</option>
              </select>
            </label>
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 text-[13px]">{t("Appearance")}</span>
              <div className="flex items-center gap-0.5 rounded-[7px] bg-black/[0.06] p-0.5 dark:bg-white/10">
                {(
                  [
                    ["light", Sun, t("Light")],
                    ["dark", Moon, t("Dark")],
                    ["autocad", PenTool, t("AutoCAD drafting")],
                    ["system", Monitor, t("Follow system")],
                  ] as const
                ).map(([value, Icon, hint]) => (
                  <button
                    key={value}
                    title={t(hint)}
                    aria-label={t(hint)}
                    aria-pressed={theme === value}
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
      {showGuide && <AIGuide onClose={closeGuide} />}
    </>
  );
}
