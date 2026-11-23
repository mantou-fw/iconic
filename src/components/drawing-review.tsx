import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import type { DrawingFinding } from "@/lib/drawing-checks";

const groups = [
  ["error", "Errors"], ["warning", "Warnings"], ["info", "Information"],
] as const;
const action = "rounded-md px-3 py-1.5 underline focus-visible:outline-2";

export function DrawingReview({ findings, format, onClose, onProceed, onJump, onExplain }: {
  findings: DrawingFinding[];
  format?: string;
  onClose: () => void;
  onProceed: () => void;
  onJump: (finding: DrawingFinding) => void;
  onExplain: (id: string, text: string) => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-label={t("Drawing checks")}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      className="m-auto w-[min(42rem,calc(100%-2rem))] max-h-[85vh] overflow-auto rounded-xl border border-[var(--hairline)] bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("Drawing checks")}{format && <span className="ml-2 text-sm text-muted-foreground">{format.toUpperCase()}</span>}</h2>
        <button className={action} onClick={onClose}>{t("Close")}</button>
      </header>
      {findings.length === 0 && <p>{t("No drawing findings.")}</p>}
      {groups.map(([severity, title]) => {
        const items = findings.filter((finding) => finding.severity === severity);
        if (!items.length) return null;
        return <section key={severity} className="mb-4">
          <h3 className="mb-2 font-medium">{t(title)} ({items.length})</h3>
          <ul className="space-y-2">{items.map((finding) => (
            <li key={JSON.stringify([finding.kind, finding.id, finding.message])} className="rounded-lg border border-[var(--hairline)] p-3 text-sm">
              <button className="font-medium underline" onClick={() => onJump(finding)}>{finding.label}</button>
              <p>{t(finding.message)}</p>
              {finding.details?.map((detail, index) => <p className="text-muted-foreground" key={index}>{detail}</p>)}
              {finding.canExplain && <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => {
                event.preventDefault();
                onExplain(finding.id, String(new FormData(event.currentTarget).get("explanation") ?? ""));
              }}>
                <label className="min-w-0 flex-1">
                  <span className="block">{t("Adapter or converter explanation")}</span>
                  <input key={finding.explanation} name="explanation" defaultValue={finding.explanation} maxLength={2000}
                    className="w-full rounded border bg-transparent px-2 py-1" />
                </label>
                <button className={action} type="submit">{t("Save explanation")}</button>
              </form>}
            </li>
          ))}</ul>
        </section>;
      })}
      {format && <footer className="flex justify-end border-t border-[var(--hairline)] pt-3">
        <button className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" onClick={onProceed}>{t("Proceed with export")}</button>
      </footer>}
    </dialog>
  );
}
