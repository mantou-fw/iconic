import { createContext, useContext } from "react";

/**
 * Signal classes used across AV schematic drawings — the drawing's legend.
 * Ships with the conventional AV riser/flow-diagram palette (audio green,
 * video blue, network purple, control amber, power red) but is fully user
 * editable: label, short code and colour can all be changed, and signals can
 * be added or removed. `key` is a stable id, generated once and never edited,
 * so renaming a signal never orphans the ports/cables already tagged with it.
 */
export type SignalDef = {
  key: string;
  label: string;
  short: string;
  color: string;
};

/** Kept as a type alias, not a union, now that signal keys are user-defined. */
export type SignalType = string;

export const DEFAULT_SIGNALS: SignalDef[] = [
  { key: "audio", label: "Audio", short: "AUD", color: "#16a34a" },
  { key: "video", label: "Video", short: "VID", color: "#2563eb" },
  { key: "network", label: "Network", short: "NET", color: "#9333ea" },
  { key: "control", label: "Control", short: "CTL", color: "#ea580c" },
  { key: "power", label: "Power", short: "PWR", color: "#dc2626" },
];

let signalSeq = 0;
export const nextSignalKey = () =>
  `sig${Date.now().toString(36)}${(++signalSeq).toString(36)}`;

export const makeSignal = (): SignalDef => ({
  key: nextSignalKey(),
  label: "New Signal",
  short: "SIG",
  color: "#64748b",
});

export const findSignal = (
  signals: SignalDef[],
  key: string | undefined,
): SignalDef =>
  signals.find((s) => s.key === key) ?? signals[0] ?? DEFAULT_SIGNALS[0]!;

export const signalColor = (signals: SignalDef[], key: string | undefined) =>
  findSignal(signals, key).color;

export const nextSignal = (signals: SignalDef[], key: string | undefined) => {
  const i = signals.findIndex((s) => s.key === key);
  return signals[(Math.max(i, 0) + 1) % signals.length]?.key ?? key;
};

/** The current drawing's legend, for node components that can't take props. */
export const SignalsContext = createContext<SignalDef[]>(DEFAULT_SIGNALS);
export const useSignals = () => useContext(SignalsContext);
