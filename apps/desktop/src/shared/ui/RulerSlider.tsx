import type { CSSProperties } from "react";

export function RulerSlider({ id, value, min, max, step, ariaLabel, ariaValueText, tickCount = 20, defaultValue, onValueChange }: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  ariaValueText?: string;
  tickCount?: number;
  defaultValue?: number;
  onValueChange(value: number): void;
}) {
  const progress = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const ticks = tickCount > 0 ? Array.from({ length: tickCount + 1 }, (_, index) => index / tickCount) : [];
  return <div className="ruler-slider" style={{ "--ruler-progress": progress } as CSSProperties}>
    <span className="ruler-slider-fill" aria-hidden="true" />
    <span className="ruler-slider-ticks" aria-hidden="true">{ticks.map((position, index) => <i key={index}
      data-major={index === 0 || index === tickCount || index % Math.max(1, Math.round(tickCount / 4)) === 0}
      data-filled={position < progress} style={{ left: `${position * 100}%` }} />)}</span>
    <input id={id} aria-label={ariaLabel} aria-valuetext={ariaValueText} type="range" min={min} max={max} step={step} value={value}
      onChange={(event) => onValueChange(Number(event.currentTarget.value))}
      onDoubleClick={() => { if (defaultValue !== undefined) onValueChange(defaultValue); }} />
  </div>;
}
