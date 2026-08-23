import type { ComponentProps, ReactNode } from "react";

import { projectGlyphAsset } from "../lib/project-glyph";
import type { InstrumentScreenHeaderProps } from "./types";

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

/* One widget plate: R14 cell, the theme's light widget, the theme's ink. Surface and ink travel
   together -- a caller that repaints one has to repaint both, and a half-override is what makes
   a plate paint its own colour as text. */
const PLATE = "grid gap-3 rounded-cell bg-surface p-4 text-ink";
/* A row of intrinsic marks: a pill, a counter, a filter, an action. */
const MARK_ROW = "inline-flex items-center gap-1";
/* The header collapses on the route's content row, never on the window. */
const HEADER_STACK = "@max-screen-header/main-region:flex-col";
const CONTROLS_WRAP = "@max-screen-header/main-region:flex-wrap";

export function InstrumentWidget({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} data-instrument-root="instrument-widget" className={classNames("instrument-widget", PLATE, className)} />;
}

export function InstrumentPill({ className, ...props }: ComponentProps<"span">) {
  return <span {...props} className={classNames("instrument-pill", MARK_ROW, "min-h-control-sm rounded-control bg-surface-sunken px-2 text-muted", className)} />;
}

export function InstrumentIconButton({ label, tooltip = label, className, children, ...button }: ComponentProps<"button"> & {
  label: string;
  tooltip?: string;
}) {
  /* The ring is the theme ink in both themes: on the sunken light widget it is #141414 under
     the light theme and #F2F2F0 under the dark one, so one utility replaces the three
     theme-scoped outline rules this control used to carry. */
  return <button
    {...button}
    type={button.type ?? "button"}
    className={classNames("instrument-icon-button", "inline-grid size-control-md place-items-center rounded-control bg-surface-sunken text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", className)}
    aria-label={label}
    title={tooltip}
  >{children}</button>;
}

export function InstrumentCounter({ label, value }: { label: string; value: number | string }) {
  return <div className="instrument-counter grid gap-0 text-muted" aria-label={`${label}: ${value}`}>
    <output className="font-display type-counter font-extrabold text-ink">{value}</output>
    <span className="type-xs">{label}</span>
  </div>;
}

type StatusTone = "neutral" | "attention" | "error" | "success";

/* An alarm is the one colour in the system; everything else is a step of grey. */
function statusFill(tone: StatusTone): string {
  if (tone === "attention") return "bg-alert-bright";
  if (tone === "error") return "bg-alert";
  return tone === "success" ? "bg-ink" : "bg-unreviewed";
}

export function StatusDot({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return <span className={`instrument-status ${MARK_ROW} text-muted`} data-tone={tone}>
    <span className={`instrument-status-dot size-2 rounded-control ${statusFill(tone)}`} aria-hidden="true" />
    <span>{label}</span>
  </span>;
}

export function DitherIdentity({ name, label = name, className }: { name: string; label?: string; className?: string }) {
  return <img className={classNames("instrument-dither-identity", "size-8 rounded-chip object-cover", className)} src={projectGlyphAsset(name)} alt={label} />;
}

export function InstrumentScreenHeader({ eyebrow, title, description, filters, counters, actions }: InstrumentScreenHeaderProps) {
  return <header className={`instrument-screen-header flex items-start justify-between gap-4 ${HEADER_STACK}`} data-instrument-root="instrument-screen-header">
    <div className="instrument-screen-heading grid gap-1">
      {eyebrow && <p className="instrument-screen-eyebrow m-0 type-xs text-muted uppercase">{eyebrow}</p>}
      <h1 className="m-0">{title}</h1>
      {description && <p className="instrument-screen-description m-0 text-muted">{description}</p>}
    </div>
    {(filters || counters || actions) && <div className={`instrument-screen-controls flex items-center gap-2 ${CONTROLS_WRAP}`}>
      {filters && <div className={`instrument-screen-filters ${MARK_ROW}`}>{filters}</div>}
      {counters && <div className={`instrument-screen-counters ${MARK_ROW}`}>{counters}</div>}
      {actions && <div className={`instrument-screen-actions ${MARK_ROW}`}>{actions}</div>}
    </div>}
  </header>;
}

export function InstrumentEmptyState({ title, reason, children }: { title: string; reason: string; children?: ReactNode }) {
  return <section className={`instrument-empty-state ${PLATE}`} data-instrument-root="instrument-empty-state" aria-label={title}>
    <h2 className="m-0">{title}</h2>
    <p className="m-0 text-muted">{reason}</p>
    {children}
  </section>;
}
