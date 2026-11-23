export type ReloadTaskState = { phase: "saving" | "error"; message?: string } | null;

/** Reload is always explicit, and only follows a successful save of current work. */
export function createReloadTask(onState: (state: ReloadTaskState) => void) {
  let active: AbortController | undefined;
  const cancel = () => {
    active?.abort();
    active = undefined;
  };

  return {
    cancel,
    dismiss: () => { cancel(); onState(null); },
    async run({ save, isCurrent, reload }: {
      save: () => Promise<void>;
      isCurrent: () => boolean;
      reload: () => void;
    }) {
      if (active) return;
      const controller = new AbortController();
      active = controller;
      onState({ phase: "saving" });
      try {
        await save();
        if (controller.signal.aborted) return;
        if (!isCurrent()) throw new Error("The drawing changed while saving. Please try Save and reload again.");
        reload();
        if (!controller.signal.aborted) onState(null);
      } catch (error) {
        if (!controller.signal.aborted) onState({
          phase: "error", message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (active === controller) active = undefined;
      }
    },
  };
}
