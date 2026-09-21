/**
 * The frames the app puts around a route: the fallback while a lazy screen arrives, the return
 * bar over a route reached from the Overview, the error plate, and the chord that reaches the
 * panel beside the chat.
 *
 * None of them is a route and none of them is a screen, which is why they were sitting in
 * `App.tsx` -- and why they belong beside it rather than inside it.
 */
import { useEffect, useRef, type ReactNode } from "react";

import { InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { COMMAND_BUTTON } from "@/shared/ui/route-chrome";
import { usePageHeaderHost } from "@/shared/ui/PageHeader";
import type { WorkspaceDestination } from "@/shared/model/workbench";
import { unitsInstrumentStates } from "@/pages/project";

export function ProjectScreenLoadingFallback() {
  return (
    <InstrumentScreenRoot descriptor={unitsInstrumentStates} state="loading">
      {/* Same as the loaded screen: the mode surface owns the desk wash, so this fallback
          neither repaints it nor paints over the view panel's page card. */}
      <main className="main-region project-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden p-1">
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

export function WorkspaceDestinationFrame({ destination, onBack, children }: {
  destination: WorkspaceDestination;
  onBack(): void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pageHeaderHost = usePageHeaderHost();
  useEffect(() => {
    const heading = pageHeaderHost?.querySelector<HTMLElement>("h1") ?? root.current?.querySelector<HTMLElement>("h1") ?? root.current?.querySelector<HTMLElement>("h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [destination, pageHeaderHost]);
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

/* Errors float above the desk without changing the shell's height. */
export function AppErrorBanner({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return <div className="error-banner fixed bottom-4 left-4 right-4 z-banner flex max-w-lg items-center justify-between gap-3 rounded-field bg-surface-sunken px-3 py-2 type-sm text-ink shadow-lg" role="alert">
    <span className="min-w-0 break-words">{message}</span>
    <button className={`${COMMAND_BUTTON} shrink-0`} type="button" onClick={onDismiss}>Dismiss</button>
  </div>;
}
