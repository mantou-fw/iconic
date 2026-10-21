import { useT } from "@/lib/i18n";
import { memo, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";

import {
  findSignal,
  nextSignal,
  signalColor,
  useSignals,
  type SignalType,
} from "@/lib/signal-types";
import { cn } from "@/lib/utils";

export type DevicePort = {
  id: string;
  label: string;
  connector: string;
  signal: SignalType;
  dir: "in" | "out";
};

export type AVDeviceData = {
  /** Drawing reference designator, e.g. "DSP-01". */
  tag: string;
  name: string;
  manufacturer: string;
  model: string;
  ports: DevicePort[];
  /** Shape version, so the legacy cleanup below only ever runs once. */
  v?: number;
};

const SCHEMA_V = 2;

let portSeq = 0;
const newPortId = () =>
  `p${Date.now().toString(36)}${(++portSeq).toString(36)}`;

/**
 * Datatype names inherited from the generic schema node. They are meaningless
 * on an AV drawing, where the column holds a connector type instead.
 */
const GENERIC_TYPES = new Set([
  "string",
  "text",
  "number",
  "int",
  "integer",
  "float",
  "double",
  "decimal",
  "boolean",
  "bool",
  "date",
  "datetime",
  "timestamp",
  "uuid",
  "json",
  "object",
  "array",
  "null",
  "—",
]);

const cleanConnector = (value: unknown) => {
  const s = typeof value === "string" ? value.trim() : "";
  return GENERIC_TYPES.has(s.toLowerCase()) ? "" : s;
};

export const makePort = (
  dir: "in" | "out",
  signal: SignalType = "audio",
): DevicePort => ({
  id: newPortId(),
  label: dir === "in" ? "Input" : "Output",
  connector: "",
  signal,
  dir,
});

export const makeDeviceData = (): AVDeviceData => ({
  tag: "DEV-01",
  name: "Device",
  manufacturer: "",
  model: "",
  ports: [makePort("in"), makePort("out")],
  v: SCHEMA_V,
});

/** Upgrades nodes saved by the earlier generic schema node. */
export function normalizeDeviceData(data: any): AVDeviceData {
  if (Array.isArray(data?.ports)) {
    if (data.v === SCHEMA_V) return data as AVDeviceData;
    return {
      ...data,
      v: SCHEMA_V,
      ports: data.ports.map((p: DevicePort) => ({
        ...p,
        connector: cleanConnector(p.connector),
      })),
    } as AVDeviceData;
  }
  const legacyFields = Array.isArray(data?.fields) ? data.fields : [];
  return {
    tag: "DEV-01",
    name: data?.label ?? "Device",
    manufacturer: "",
    model: "",
    v: SCHEMA_V,
    ports: legacyFields.map((f: any, i: number) => ({
      id: f.id ?? newPortId(),
      label: f.name ?? `Port ${i + 1}`,
      connector: cleanConnector(f.type),
      signal: "audio" as SignalType,
      dir: (i % 2 === 0 ? "in" : "out") as "in" | "out",
    })),
  };
}

/* Bare, borderless inputs so the block reads as a drawing, not a form. */
function CellInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "nodrag nopan rounded-md bg-transparent px-1 outline-none transition-colors",
        "focus:bg-background/80 focus:ring-2 focus:ring-[var(--primary)]/35",
        "placeholder:text-muted-foreground/45",
        className,
      )}
    />
  );
}

function PortRow({
  port,
  nodeId,
  onChange,
  onRemove,
}: {
  port: DevicePort;
  nodeId: string;
  onChange: (patch: Partial<DevicePort>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const signals = useSignals();
  const color = signalColor(signals, port.signal);
  const isIn = port.dir === "in";

  const swatch = (
    <button
      title={`${findSignal(signals, port.signal).label} — ${t("Click to change")}`}
      onClick={() => onChange({ signal: nextSignal(signals, port.signal) })}
      className="nodrag nopan h-3.5 w-[3px] shrink-0 rounded-full transition-transform hover:scale-y-125"
      style={{ background: color }}
    />
  );

  const label = (
    <CellInput
      value={port.label}
      placeholder={t("Signal")}
      onChange={(e) => onChange({ label: e.target.value })}
      className={cn(
        "min-w-0 flex-1 text-[11px] leading-none",
        !isIn && "text-right",
      )}
    />
  );

  // Optional: an empty connector shows nothing until the row is hovered.
  const connector = (
    <CellInput
      value={port.connector}
      placeholder={t("conn")}
      title={t("Connector type (optional)")}
      onChange={(e) => onChange({ connector: e.target.value })}
      className={cn(
        "w-11 shrink-0 font-mono text-[9px] uppercase leading-none text-muted-foreground",
        "placeholder:text-transparent group-hover:placeholder:text-muted-foreground/40",
        "focus:placeholder:text-muted-foreground/40",
        !isIn && "text-right",
      )}
    />
  );

  return (
    <div
      className={cn(
        "group relative flex h-[26px] items-center gap-1 transition-colors",
        "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
        isIn ? "pl-2 pr-1" : "pl-1 pr-2",
      )}
    >
      <Handle
        type={isIn ? "target" : "source"}
        position={isIn ? Position.Left : Position.Right}
        id={port.id}
        style={{
          background: color,
          border: "1.5px solid #fff",
          width: 9,
          height: 9,
          boxShadow: "0 1px 2px rgba(0,0,0,.25)",
        }}
      />
      {isIn ? (
        <>
          {swatch}
          {label}
          {connector}
        </>
      ) : (
        <>
          {connector}
          {label}
          {swatch}
        </>
      )}
      <button
        title={t("Remove port")}
        onClick={onRemove}
        className={cn(
          "nodrag nopan absolute top-0.5 opacity-0 transition-opacity group-hover:opacity-100",
          "rounded-sm p-0.5 text-muted-foreground hover:text-destructive",
          isIn ? "right-0" : "left-0",
        )}
      >
        <X size={9} />
      </button>
    </div>
  );
}

function AVDeviceNodeImpl({
  id,
  data,
  selected,
}: NodeProps & { data: AVDeviceData }) {
  const t = useT();
  const { updateNodeData } = useReactFlow();

  const patch = useCallback(
    (p: Partial<AVDeviceData>) => updateNodeData(id, p),
    [id, updateNodeData],
  );

  const setPorts = useCallback(
    (ports: DevicePort[]) => patch({ ports }),
    [patch],
  );

  const inputs = data.ports.filter((p) => p.dir === "in");
  const outputs = data.ports.filter((p) => p.dir === "out");

  const updatePort = (portId: string, p: Partial<DevicePort>) =>
    setPorts(data.ports.map((x) => (x.id === portId ? { ...x, ...p } : x)));

  const removePort = (portId: string) =>
    setPorts(data.ports.filter((x) => x.id !== portId));

  const addPort = (dir: "in" | "out") =>
    setPorts([...data.ports, makePort(dir)]);

  return (
    <div
      className={cn(
        "w-[268px] overflow-hidden rounded-[12px] border border-[var(--hairline)]",
        "bg-[var(--glass)] text-card-foreground backdrop-blur-xl",
        "shadow-[var(--shadow-card)] transition-shadow duration-150",
        selected &&
          "border-[var(--primary)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_25%,transparent),var(--shadow-panel)]",
      )}
    >
      {/* Title block — reference designator, description, make/model */}
      <div className="border-b border-[var(--hairline)] bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
        <div className="flex items-center gap-1.5">
          <CellInput
            value={data.tag}
            placeholder={t("TAG")}
            title={t("Reference designator")}
            onChange={(e) => patch({ tag: e.target.value.toUpperCase() })}
            className="w-[64px] shrink-0 rounded-md border border-[var(--hairline)] bg-background/70 py-[1px] text-center font-mono text-[10px] font-semibold uppercase leading-tight tracking-tight"
          />
          <CellInput
            value={data.name}
            placeholder={t("Description")}
            onChange={(e) => patch({ name: e.target.value })}
            className="min-w-0 flex-1 text-[12px] font-semibold leading-tight"
          />
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <CellInput
            value={data.manufacturer}
            placeholder={t("Manufacturer")}
            onChange={(e) => patch({ manufacturer: e.target.value })}
            className="min-w-0 flex-1 text-[9px] uppercase tracking-wide text-muted-foreground"
          />
          <CellInput
            value={data.model}
            placeholder={t("Model")}
            onChange={(e) => patch({ model: e.target.value })}
            className="w-[96px] shrink-0 text-right font-mono text-[9px] text-muted-foreground"
          />
        </div>
      </div>

      {/* Port field — inputs left, outputs right, per drawing convention */}
      <div className="grid grid-cols-2 py-0.5">
        <div className="border-r border-[var(--hairline)]">
          <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            {" "}
            {t("In")}{" "}
          </div>
          {inputs.map((port) => (
            <PortRow
              key={port.id}
              port={port}
              nodeId={id}
              onChange={(p) => updatePort(port.id, p)}
              onRemove={() => removePort(port.id)}
            />
          ))}
          <button
            onClick={() => addPort("in")}
            className="nodrag nopan flex w-full items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground/80 transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <Plus size={10} strokeWidth={2.2} /> {t("Input")}{" "}
          </button>
        </div>
        <div>
          <div className="px-2 pt-1 pb-0.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            {" "}
            {t("Out")}{" "}
          </div>
          {outputs.map((port) => (
            <PortRow
              key={port.id}
              port={port}
              nodeId={id}
              onChange={(p) => updatePort(port.id, p)}
              onRemove={() => removePort(port.id)}
            />
          ))}
          <button
            onClick={() => addPort("out")}
            className="nodrag nopan flex w-full items-center justify-end gap-1 px-2 py-1 text-[10px] text-muted-foreground/80 transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <Plus size={10} strokeWidth={2.2} /> {t("Output")}{" "}
          </button>
        </div>
      </div>
    </div>
  );
}

export const AVDeviceNode = memo(AVDeviceNodeImpl);
