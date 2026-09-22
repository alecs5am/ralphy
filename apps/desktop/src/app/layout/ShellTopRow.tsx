/**
 * One window row: history, active page controls, then the Agent icon beside the island.
 *
 * The row is a drag region, and every control in it opts back out -- a button that moves the
 * window instead of firing is the defect this pairing prevents.
 */
import { ArrowLeft, ArrowRight, MessageSquare } from "@/shared/ui/icons";
import type { ReactNode } from "react";

import { ICON_BUTTON, IconButton } from "@/shared/ui/IconButton";

export function ShellTopRow({
  agentVisible,
  topChrome,
  island,
  onAgentToggle,
  pageHeaderRef,
}: {
  agentVisible: boolean;
  topChrome?: { canGoBack: boolean; canGoForward: boolean; onBack(): void; onForward(): void };
  island?: ReactNode;
  onAgentToggle?(opener: HTMLButtonElement): void;
  pageHeaderRef?(element: HTMLDivElement | null): void;
}) {
  return <header data-page-controls={!!pageHeaderRef || undefined} className="instrument-top-row instrument-chrome relative flex h-8 min-w-0 flex-none items-center gap-1 [-webkit-app-region:drag]">
        {/* The sidebar carries its own fold control in both states -- expanded in its header, and
            folded at the top of the rail -- so the top row holds history only. History belongs
            here in either state: it is about the content column, not about the sidebar. */}
        {topChrome && <div className="flex flex-none items-center gap-1 [-webkit-app-region:no-drag]">
          <IconButton className="size-7 rounded-full hover:bg-desk-hover" title="Back" label="Back" disabled={!topChrome.canGoBack} onClick={topChrome.onBack}>
            <ArrowLeft size={15} strokeWidth={1.6} aria-hidden="true" />
          </IconButton>
          <IconButton className="size-7 rounded-full hover:bg-desk-hover" title="Forward" label="Forward" disabled={!topChrome.canGoForward} onClick={topChrome.onForward}>
            <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
          </IconButton>
        </div>}
        {pageHeaderRef && <div ref={pageHeaderRef} className="page-header-host flex min-w-0 flex-1 items-center [-webkit-app-region:no-drag]" />}
        <div className="instrument-top-utilities ml-auto flex h-8 flex-none items-center gap-1">
        {onAgentToggle && <button
          className={`instrument-agent-toggle ${ICON_BUTTON} size-7 rounded-control text-muted hover:bg-desk-hover hover:text-ink aria-pressed:bg-field aria-pressed:text-ink [-webkit-app-region:no-drag]`}
          type="button"
          title={agentVisible ? "Hide agent" : "Show agent"}
          aria-label="Agent"
          aria-pressed={agentVisible}
          onClick={(event) => onAgentToggle(event.currentTarget)}
        ><MessageSquare size={15} strokeWidth={1.8} aria-hidden="true" /></button>}
        {/* The island is taken out of flow: open, its plate is far taller than the topbar, and
            in flow inside a centred row it grew upward past the window edge as well as down.
            Anchored to the top of the row it grows downward only, over the content. */}
        <div className="page-island-reserve relative h-8 shrink-0"><div className="instrument-island-slot absolute top-0 right-0 flex items-start [-webkit-app-region:no-drag]">{island}</div></div>
        </div>
      </header>
}
