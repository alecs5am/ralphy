import { Box, Clapperboard, Cpu, FileText, Workflow, ImagePlus, Cable, Layers3, StickyNote, Split } from "lucide-react";
import type { CanvasNodeKind } from "../../../../shared/workflow-canvas";
export const NODE_ICONS = { prompt: FileText, media: ImagePlus, model: Cpu, connector: Cable, variation: Layers3, output: Box, note: StickyNote, step: Workflow } satisfies Record<CanvasNodeKind, typeof FileText>;
export const TEMPLATE_ICONS = { blank: Workflow, image: ImagePlus, video: Clapperboard, comparison: Split };
export const CANVAS_BUTTON = "canvas-control inline-flex h-8 flex-none items-center justify-center gap-2 rounded-full px-3 type-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40";
export const CANVAS_FIELD = "w-full min-w-0 rounded-field bg-field px-3 py-2 type-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
