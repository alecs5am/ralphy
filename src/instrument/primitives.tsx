import type { ComponentProps, ReactNode } from "react";

import { projectGlyphAsset } from "../lib/project-glyph";
import type { InstrumentScreenHeaderProps } from "./types";

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function InstrumentWidget({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} data-instrument-root="instrument-widget" className={classNames("instrument-widget", className)} />;
}

export function InstrumentPill({ className, ...props }: ComponentProps<"span">) {
  return <span {...props} className={classNames("instrument-pill", className)} />;
}

export function InstrumentIconButton({ label, tooltip = label, className, children, ...button }: ComponentProps<"button"> & {
  label: string;
  tooltip?: string;
}) {
  return <button {...button} type={button.type ?? "button"} className={classNames("instrument-icon-button", className)} aria-label={label} title={tooltip}>{children}</button>;
}

export function InstrumentCounter({ label, value }: { label: string; value: number | string }) {
  return <div className="instrument-counter" aria-label={`${label}: ${value}`}>
    <output>{value}</output>
    <span>{label}</span>
  </div>;
}

export function StatusDot({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "attention" | "error" | "success" }) {
  return <span className="instrument-status" data-tone={tone}>
    <span className="instrument-status-dot" aria-hidden="true" />
    <span>{label}</span>
  </span>;
}

export function DitherIdentity({ name, label = name, className }: { name: string; label?: string; className?: string }) {
  return <img className={classNames("instrument-dither-identity", className)} src={projectGlyphAsset(name)} alt={label} />;
}

export function InstrumentScreenHeader({ eyebrow, title, description, filters, counters, actions }: InstrumentScreenHeaderProps) {
  return <header className="instrument-screen-header" data-instrument-root="instrument-screen-header">
    <div className="instrument-screen-heading">
      {eyebrow && <p className="instrument-screen-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="instrument-screen-description">{description}</p>}
    </div>
    {(filters || counters || actions) && <div className="instrument-screen-controls">
      {filters && <div className="instrument-screen-filters">{filters}</div>}
      {counters && <div className="instrument-screen-counters">{counters}</div>}
      {actions && <div className="instrument-screen-actions">{actions}</div>}
    </div>}
  </header>;
}

export function InstrumentEmptyState({ title, reason, children }: { title: string; reason: string; children?: ReactNode }) {
  return <section className="instrument-empty-state" data-instrument-root="instrument-empty-state" aria-label={title}>
    <h2>{title}</h2>
    <p>{reason}</p>
    {children}
  </section>;
}
