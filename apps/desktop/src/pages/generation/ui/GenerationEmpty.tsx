import { AudioLines, Clapperboard, Image } from "@/shared/ui/icons";
import type { GenerationKind } from "../../../../shared/generation-studio";
import { generationTab } from "../lib/generation-presentation";

export function GenerationEmpty({ kind }: { kind: GenerationKind }) {
  const tab = generationTab(kind);
  const Icon = tab === "image" ? Image : tab === "video" ? Clapperboard : AudioLines;
  return <div className="generation-empty">
    <Icon size={24} strokeWidth={1.4} aria-hidden="true" />
    <p>Your {tab === "image" ? "images" : tab === "video" ? "videos" : "audio"} will appear here</p>
  </div>;
}
