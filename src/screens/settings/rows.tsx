import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { SelectMenu } from "../../components/ui/SelectMenu";

/**
 * The settings row vocabulary. Every page is assembled from these; none of them own a
 * page's data, and none of them are page-specific. A new settings page is new data plus
 * these components, never new geometry.
 *
 * The ink roles below repeat on every page, so they are named once here: a run of utilities
 * is still one decision, and a page reaches for the name instead of restating the run.
 */

/** A counted number or a version: Doto, never tracked. */
export const NUMBER = "font-display font-extrabold tracking-normal text-ink";
/** A trailing mono label on a row title. It is 9px text a reader has to read, so it takes the
 *  readable muted ink; `-decorative` is for marks that carry no information. */
export const META = "flex-none font-code type-mono-xs tracking-caps text-muted";
/** A code or a state read as a fact: mono, but the theme's own ink. */
export const CODE = "font-code type-mono-sm tracking-caps text-ink";
/** A path or an identifier inside a description. */
export const MONO = "font-code type-meta tracking-code text-muted";
/** A mono caps note under a plate. */
export const NOTE = "m-0 font-code type-mono-xs tracking-caps leading-note text-muted";
export const NOTE_ALERT = "m-0 font-code type-mono-xs tracking-caps leading-note text-alert";
/** A section label above a plate, and the search results label that reads as one. Its indent is
 *  the plate's own chrome plus a row's padding, so the label starts on the same vertical as the
 *  row titles under it rather than a few pixels off them. */
export const SECTION_LABEL = "m-0 flex items-center gap-2.25 pl-4.5 font-code type-mono-sm font-normal tracking-mono text-muted";
/** A row title, and the copy column that carries it. */
export const ROW_TITLE = "flex items-center gap-2.25 type-ui font-normal text-ink";
export const ROW_COPY = "flex min-w-0 flex-1 flex-col gap-0.75";
/**
 * Row padding is the density knob: Compact and Comfortable are the same row at a different
 * pad, read from the desk's own data-density rather than declared as two row heights.
 */
export const ROW_PAD = "px-3 py-settings-row [[data-density=compact]_&]:py-settings-row-compact";
/**
 * A row or a search result. Handoff 13's block-in-block reaches settings here: the plate below
 * is panel *chrome* and a row is a card standing on it, so a row draws its own surface instead
 * of being an invisible strip that only appears under the pointer. Same reason its radius is the
 * inner-card one rather than the row radius a surfaceless strip took.
 */
export const ROW_SHELL = "flex items-center gap-4 rounded-inner bg-card text-left";
/** The chrome every list of rows stands on: one step below the cards it holds. */
export const PLATE = "flex flex-col gap-0.5 rounded-panel bg-panel p-1.5";
/** A widget block on the desk: same panel radius, its own surface. */
export const WIDGET_LIGHT = "rounded-panel bg-card p-3";
export const WIDGET_DARK = "rounded-panel bg-instrument p-3";

/**
 * One action, six shapes. The tone decides the surface pair, `surface` says what the button
 * stands on — on a black widget "primary" is the light pill, never the desk's primary, which
 * would be black on black. "panel" is the third case: a control sitting directly on panel
 * chrome takes the card surface, because the field it takes inside a card is a step *away*
 * from the chrome and in the light family the two are a shade apart.
 */
export function action({ size, tone, round, surface }: {
  size?: "sm" | "lg";
  tone?: "primary" | "danger" | "quiet";
  round?: boolean;
  surface?: "instrument" | "panel";
} = {}): string {
  const shape = round
    // A round control is a square grid cell, so it owns the display and drops side padding.
    ? `grid place-items-center px-0 ${size === "sm" ? "size-7 type-sm" : "size-control-md type-ui"}`
    : size === "sm" ? "inline-flex h-control-md px-3.25 type-sm"
    : size === "lg" ? "inline-flex h-control-lg px-4 type-ui"
    : "inline-flex h-8 px-3.75 type-ui";
  const paint = surface === "instrument"
    ? tone === "primary" ? "bg-on-instrument text-instrument"
      : tone === "danger" ? "bg-danger text-danger-ink hover:bg-danger-hover"
      : tone === "quiet" ? "bg-transparent text-on-instrument-muted hover:text-on-instrument"
      : "bg-ghost text-on-instrument hover:bg-ghost-hover"
    : tone === "primary" ? "bg-brand text-brand-ink hover:opacity-88"
      : tone === "danger" ? "bg-danger text-danger-ink hover:bg-danger-hover"
      : round ? "bg-field text-muted hover:bg-row-hover hover:text-ink"
      : surface === "panel" ? "bg-card text-ink hover:bg-row-hover"
      : "bg-field text-ink hover:bg-row-hover";
  // Disabled drops to the quiet pair — except a round control, which is already quiet and
  // keeps its ink so the glyph does not fade twice.
  const quiet = surface === "instrument"
    ? "disabled:bg-ghost disabled:text-on-instrument-muted-decorative focus-visible:outline-focus-on-instrument"
    : round ? "disabled:bg-field focus-visible:outline-ink"
    : surface === "panel" ? "disabled:bg-card disabled:text-muted-decorative focus-visible:outline-ink"
    : "disabled:bg-field disabled:text-muted-decorative focus-visible:outline-ink";
  return `flex-none items-center gap-2 rounded-control ${shape} ${paint} ${quiet}`;
}

export function Section({ title, count, children }: { title: string; count?: ReactNode; children: ReactNode }) {
  return <section className="flex flex-col gap-1.5">
    <h2 className={SECTION_LABEL}>{title}{count !== undefined && <span className={NUMBER}>{count}</span>}</h2>
    {children}
  </section>;
}

export function Plate({ single, children }: { single?: boolean; children: ReactNode }) {
  // A plate holding a single statement instead of a list of rows: the padding moves to the
  // plate so the statement does not sit in a row inside a plate for no reason.
  return <div className={single
    ? "flex flex-row items-center gap-4 rounded-panel bg-card p-3"
    : PLATE
  }>{children}</div>;
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
  // A roadmap row states the missing contract instead of drawing a dead control, so it is
  // quieter than a live row and does not answer the pointer.
  const surface = target ? "" : flash ? "bg-row-hover" : "hover:bg-row-hover";
  return <div
    className={`${ROW_SHELL} ${tall ? "items-start" : "items-center"} ${flat ? "px-3 py-2.25" : ROW_PAD} ${surface} transition-colors duration-slow ease-instrument`}
    id={id}
  >
    <span className={ROW_COPY}>
      <strong className={target ? `${ROW_TITLE} text-muted` : ROW_TITLE}>
        {title}{meta && <span className={META}>{meta}</span>}
      </strong>
      {description && <small className="type-label leading-row text-muted">{description}</small>}
    </span>
    {children}
  </div>;
}

export type StatusTone = "ok" | "warn" | "bad" | "off";

/**
 * Status is always dot plus text, so the tone is never the only signal. On a black widget
 * the dot takes the on-instrument ink: the theme's own ink is black on black in light.
 */
const DOT_TONE: Record<StatusTone, string> = {
  ok: "bg-ink",
  warn: "bg-transparent [box-shadow:inset_0_0_0_1.5px_var(--instrument-text-secondary-readable)]",
  bad: "bg-alert",
  off: "bg-muted-decorative opacity-50",
};
const DOT_TONE_ON_INSTRUMENT: Record<StatusTone, string> = {
  ok: "bg-on-instrument",
  warn: "bg-transparent [box-shadow:inset_0_0_0_1.5px_var(--instrument-text-on-dark-primary)]",
  bad: "bg-alert",
  off: "bg-on-instrument-muted-decorative opacity-50",
};

export function Dot({ tone = "ok", surface }: { tone?: StatusTone; surface?: "instrument" }) {
  const paint = surface === "instrument" ? DOT_TONE_ON_INSTRUMENT[tone] : DOT_TONE[tone];
  return <i className={`size-settings-dot flex-none rounded-control ${paint}`} aria-hidden="true" />;
}

const STATUS_TONE: Record<StatusTone, string> = {
  ok: "text-muted",
  warn: "text-muted",
  bad: "text-alert",
  /* "NOT REPORTED" is a reading, not a decoration: it is the only thing in its column and it is
     9.5px mono. On the decorative ink it measured 3.07:1 against the row card, and 3.51:1 against
     the flatter plate it stood on before -- under the bar either way. The paired dot stays quiet;
     the dot is the mark, the text is the information. */
  off: "text-muted",
};

/** A status run without its dot: the diagnostics table already carries one in its own column. */
export function statusText(tone: StatusTone = "ok"): string {
  return `inline-flex flex-none items-center gap-2 font-code type-mono-sm tracking-status ${STATUS_TONE[tone]}`;
}

export function Status({ tone = "ok", children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={statusText(tone)}><Dot tone={tone} />{children}</span>;
}

export function DesignTarget() {
  return <span className={`inline-flex items-center gap-2 ${META}`}><Dot tone="off" />DESIGN TARGET</span>;
}

export function Toggle({ label, on, alert, onChange }: {
  label: string;
  on: boolean;
  alert?: boolean;
  onChange(next: boolean): void;
}) {
  const track = on
    ? alert ? "justify-end bg-alert" : "justify-end bg-desk-primary"
    : "justify-start bg-field";
  const knob = on ? alert ? "bg-on-instrument" : "bg-desk-primary-ink" : "bg-muted-decorative";
  return <button
    className={`flex w-settings-toggle h-settings-toggle-track flex-none items-center rounded-control px-0.75 transition-colors duration-normal ease-instrument focus-visible:outline-ink ${track}`}
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={on}
    onClick={() => onChange(!on)}
  ><i className={`size-settings-knob rounded-control ${knob}`} aria-hidden="true" /></button>;
}

export function Segmented<Value extends string>({ label, value, options, onChange }: {
  label: string;
  value: Value;
  options: readonly Value[];
  onChange(next: Value): void;
}) {
  return <div className="inline-flex flex-none gap-0.5 rounded-control bg-field p-0.75" role="group" aria-label={label}>
    {options.map((option) => <button
      className={`inline-flex h-control-sm items-center rounded-control px-3 type-label focus-visible:outline-ink ${
        option === value ? "bg-desk-primary text-desk-primary-ink" : "text-muted"}`}
      type="button"
      key={option}
      aria-pressed={option === value}
      onClick={() => onChange(option)}
    >{option}</button>)}
  </div>;
}

/**
 * The shared select trigger is a dark two-column grid by default; on the settings desk it is
 * a sunken light pill whose value, meta and chevron sit on one line. The trigger is used
 * app-wide, so the settings surface is passed through its className rather than restated on
 * the shared control.
 */
export function SettingsSelect<Value extends string>({ label, value, options, mono, onChange }: {
  label: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string; meta?: string }>;
  mono?: boolean;
  onChange(next: Value): void;
}) {
  return <SelectMenu
    tone="caller"
    className={`inline-flex h-control-md max-w-settings-select gap-2.25 rounded-control bg-field px-3 text-ink hover:bg-row-hover focus-visible:outline-ink focus-visible:outline-offset-2 ${
      mono ? "font-code type-mono-md" : "type-sm"}`}
    overlayOwner="settings.rows"
    ariaLabel={label}
    value={value}
    options={options.map((option) => ({ ...option }))}
    align="end"
    onValueChange={onChange}
  />;
}

/* A field is a sunken pill on the light plate; wide is the same field filling its row. */
export const FIELD = "flex h-control-lg w-settings-field flex-none rounded-control bg-field px-3.25 type-ui text-ink placeholder:text-muted focus-visible:outline-ink";
export const FIELD_WIDE = "flex h-9 flex-1 rounded-control bg-field px-3.5 font-code type-label text-ink placeholder:text-muted focus-visible:outline-ink";

export function Stepper({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?(value: number): string;
  onChange(next: number): void;
}) {
  return <div className="flex flex-none items-center gap-1.5">
    <button className={action({ size: "sm", round: true })} type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
      <Minus size={12} strokeWidth={2} aria-hidden="true" />
    </button>
    <output
      className="grid w-settings-stepper h-control-md place-items-center rounded-field bg-field font-display type-lg font-extrabold text-ink focus-visible:outline-ink"
      aria-label={label}
    >{format ? format(value) : value}</output>
    <button className={action({ size: "sm", round: true })} type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
      <Plus size={12} strokeWidth={2} aria-hidden="true" />
    </button>
  </div>;
}

/** Proportion as counted dots rather than a bar: a share you can read without a legend. */
export function DotGrid({ filled, total = 20 }: { filled: number; total?: number }) {
  return <span className="flex min-w-0 flex-1 gap-1" aria-hidden="true">
    {Array.from({ length: total }, (_, index) => <i
      className={`size-settings-tick rounded-control ${index < filled ? "bg-ink" : "bg-unreviewed"}`}
      key={index}
    />)}
  </span>;
}

export function LedBar({ percent, segments = 24 }: { percent: number; segments?: number }) {
  const filled = Math.round(percent / 100 * segments);
  return <span className="flex min-w-0 flex-1 gap-1" aria-hidden="true">
    {Array.from({ length: segments }, (_, index) => <i
      className={`h-settings-tick flex-1 rounded-control ${index < filled ? "bg-ink" : "bg-unreviewed"}`}
      key={index}
    />)}
  </span>;
}
