import { useRef, type KeyboardEvent, type PointerEvent } from "react";

interface SnappySliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  onValueChange(value: number): void;
  values?: number[];
  className?: string;
  disabled?: boolean;
  defaultValue?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function decimals(step: number): number {
  const fraction = `${step}`.split(".")[1];
  return fraction?.length ?? 0;
}

export function SnappySlider({
  value,
  min,
  max,
  step,
  ariaLabel,
  onValueChange,
  values = [],
  className = "",
  disabled = false,
  defaultValue,
}: SnappySliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const safeRange = Math.max(Number.EPSILON, max - min);
  const percent = clamp(((value - min) / safeRange) * 100, 0, 100);

  const commit = (next: number) => {
    const stepped = min + Math.round((next - min) / step) * step;
    onValueChange(Number(clamp(stepped, min, max).toFixed(decimals(step))));
  };

  const valueAt = (clientX: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    commit(min + clamp((clientX - bounds.left) / bounds.width, 0, 1) * safeRange);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    valueAt(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    valueAt(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - step;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + step;
    if (event.key === "PageDown") next = value - step * 10;
    if (event.key === "PageUp") next = value + step * 10;
    if (event.key === "Home") next = min;
    if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  return (
    <div
      ref={rootRef}
      className={`snappy-slider ${className}`.trim()}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        if (!disabled && defaultValue !== undefined) commit(defaultValue);
      }}
    >
      <span className="snappy-slider-track">
        <span className="snappy-slider-range" style={{ width: `${percent}%` }} />
        {values.map((mark) => (
          <span
            className="snappy-slider-mark"
            key={mark}
            style={{ left: `${((mark - min) / safeRange) * 100}%` }}
          />
        ))}
      </span>
      <span className="snappy-slider-thumb" style={{ left: `${percent}%` }} />
    </div>
  );
}
