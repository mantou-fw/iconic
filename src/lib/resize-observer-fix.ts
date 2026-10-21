/**
 * "ResizeObserver loop completed with undelivered notifications" is a benign
 * browser notice: the observer had more work queued than it could deliver in
 * one pass, so it reschedules. React Flow trips it constantly because
 * measuring a node can change layout, which the observer then re-reports.
 *
 * Break the feedback loop at its source, before any development overlay
 * observes it:
 * deliver observations on the next animation frame, which lets layout settle
 * before the callback runs so the notice is never raised at all.
 *
 * Must be imported before anything that constructs a ResizeObserver.
 */
const Native = globalThis.ResizeObserver;

declare global {
  // eslint-disable-next-line no-var
  var __avResizeObserverPatched: boolean | undefined;
}

if (Native && !globalThis.__avResizeObserverPatched) {
  class FramedResizeObserver extends Native {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        // Each batch gets its own frame; never coalesce, or entries are lost.
        requestAnimationFrame(() => {
          try {
            callback(entries, observer);
          } catch {
            // A disconnected observer firing late is not worth surfacing.
          }
        });
      });
    }
  }

  globalThis.ResizeObserver = FramedResizeObserver;
  globalThis.__avResizeObserverPatched = true;
}

export {};
