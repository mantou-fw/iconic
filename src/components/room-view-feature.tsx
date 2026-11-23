import { Component, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { roomViewFeature } from "@/lib/feature-imports";
import { ReloadRecovery, type ReloadRecoveryProps } from "./reload-recovery";

type RoomModule = Awaited<ReturnType<typeof roomViewFeature.load>>;
type RoomProps = ComponentProps<RoomModule["RoomView"]>;
type FeatureState = { module: RoomModule; failed?: false } | { module?: undefined; failed: boolean };

/** A failed optional view must never unmount the drawing underneath it. */
class RoomBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function RoomStatus({ failed, onRetry, onClose, recovery }: {
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
  recovery: ReloadRecoveryProps;
}) {
  const t = useT();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  const actionClass = "rounded-md border border-[var(--hairline)] px-3 py-2 text-sm font-medium hover:bg-black/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10";
  return (
    <section className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--canvas)] p-6" aria-label={t("3D room view")}>
      <div className="max-w-sm text-foreground">
        <p role={failed ? "alert" : "status"} className="text-base font-semibold">
          {t(failed ? "Could not open the 3D room view." : "Opening 3D room view…")}
        </p>
        {failed && <p className="mt-2 text-sm text-muted-foreground">{t("Retry, or return to the schematic.")}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {failed && <button className={actionClass} disabled={recovery.state?.phase === "saving"} onClick={onRetry}>{t("Retry")}</button>}
          <button ref={close} className={actionClass} onClick={onClose}>{t("Return to schematic")}</button>
        </div>
        {failed && <ReloadRecovery {...recovery} />}
      </div>
    </section>
  );
}

export function RoomViewFeature({ recovery, ...props }: RoomProps & { recovery: ReloadRecoveryProps }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FeatureState>(() => {
    const module = roomViewFeature.peek();
    return module ? { module } : { failed: false };
  });

  useEffect(() => {
    let disposed = false;
    void roomViewFeature.load().then(
      (module) => { if (!disposed) setState({ module }); },
      () => { if (!disposed) setState({ failed: true }); },
    );
    return () => { disposed = true; };
  }, [attempt]);

  const retry = () => {
    recovery.onCancel();
    setState({ failed: false });
    setAttempt((value) => value + 1);
  };
  const fallback = (failed: boolean) => <RoomStatus failed={failed} onRetry={retry} onClose={props.onClose} recovery={recovery} />;
  if (!state.module) return fallback(state.failed);
  const View = state.module.RoomView;
  return <RoomBoundary key={attempt} fallback={fallback(true)}><View {...props} /></RoomBoundary>;
}
