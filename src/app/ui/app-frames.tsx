/**
 * The frames the app puts around a route: the fallback while a lazy screen arrives, the return
 * bar over a route reached from the Overview, the error plate, and the chord that reaches the
 * panel beside the chat.
 *
 * None of them is a route and none of them is a screen, which is why they were sitting in
 * `App.tsx` -- and why they belong beside it rather than inside it.
 */
import { useEffect, useRef, type ReactNode } from "react";

import { bridge } from "@/shared/api/ipc";
import { InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { COMMAND_BUTTON } from "@/shared/ui/route-chrome";
import type { WorkspaceDestination } from "@/shared/model/workbench";
import { unitsInstrumentStates } from "@/pages/project";

export function ProjectScreenLoadingFallback() {
  return (
    <InstrumentScreenRoot descriptor={unitsInstrumentStates} state="loading">
      {/* Same as the loaded screen: the mode surface owns the desk wash, so this fallback
          neither repaints it nor paints over the view panel's page card. */}
      <main className="main-region project-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 pb-6">
        <div className="project-indexing flex min-h-0 flex-1 flex-col items-center justify-center gap-1 type-xs text-muted">
          {/* The indeterminate run is a real child, not a `::after`: a pseudo-element needs a
              `content: ""` that no named utility states, and the plate has room for the span. */}
          <span className="loading-line h-0.5 w-27.5 overflow-hidden bg-ink/8">
            <span className="block h-full w-2/5 animate-indexing bg-ink motion-reduce:animate-none" />
          </span>
          <span>Opening project…</span>
        </div>
      </main>
    </InstrumentScreenRoot>
  );
}

/* The main process forwards a "show me the chat" shortcut. Under the chat lens the chat is
   permanent -- it is the lens -- so there is nothing for the chord to show; what it toggles there
   is the panel beside it. Under the desk lens it does nothing at all: the lens pair is what
   changes lens, and a chord that silently changed lens made the pair a decoration. */
export function InstrumentRightRailShortcut({ onToggle, children }: { onToggle(): void; children: ReactNode }) {
  useEffect(() => bridge.onToggleRightPanel(onToggle), [onToggle]);
  return children;
}

export function WorkspaceDestinationFrame({ destination, onBack, children }: {
  destination: WorkspaceDestination;
  onBack(): void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = root.current?.querySelector<HTMLElement>("h1") ?? root.current?.querySelector<HTMLElement>("h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [destination]);
  const context = destination.context;
  /* The destination frame is a column that hands its whole remaining height to the route it
     wraps, whichever route that is — so the child's own flex guard is stated here. */
  return <div className="workspace-destination flex min-h-0 flex-1 flex-col [&>.main-region]:min-h-0 [&>.main-region]:flex-1" ref={root}>
    <div className="workspace-return-bar flex min-h-9.5 flex-none items-center gap-3 bg-surface px-4 py-2 type-xs text-muted">
      <button className="rounded-control bg-transparent type-xs text-muted" type="button" onClick={onBack}>Back to Overview</button>
      {context && <span>Context from Overview · {context.label}
        {destination.page === "calendar" && destination.context?.accountLabel ? ` · Account ${destination.context.accountLabel} (context preserved; account filtering unavailable)` : ""}
      </span>}
    </div>
    {children}
  </div>;
}

/* The sheet gave this plate a surface, a radius and a layer and no ink and no air at all, so the
   copy sat flush against a rounded corner. Surface and ink travel as a pair, and the plate keeps
   one gutter. */
export function AppErrorBanner({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return <div className="error-banner z-banner flex items-center justify-between gap-3 rounded-field bg-surface-sunken px-3 py-2 type-sm text-ink" role="alert">
    <span className="min-w-0">{message}</span>
    <button className={COMMAND_BUTTON} type="button" onClick={onDismiss}>Dismiss</button>
  </div>;
}
