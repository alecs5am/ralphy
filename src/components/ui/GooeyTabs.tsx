import { useId, useRef, type ReactNode } from "react";

export type GooeyTab<Value extends string> = {
  value: Value;
  label: ReactNode;
  ariaLabel?: string;
  tooltip?: string;
  count?: number;
  id?: string;
  controlsId?: string;
  focusFallback?: boolean;
};

interface GooeyTabsProps<Value extends string> {
  tabs: readonly GooeyTab<Value>[];
  value: Value;
  onValueChange(value: Value): void;
  size?: "m" | "s";
  ariaLabel: string;
}

/* The strip is a fixed-column grid: one cell per tab, so the blob can be placed by index rather
   than measured. `--gooey-cell-width` and `--gooey-cell-height` are declared here, once, from the
   size's role keys -- `m` is the pair `:root` already carries, so only `s` restates it -- and the
   blob and the buttons read them back. A caller that wants narrower cells overrides the property on
   the strip (UnitViewer does), which is why the cell size is a custom property rather than a width
   utility on each part; project.css reads the same width for the stage strip's column template.

   `isolation: isolate` is load-bearing: the blobs sit at z-index -1 inside the strip, and without
   a stacking context of its own the strip would paint them behind the surface it stands on.
   `mode-segments` and `gooey-tabs*` stay as the hooks tokens.css and the geometry harness read. */
const STRIP = "mode-segments gooey-tabs relative inline-grid flex-none auto-cols-(--gooey-cell-width) grid-flow-col overflow-hidden rounded-control p-0.75 isolate";
const CELL_M = "gooey-tabs-m";
const CELL_S = "gooey-tabs-s [--gooey-cell-width:var(--gooey-cell-s-width)] [--gooey-cell-height:var(--gooey-cell-s-height)]";
/* The strip is a well and the blob is the fill standing in it, so the two surfaces are stated as
   one pair per size. Only the "s" strip is mounted today; "m" is the same decision one step up. */
const WELL_M = "bg-surface";
const WELL_S = "bg-surface-sunken";
const BLOB = "gooey-tabs-blob absolute block h-full w-(--gooey-cell-width) rounded-control [transform:translateX(calc(var(--gooey-index)*var(--gooey-cell-width)))] transition-transform ease-instrument motion-reduce:transition-none";
const FILL_M = "bg-surface-sunken";
const FILL_S = "bg-surface-hover";
/* A tab states its rest ink; the selected and hovered pair is the line below. */
const TAB = "inline-flex h-(--gooey-cell-height) items-center justify-center gap-1.5 rounded-control px-2 type-sm whitespace-nowrap text-muted hover:text-ink aria-selected:text-ink";

export function moveGooeyTab<Value extends string>(
  tabs: readonly GooeyTab<Value>[],
  value: Value,
  key: string,
): Value {
  if (key === "Home") return tabs[0]?.value ?? value;
  if (key === "End") return tabs[tabs.length - 1]?.value ?? value;
  const direction = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (!direction) return value;
  const index = Math.max(0, tabs.findIndex((tab) => tab.value === value));
  return tabs[(index + direction + tabs.length) % tabs.length]?.value ?? value;
}

export function GooeyTabs<Value extends string>({
  tabs,
  value,
  onValueChange,
  size = "m",
  ariaLabel,
}: GooeyTabsProps<Value>) {
  const rawId = useId();
  const filterId = `gooey-tabs-${rawId.replace(/:/g, "")}`;
  const buttons = useRef<Partial<Record<Value, HTMLButtonElement>>>({});
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === value));

  return (
    <div
      className={`${STRIP} ${size === "s" ? `${CELL_S} ${WELL_S}` : `${CELL_M} ${WELL_M}`}`}
      role="tablist"
      aria-label={ariaLabel}
      style={{ "--gooey-index": activeIndex, "--gooey-count": tabs.length } as React.CSSProperties}
    >
      <svg className="gooey-tabs-filter pointer-events-none absolute size-0" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <span className="gooey-tabs-blobs pointer-events-none absolute inset-0.75 -z-1" style={{ filter: `url(#${filterId})` }} aria-hidden="true">
        <span className={`${BLOB} ${size === "s" ? FILL_S : FILL_M} gooey-tabs-blob-leading duration-gooey-lead`} />
        {/* Reduced motion keeps one blob, not two overlapping ones. The blanket that used to hide
            this one lives unlayered in 05-unowned.css, so `block` above -- an !important utility in
            @layer utilities -- now beats it: the decision has to be stated on the element. */}
        <span className={`${BLOB} ${size === "s" ? FILL_S : FILL_M} gooey-tabs-blob-trailing duration-gooey-trail motion-reduce:hidden`} />
      </span>
      {tabs.map((tab) => (
        <button
          className={TAB}
          id={tab.id}
          type="button"
          role="tab"
          aria-label={tab.ariaLabel}
          aria-controls={tab.controlsId}
          aria-selected={value === tab.value}
          title={tab.tooltip}
          data-tooltip={tab.tooltip}
          data-media-focus-fallback={tab.focusFallback ? "true" : undefined}
          tabIndex={value === tab.value ? 0 : -1}
          ref={(button) => { buttons.current[tab.value] = button ?? undefined; }}
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
          onKeyDown={(event) => {
            const next = moveGooeyTab(tabs, value, event.key);
            if (next === value) return;
            event.preventDefault();
            onValueChange(next);
            buttons.current[next]?.focus();
          }}
        >
          {tab.label}
          {tab.count === undefined ? null : <small className="type-xs text-current">{tab.count}</small>}
        </button>
      ))}
    </div>
  );
}
