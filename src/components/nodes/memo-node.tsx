import { memo, useEffect, useRef } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

export type MemoNodeData = {
  text: string;
  color: string;
  fontSize: number;
  autoFocus?: boolean;
};

function MemoNodeImpl({ id, data, selected }: NodeProps & { data: MemoNodeData }) {
  const { updateNodeData } = useReactFlow();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data.autoFocus) return;
    ref.current?.focus();
    updateNodeData(id, { autoFocus: undefined });
  }, [data.autoFocus, id, updateNodeData]);

  return (
    <div
      className={cn(
        "flex h-full w-full min-h-[80px] min-w-[100px] flex-col rounded-[10px] p-2.5",
        "shadow-[0_1px_2px_rgba(0,0,0,.06),0_6px_18px_rgba(0,0,0,.10)]",
        selected && "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--canvas)]",
      )}
      style={{ background: data.color }}
    >
      <NodeResizer isVisible={selected} minWidth={100} minHeight={80} />
      <textarea
        ref={ref}
        className="nodrag nopan h-full w-full flex-1 resize-none bg-transparent leading-snug text-black/80 outline-none placeholder:text-black/30"
        style={{ fontSize: data.fontSize }}
        value={data.text}
        placeholder="Note…"
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
    </div>
  );
}

export const MemoNode = memo(MemoNodeImpl);
