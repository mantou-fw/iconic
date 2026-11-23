import { useT } from "@/lib/i18n";
import type { ReloadTaskState } from "@/lib/reload-task";

export type ReloadRecoveryProps = {
  state: ReloadTaskState;
  onReload: () => void;
  onCancel: () => void;
};

const actionClass = "rounded-md px-2 py-1 text-sm font-medium underline underline-offset-4 hover:bg-black/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10";

/** A secondary escape route when the browser keeps a failed module import cached. */
export function ReloadRecovery({ state, onReload, onCancel }: ReloadRecoveryProps) {
  const t = useT();
  const saving = state?.phase === "saving";
  return (
    <div className="mt-3 border-t border-[var(--hairline)] pt-3 text-sm">
      <p className="text-muted-foreground">{t("If Retry still fails, save your work and reload the app.")}</p>
      {saving && <p role="status" className="mt-2">{t("Saving before reload…")}</p>}
      {state?.phase === "error" && <div role="alert" className="mt-2 break-words">
        <p>{t("Reload stopped. Your work is still open.")}</p>
        {state.message && <p className="mt-1">{t(state.message)}</p>}
        <p className="mt-1 text-muted-foreground">{t("Use File → Save project in the schematic to export a backup.")}</p>
      </div>}
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        <button className={actionClass} disabled={saving} onClick={onReload}>{t("Save and reload")}</button>
        {saving && <button className={actionClass} onClick={onCancel}>{t("Cancel")}</button>}
      </div>
    </div>
  );
}
