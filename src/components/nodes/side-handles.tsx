import { Handle, type Position } from "@xyflow/react";

/** One connectable point on a side: overlapping source + target handles. */
export function SideHandles({ position, id }: { position: Position; id: string }) {
  const style = {
    background: "var(--muted-foreground)",
    border: "1.5px solid #fff",
    width: 8,
    height: 8,
    boxShadow: "0 1px 2px rgba(0,0,0,.25)",
  };
  return (
    <>
      <Handle type="target" position={position} id={`${id}-target`} style={style} />
      <Handle type="source" position={position} id={`${id}-source`} style={style} />
    </>
  );
}
