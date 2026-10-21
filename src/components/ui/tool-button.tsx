import { useId, useState, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";

/** A tooltip shared by pointer and keyboard users, outside clipping containers. */
export function ToolButton({
  tooltip,
  shortcut,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string;
  shortcut?: string;
}) {
  const id = useId();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const show = (target: HTMLButtonElement) => {
    const rect = target.getBoundingClientRect();
    setPosition({
      x: Math.max(110, Math.min(innerWidth - 110, rect.left + rect.width / 2)),
      y: rect.bottom + 9,
    });
  };
  return (
    <>
      <button
        {...props}
        type={props.type ?? "button"}
        aria-label={props["aria-label"] ?? tooltip}
        aria-describedby={position ? id : undefined}
        onMouseEnter={(event) => {
          show(event.currentTarget);
          props.onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setPosition(null);
          props.onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          show(event.currentTarget);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setPosition(null);
          props.onBlur?.(event);
        }}
        onClick={(event) => {
          setPosition(null);
          props.onClick?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPosition(null);
            event.stopPropagation();
          }
          props.onKeyDown?.(event);
        }}
      >
        {children}
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="tool-tooltip"
            style={{ left: position.x, top: position.y }}
          >
            <span>{tooltip}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
