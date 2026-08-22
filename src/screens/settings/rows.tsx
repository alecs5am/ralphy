import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { SelectMenu } from "../../components/ui/SelectMenu";

/**
 * The settings row vocabulary. Every page is assembled from these; none of them own a
 * page's data, and none of them are page-specific. A new settings page is new data plus
 * these components, never new geometry.
 */

export function Section({ title, count, children }: { title: string; count?: ReactNode; children: ReactNode }) {
  return <section className="settings-section">
    <h2>{title}{count !== undefined && <span className="settings-number">{count}</span>}</h2>
    {children}
  </section>;
}

export function Plate({ single, children }: { single?: boolean; children: ReactNode }) {
  return <div className={single ? "settings-plate is-single" : "settings-plate"}>{children}</div>;
}

export function Row({ title, meta, description, tall, flat, flash, target, id, children }: {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  tall?: boolean;
  flat?: boolean;
  flash?: boolean;
  target?: boolean;
  id?: string;
  children?: ReactNode;
}) {
  const classes = ["settings-row"];
  if (tall) classes.push("is-tall");
  if (flat) classes.push("is-flat");
  if (flash) classes.push("is-flash");
  if (target) classes.push("is-target");
  return <div className={classes.join(" ")} id={id}>
    <span className="settings-row-copy">
      <strong>{title}{meta && <span className="settings-meta">{meta}</span>}</strong>
      {description && <small>{description}</small>}
    </span>
    {children}
  </div>;
}

export type StatusTone = "ok" | "warn" | "bad" | "off";

export function Dot({ tone = "ok" }: { tone?: StatusTone }) {
  return <i className="settings-dot" data-tone={tone} aria-hidden="true" />;
}

export function Status({ tone = "ok", children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className="settings-status" data-tone={tone}><Dot tone={tone} />{children}</span>;
}

export function DesignTarget() {
  return <span className="settings-target"><Dot tone="off" />DESIGN TARGET</span>;
}

export function Toggle({ label, on, alert, onChange }: {
  label: string;
  on: boolean;
  alert?: boolean;
  onChange(next: boolean): void;
}) {
  return <button
    className={alert && on ? "settings-toggle is-alert" : "settings-toggle"}
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={on}
    data-on={on || undefined}
    onClick={() => onChange(!on)}
  ><i aria-hidden="true" /></button>;
}

export function Segmented<Value extends string>({ label, value, options, onChange }: {
  label: string;
  value: Value;
  options: readonly Value[];
  onChange(next: Value): void;
}) {
  return <div className="settings-segmented" role="group" aria-label={label}>
    {options.map((option) => <button
      className={option === value ? "is-selected" : undefined}
      type="button"
      key={option}
      aria-pressed={option === value}
      onClick={() => onChange(option)}
    >{option}</button>)}
  </div>;
}

export function SettingsSelect<Value extends string>({ label, value, options, mono, onChange }: {
  label: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string; meta?: string }>;
  mono?: boolean;
  onChange(next: Value): void;
}) {
  return <SelectMenu
    className={mono ? "settings-select is-mono" : "settings-select"}
    overlayOwner="settings.rows"
    ariaLabel={label}
    value={value}
    options={options.map((option) => ({ ...option }))}
    align="end"
    onValueChange={onChange}
  />;
}

export function Keycaps({ tokens, size, tone }: { tokens: readonly string[]; size?: "lg"; tone?: "inverse" | "sunken" }) {
  const classes = ["settings-keycaps"];
  if (size === "lg") classes.push("is-lg");
  if (tone) classes.push(`is-${tone}`);
  return <span className={classes.join(" ")}>{tokens.map((token, index) => <kbd key={`${token}-${index}`}>{token}</kbd>)}</span>;
}

export function Stepper({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?(value: number): string;
  onChange(next: number): void;
}) {
  return <div className="settings-stepper">
    <button className="settings-action is-round is-sm" type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
      <Minus size={12} strokeWidth={2} aria-hidden="true" />
    </button>
    <output aria-label={label}>{format ? format(value) : value}</output>
    <button className="settings-action is-round is-sm" type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
      <Plus size={12} strokeWidth={2} aria-hidden="true" />
    </button>
  </div>;
}

/** Proportion as counted dots rather than a bar: a share you can read without a legend. */
export function DotGrid({ filled, total = 20 }: { filled: number; total?: number }) {
  return <span className="settings-dotgrid" aria-hidden="true">
    {Array.from({ length: total }, (_, index) => <i className={index < filled ? "is-filled" : undefined} key={index} />)}
  </span>;
}

export function LedBar({ percent, segments = 24 }: { percent: number; segments?: number }) {
  const filled = Math.round(percent / 100 * segments);
  return <span className="settings-led" aria-hidden="true">
    {Array.from({ length: segments }, (_, index) => <i className={index < filled ? "is-filled" : undefined} key={index} />)}
  </span>;
}
