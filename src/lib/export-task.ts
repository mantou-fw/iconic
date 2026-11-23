import { FeatureLoadError } from "./feature-loader";

export type ExportFormat = "xlsx" | "png" | "svg" | "pdf" | "html";
export type ExportTaskState = {
  format: ExportFormat;
  phase: "preparing" | "ready" | "error";
  message?: string;
  loadFailed?: boolean;
} | null;

/** One download at a time; cancelled/unmounted tasks cannot update the UI. */
export function createExportTask(onState: (state: ExportTaskState) => void) {
  let active: AbortController | undefined;
  const cancel = () => {
    active?.abort();
    active = undefined;
  };

  return {
    cancel,
    dismiss: () => { cancel(); onState(null); },
    async run(format: ExportFormat, operation: (signal: AbortSignal) => Promise<void>) {
      if (active) return;
      const controller = new AbortController();
      active = controller;
      onState({ format, phase: "preparing" });
      try {
        await operation(controller.signal);
        if (!controller.signal.aborted) onState({ format, phase: "ready" });
      } catch (error) {
        if (!controller.signal.aborted) onState({
          format, phase: "error", message: error instanceof Error ? error.message : String(error),
          ...(error instanceof FeatureLoadError ? { loadFailed: true } : {}),
        });
      } finally {
        if (active === controller) active = undefined;
      }
    },
  };
}
