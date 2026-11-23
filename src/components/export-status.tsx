import { useT } from "@/lib/i18n";
import type { ExportTaskState } from "@/lib/export-task";
import { ReloadRecovery, type ReloadRecoveryProps } from "./reload-recovery";

const actionClass = "rounded-md px-2 py-1 text-sm font-medium underline underline-offset-4 hover:bg-black/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10";

export function ExportStatus({ state, onRetry, onDismiss, recovery }: {
  state: ExportTaskState;
  onRetry: () => void;
  onDismiss: () => void;
  recovery: ReloadRecoveryProps;
}) {
  const t = useT();
  if (!state) return null;
  const failed = state.phase === "error";
  const pending = state.phase === "preparing";

  return (
    <aside className="glass-panel absolute right-4 top-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-[12px] p-3 text-foreground"
      aria-label={t("Export status")}>
      <p role={failed ? "alert" : "status"} aria-atomic="true" className="text-sm font-medium">
        {t(pending ? "Preparing export…" : failed ? "Export failed." : "Export file prepared.")} · {state.format.toUpperCase()}
      </p>
      {failed && <p className="mt-1 break-words text-sm text-muted-foreground">{t(state.message || "Try again, or choose another export format.")}</p>}
      <div className="mt-2 flex justify-end gap-1">
        {failed && <button className={actionClass} disabled={recovery.state?.phase === "saving"} onClick={onRetry}>{t("Retry")}</button>}
        <button className={actionClass} onClick={onDismiss}>{t(pending ? "Cancel" : "Close")}</button>
      </div>
      {failed && state.loadFailed && <ReloadRecovery {...recovery} />}
    </aside>
  );
}
