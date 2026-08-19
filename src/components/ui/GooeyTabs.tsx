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
      className={`mode-segments gooey-tabs gooey-tabs-${size}`}
      role="tablist"
      aria-label={ariaLabel}
      style={{ "--gooey-index": activeIndex, "--gooey-count": tabs.length } as React.CSSProperties}
    >
      <svg className="gooey-tabs-filter" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <span className="gooey-tabs-blobs" style={{ filter: `url(#${filterId})` }} aria-hidden="true">
        <span className="gooey-tabs-blob gooey-tabs-blob-leading" />
        <span className="gooey-tabs-blob gooey-tabs-blob-trailing" />
      </span>
      {tabs.map((tab) => (
        <button
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
          {tab.count === undefined ? null : <small>{tab.count}</small>}
        </button>
      ))}
    </div>
  );
}
