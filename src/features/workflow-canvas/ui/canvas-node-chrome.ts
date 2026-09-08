import { AudioLines, Box, Brain, Clapperboard, FileText, GitFork, Images, Image, StickyNote, Workflow } from "@/shared/ui/icons";
import type { CanvasNode } from "../../../../shared/workflow-canvas";

export const NODE_FIELD = "nodrag nopan nowheel w-full min-w-0 rounded-field border-0 bg-field px-2.5 py-2 type-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";
export const NODE_ACTION = "nodrag nopan canvas-node-action inline-flex min-h-8 items-center justify-center gap-2 rounded-full px-3 type-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

export function nodeIdentity(node: CanvasNode) {
  const media = node.config?.asset?.kind ?? node.config?.modality ?? "image";
  if (node.kind === "media") return media === "video" ? { icon: Clapperboard, label: "Video reference" } : media === "audio" ? { icon: AudioLines, label: "Audio reference" } : media === "text" ? { icon: FileText, label: "Text reference" } : { icon: Image, label: "Image reference" };
  if (node.kind === "model") return { icon: { text: Brain, image: Image, video: Clapperboard, audio: AudioLines }[media], label: media === "text" ? "LLM" : `${media[0].toUpperCase()}${media.slice(1)} generation` };
  return {
    prompt: { icon: FileText, label: "Prompt" },
    connector: { icon: GitFork, label: "Connector" },
    variation: { icon: Images, label: "Variations" },
    output: { icon: Box, label: "Output" },
    note: { icon: StickyNote, label: "Note" },
    step: { icon: Workflow, label: "Pipeline step" },
  }[node.kind];
}
