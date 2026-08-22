import type { ReactElement } from "react";

import type { ProjectDockItem } from "./types";

export function ProjectDock<Id extends string>({ active, items, onSelect }: {
  active: Id;
  items: readonly ProjectDockItem<Id>[];
  onSelect(id: Id): void;
}): ReactElement {
  return <nav className="project-dock" aria-label="Project view" role="tablist">
    {items.map(({ id, label, icon: Icon, disabledReason }) => <button
      id={`project-tab-${id}`}
      type="button"
      role="tab"
      aria-label={label}
      aria-controls={`project-panel-${id}`}
      aria-selected={active === id}
      tabIndex={active === id ? 0 : -1}
      aria-disabled={disabledReason ? "true" : undefined}
      data-media-focus-fallback={id === "media" ? "true" : undefined}
      title={disabledReason ?? label}
      className={active === id ? "is-active" : ""}
      key={id}
      onClick={() => { if (!disabledReason) onSelect(id); }}
      onKeyDown={(event) => {
        const current = items.findIndex((item) => item.id === id);
        const target = event.key === "Home" ? 0
          : event.key === "End" ? items.length - 1
            : event.key === "ArrowRight" || event.key === "ArrowDown" ? (current + 1) % items.length
              : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (current - 1 + items.length) % items.length
                : -1;
        if (target < 0) return;
        event.preventDefault();
        const next = items[target];
        if (next.disabledReason) return;
        onSelect(next.id);
        requestAnimationFrame(() => document.getElementById(`project-tab-${next.id}`)?.focus({ preventScroll: true }));
      }}
    ><Icon aria-hidden="true" size={16} strokeWidth={1.7} /><span>{label}</span></button>)}
  </nav>;
}
