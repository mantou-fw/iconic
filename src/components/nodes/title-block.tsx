import { memo } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";

import { useSignals } from "@/lib/signal-types";
import { cn } from "@/lib/utils";

export type TitleBlockData = {
  company: string;
  address: string;
  cityStateZip: string;
  phone: string;
  website: string;

  client: string;
  project: string;
  projectNumber: string;

  title: string;
  description: string;

  projectManager: string;
  drawnBy: string;
  checkedBy: string;

  date: string;
  revised: string;
  rev: string;
  scale: string;
  page: string;

  notice: string;
};

export const makeTitleBlockData = (): TitleBlockData => ({
  company: "COMPANY NAME",
  address: "Company Address",
  cityStateZip: "City, State  ZIP",
  phone: "+1 (000) 000-0000",
  website: "company.com",

  client: "",
  project: "",
  projectNumber: "",

  title: "AV SYSTEM SCHEMATIC",
  description: "Headend / Rack Schematics",

  projectManager: "",
  drawnBy: "",
  checkedBy: "",

  date: new Date().toISOString().slice(0, 10),
  revised: "",
  rev: "A",
  scale: "NONE",
  page: "1 OF 1",

  notice:
    "This drawing is the property of the company named above. It may not be reproduced, altered or disclosed without written permission.",
});

/* Bare inputs so the block reads as a drawing sheet, not a form. */
function Field({
  label,
  value,
  onChange,
  big,
  center,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  big?: boolean;
  center?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-[var(--hairline)] px-2 py-1">
      <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "nodrag nopan w-full rounded-[3px] bg-transparent outline-none",
          "focus:bg-background/70 focus:ring-2 focus:ring-[var(--primary)]/30",
          big ? "text-[13px] font-semibold" : "text-[10px]",
          center && "text-center",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

/** Two fields sharing a row, for the short ones. */
function Pair({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 [&>*]:border-b [&>*:first-child]:border-r">
      {children}
    </div>
  );
}

function TitleBlockImpl({ id, data, selected }: NodeProps & { data: TitleBlockData }) {
  const { updateNodeData } = useReactFlow();
  const signals = useSignals();
  const set = (key: keyof TitleBlockData) => (v: string) =>
    updateNodeData(id, { [key]: v });

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-[6px] border-2",
        "border-foreground/40 bg-[var(--glass)] backdrop-blur-xl",
        "shadow-[var(--shadow-card)]",
        selected && "border-[var(--primary)]",
      )}
    >
      <NodeResizer isVisible={selected} minWidth={240} minHeight={520} />

      {/* Company identity */}
      <div className="border-b-2 border-foreground/30 px-2 py-2">
        <input
          value={data.company}
          onChange={(e) => set("company")(e.target.value.toUpperCase())}
          className="nodrag nopan w-full bg-transparent text-[13px] font-bold tracking-tight outline-none"
        />
        {(["address", "cityStateZip", "phone", "website"] as const).map((k) => (
          <input
            key={k}
            value={data[k]}
            onChange={(e) => set(k)(e.target.value)}
            className="nodrag nopan w-full bg-transparent text-[9px] leading-snug text-muted-foreground outline-none"
          />
        ))}
      </div>

      {/* Signal legend — mirrors the cable colours used on the drawing */}
      <div className="border-b border-[var(--hairline)] px-2 py-1.5">
        <div className="mb-1 text-[7px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Signal Types
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {signals.map((s) => (
            <div key={s.key} className="flex items-center gap-1">
              <span
                className="h-1.5 w-3 rounded-[1px]"
                style={{ background: s.color }}
              />
              <span className="text-[8px] uppercase text-muted-foreground">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Device status key, as on issued AV packages */}
      <div className="border-b border-[var(--hairline)] px-2 py-1.5">
        <div className="mb-1 text-[7px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Device Status
        </div>
        <div className="flex gap-2.5">
          {[
            { label: "New", style: {} },
            {
              label: "Existing",
              style: {
                backgroundImage:
                  "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 4px)",
              },
            },
            { label: "Future", style: { borderStyle: "dashed" as const } },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1">
              <span
                className="h-2.5 w-4 border border-foreground/50 opacity-70"
                style={s.style}
              />
              <span className="text-[8px] uppercase text-muted-foreground">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Project identification */}
      <Field label="Client" value={data.client} onChange={set("client")} />
      <Field label="Project" value={data.project} onChange={set("project")} />
      <Field label="Title" value={data.title} onChange={set("title")} big center />
      <Field
        label="Description"
        value={data.description}
        onChange={set("description")}
      />

      <Pair>
        <Field
          label="Project Manager"
          value={data.projectManager}
          onChange={set("projectManager")}
        />
        <Field label="Drawn By" value={data.drawnBy} onChange={set("drawnBy")} />
      </Pair>
      <Pair>
        <Field label="Checked By" value={data.checkedBy} onChange={set("checkedBy")} />
        <Field label="Date" value={data.date} onChange={set("date")} mono />
      </Pair>
      <Pair>
        <Field label="Revised" value={data.revised} onChange={set("revised")} mono />
        <Field label="Rev" value={data.rev} onChange={set("rev")} mono center />
      </Pair>
      <Pair>
        <Field label="Scale" value={data.scale} onChange={set("scale")} center />
        <Field label="Page" value={data.page} onChange={set("page")} mono center />
      </Pair>
      <Field
        label="Project Number"
        value={data.projectNumber}
        onChange={set("projectNumber")}
        mono
      />

      {/* Legal notice */}
      <div className="flex-1 px-2 py-1.5">
        <div className="mb-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Notice
        </div>
        <textarea
          value={data.notice}
          onChange={(e) => set("notice")(e.target.value)}
          className="nodrag nopan h-full min-h-[48px] w-full resize-none bg-transparent text-[7.5px] leading-[1.35] text-muted-foreground outline-none"
        />
      </div>
    </div>
  );
}

export const TitleBlock = memo(TitleBlockImpl);
