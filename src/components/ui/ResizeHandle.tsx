import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

interface ResizeHandleProps {
  ariaLabel: string;
  orientation: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  direction: 1 | -1;
  className: string;
  onChange(value: number): void;
  onActiveChange(active: boolean): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function ResizeHandle({
  ariaLabel,
  orientation,
  value,
  min,
  max,
  defaultValue,
  direction,
  className,
  onChange,
  onActiveChange,
}: ResizeHandleProps) {
  const drag = useRef<{ pointerId: number; start: number; value: number } | null>(null);
  const coordinate = (event: PointerEvent) =>
    orientation === "vertical" ? event.clientX : event.clientY;

  useEffect(() => () => {
    if (!drag.current) return;
    drag.current = null;
    onActiveChange(false);
  }, [onActiveChange]);

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    onActiveChange(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (orientation === "vertical" && event.key === "ArrowLeft") delta = -16;
    if (orientation === "vertical" && event.key === "ArrowRight") delta = 16;
    if (orientation === "horizontal" && event.key === "ArrowUp") delta = -16;
    if (orientation === "horizontal" && event.key === "ArrowDown") delta = 16;
    if (delta === 0) return;
    event.preventDefault();
    onChange(clamp(value + delta * direction, min, max));
  };

  return (
    <div
      className={`panel-resize-handle ${className}`}
      role="separator"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onDoubleClick={() => onChange(clamp(defaultValue, min, max))}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          pointerId: event.pointerId,
          start: coordinate(event),
          value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        onActiveChange(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const delta = (coordinate(event) - current.start) * direction;
        onChange(clamp(current.value + delta, min, max));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        onActiveChange(false);
      }}
    />
  );
}
