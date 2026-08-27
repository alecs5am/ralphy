/**
 * The window's own top row: history, the lens pair, and the island.
 *
 * It is exactly as tall as the island, so the island's top edge is the window's 8px inset -- the
 * same line the sidebar card starts on. A taller band would leave air above the tallest thing in
 * it, which reads as a wrong margin. No horizontal padding either: every zone stands 8 from its
 * edge, and the handoff's 2px optical inset put the island 10 from the right while the sidebar
 * stood at 8.
 *
 * The row is a drag region, and every control in it opts back out -- a button that moves the
 * window instead of firing is the defect this pairing prevents.
 */
import { ArrowLeft, ArrowRight, LayoutGrid, MessageSquare, PanelLeft } from "lucide-react";
import type { ReactNode } from "react";

import type { WorkbenchLens } from "@/shared/model/workbench";
import { ICON_BUTTON, IconButton } from "@/shared/ui/IconButton";

export function ShellTopRow({
  leftVisible,
  lens,
  topChrome,
  island,
  onToggleLeft,
  onLensChange,
}: {
  leftVisible: boolean;
  lens: WorkbenchLens;
  topChrome?: { canGoBack: boolean; canGoForward: boolean; onBack(): void; onForward(): void };
  island?: ReactNode;
  onToggleLeft(): void;
  onLensChange?(lens: WorkbenchLens): void;
}) {
  return <header className="instrument-top-row relative flex h-8 min-w-0 flex-none items-center gap-3 [-webkit-app-region:drag]">
        {/* The sidebar owns its own collapse control now; the topbar carries it only while the
            sidebar is gone, which is the one state where the sidebar's own button is not on
            screen. History stays here in both states -- it is about the content column. */}
        {topChrome && <div className="flex flex-none items-center gap-1 [-webkit-app-region:no-drag]">
          {!leftVisible && <>
            <div className="w-traffic-main h-px flex-none" aria-hidden="true" />
            <button className={`size-7 rounded-full text-ink hover:bg-desk-hover ${ICON_BUTTON}`} type="button" title="Show sidebar" aria-label="Toggle sidebar" aria-pressed="false" onClick={onToggleLeft}>
              <PanelLeft size={15} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </>}
          <IconButton className="size-7 rounded-full hover:bg-desk-hover" title="Back" label="Back" disabled={!topChrome.canGoBack} onClick={topChrome.onBack}>
            <ArrowLeft size={15} strokeWidth={1.6} aria-hidden="true" />
          </IconButton>
          <IconButton className="size-7 rounded-full hover:bg-desk-hover" title="Forward" label="Forward" disabled={!topChrome.canGoForward} onClick={topChrome.onForward}>
            <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
          </IconButton>
        </div>}
        {/* The lens pair: how you are working, as against the sidebar's place switch, which is
            where you are. Two circles in one pill; the active one is the desk's inversion. */}
        {onLensChange && <div className="instrument-lens flex flex-none items-center gap-0.5 rounded-full bg-card p-0.75 [-webkit-app-region:no-drag]" role="group" aria-label="Working lens">
          {([["desk", LayoutGrid, "Desk lens"], ["chat", MessageSquare, "Chat lens"]] as const).map(([option, Icon, label]) => {
            const active = lens === option;
            return <button
              className={`instrument-lens-button grid size-7 place-items-center rounded-full ${active
                ? "bg-desk-primary text-desk-primary-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-desk-primary-ink"
                : "bg-transparent text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"}`}
              type="button"
              key={option}
              title={label}
              aria-label={label}
              aria-pressed={active}
              onClick={() => onLensChange(option)}
            ><Icon size={15} strokeWidth={1.8} aria-hidden="true" /></button>;
          })}
        </div>}
        {/* The island is taken out of flow: open, its plate is far taller than the topbar, and
            in flow inside a centred row it grew upward past the window edge as well as down.
            Anchored to the top of the row it grows downward only, over the content. */}
        <div className="instrument-island-slot absolute top-0 right-0 flex items-start [-webkit-app-region:no-drag]">{island}</div>
      </header>
}
