import { useId, type ReactNode } from "react";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function SegmentedControl<Value extends string>({ value, options, ariaLabel, onValueChange }: {
  value: Value;
  options: readonly SegmentedControlOption<Value>[];
  ariaLabel: string;
  onValueChange(value: Value): void;
}) {
  const name = useId();
  // The visible option owns focus; suppress the global field ring on its label.
  return <div className="segmented-control inline-flex min-w-0 max-w-full flex-wrap items-center gap-0.5 rounded-field bg-surface-sunken p-0.5" role="radiogroup" aria-label={ariaLabel}>
    {options.map((option, index) => <label className="relative shrink-0 cursor-pointer rounded-chip outline-none" key={option.value} title={option.label}>
      <input className="peer sr-only" type="radio" name={name} value={option.value} aria-label={option.label} aria-describedby={option.count === undefined ? undefined : `${name}-${index}-count`} checked={value === option.value} onChange={() => onValueChange(option.value)} />
      <span className="flex h-7 items-center gap-1.5 rounded-chip px-2 type-sm whitespace-nowrap text-muted peer-not-checked:hover:text-ink peer-checked:bg-instrument peer-checked:text-on-instrument peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-ink peer-checked:peer-focus-visible:outline-focus-on-instrument">
        {option.icon && <span className="flex shrink-0 items-center" aria-hidden="true">{option.icon}</span>}
        <span>{option.label}</span>
        {option.count !== undefined && <span id={`${name}-${index}-count`} className={`segmented-control-count tabular-nums ${value === option.value ? "text-on-instrument-muted" : "text-muted"}`}>{option.count}<span className="sr-only">{option.count === 1 ? " item" : " items"}</span></span>}
      </span>
    </label>)}
  </div>;
}
