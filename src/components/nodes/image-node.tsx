import { useT } from "@/lib/i18n";
import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

export type ImageNodeData = {
  src: string;
};

function ImageNodeImpl({
  data,
  selected,
}: NodeProps & { data: ImageNodeData }) {
  const t = useT();
  return (
    <div
      className={cn(
        "h-full w-full min-h-[60px] min-w-[60px] overflow-hidden rounded-[10px]",
        "shadow-[0_1px_2px_rgba(0,0,0,.06),0_6px_18px_rgba(0,0,0,.10)]",
        selected &&
          "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--canvas)]",
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={40}
        minHeight={40}
        keepAspectRatio
      />
      {data.src ? (
        <img
          src={data.src}
          alt=""
          className="pointer-events-none h-full w-full select-none object-contain"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[10px] border border-dashed border-[var(--hairline)] text-xs text-muted-foreground">
          {" "}
          {t("No image")}{" "}
        </div>
      )}
    </div>
  );
}

export const ImageNode = memo(ImageNodeImpl);
