import { useT } from "@/lib/i18n";
import { memo, useEffect, useRef } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";

export type TextNodeData = {
  text: string;
  color: string;
  fontSize: number;
  /** Set once at creation so the caret lands in the new label. */
  autoFocus?: boolean;
};

function TextNodeImpl({
  id,
  data,
  selected,
}: NodeProps & { data: TextNodeData }) {
  const t = useT();
  const { updateNodeData } = useReactFlow();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data.autoFocus) return;
    ref.current?.focus();
    updateNodeData(id, { autoFocus: undefined });
  }, [data.autoFocus, id, updateNodeData]);

  return (
    <div className="h-full w-full min-h-[24px] min-w-[60px]">
      <NodeResizer isVisible={selected} minWidth={60} minHeight={24} />
      <textarea
        ref={ref}
        className="nodrag nopan h-full w-full resize-none bg-transparent leading-snug outline-none"
        style={{ color: data.color, fontSize: data.fontSize }}
        value={data.text}
        placeholder={t("Text…")}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
    </div>
  );
}

export const TextNode = memo(TextNodeImpl);
