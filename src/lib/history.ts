import { useCallback, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";

export type Snapshot = { nodes: Node[]; edges: Edge[] };

const LIMIT = 60;

/**
 * Undo/redo over whole-graph snapshots.
 *
 * Snapshots are cheap here (a few hundred nodes at most) and far more robust
 * than replaying inverse operations, which would have to understand every
 * command, parenting change and auto-route in the app.
 *
 * `record` is called after a change has settled; `suspended` guards the window
 * while an undo is being applied so restoring state never records itself.
 */
export function useHistory() {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const suspended = useRef(false);
  const [, bump] = useState(0);

  const clone = (s: Snapshot): Snapshot => ({
    nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data } })),
    edges: s.edges.map((e) => ({ ...e, data: { ...e.data } })),
  });

  const record = useCallback((snapshot: Snapshot) => {
    if (suspended.current) return;
    const last = past.current[past.current.length - 1];
    // Selection-only changes are not worth an undo step.
    if (last && sameShape(last, snapshot)) return;

    past.current.push(clone(snapshot));
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    bump((n) => n + 1);
  }, []);

  /** Runs `apply` without the resulting change being recorded. */
  const withoutRecording = useCallback((apply: () => void) => {
    suspended.current = true;
    apply();
    // Release after the state settles, past the debounce that calls record().
    setTimeout(() => {
      suspended.current = false;
    }, 250);
  }, []);

  const undo = useCallback(
    (current: Snapshot, apply: (s: Snapshot) => void) => {
      // The tail of `past` is the current state, so step back past it.
      if (past.current.length < 2) return false;
      const popped = past.current.pop()!;
      future.current.push(popped);
      const target = past.current[past.current.length - 1]!;
      withoutRecording(() => apply(clone(target)));
      bump((n) => n + 1);
      return true;
    },
    [withoutRecording],
  );

  const redo = useCallback(
    (apply: (s: Snapshot) => void) => {
      const next = future.current.pop();
      if (!next) return false;
      past.current.push(next);
      withoutRecording(() => apply(clone(next)));
      bump((n) => n + 1);
      return true;
    },
    [withoutRecording],
  );

  return {
    record,
    undo,
    redo,
    canUndo: past.current.length > 1,
    canRedo: future.current.length > 0,
  };
}

/** Compares everything an undo should care about, ignoring selection. */
function sameShape(a: Snapshot, b: Snapshot): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) {
    return false;
  }
  const key = (s: Snapshot) =>
    JSON.stringify({
      n: s.nodes.map((n) => [
        n.id,
        n.parentId ?? null,
        Math.round(n.position.x),
        Math.round(n.position.y),
        n.width ?? null,
        n.height ?? null,
        n.data,
      ]),
      e: s.edges.map((e) => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.data]),
    });
  return key(a) === key(b);
}
