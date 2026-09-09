import { lazy, Suspense, type ComponentProps } from "react";
import { Maximize2, Minimize2 } from "@/shared/ui/icons";
import { ICON_BUTTON } from "@/shared/ui/IconButton";

const CanvasScreen = lazy(() => import("@/features/workflow-canvas").then((module) => ({ default: module.CanvasScreen })));

export function AppCanvas({ embedded, expanded, onToggleExpanded, ...props }: ComponentProps<typeof CanvasScreen> & { embedded: boolean; expanded: boolean; onToggleExpanded(): void }) {
  return <Suspense fallback={<div className="grid flex-1 place-items-center type-sm text-muted" role="status">Opening your studio…</div>}><CanvasScreen {...props} windowAction={!embedded && <button className={`${ICON_BUTTON} size-8 rounded-full bg-chip text-muted hover:text-ink`} type="button" title={expanded ? "Restore canvas window" : "Expand canvas window"} aria-label={expanded ? "Restore canvas window" : "Expand canvas window"} onClick={onToggleExpanded}>{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>} /></Suspense>;
}
