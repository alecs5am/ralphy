import { ArrowUpRight, AudioLines, Clapperboard, Image } from "@/shared/ui/icons";
import type { GenerationKind } from "../../../../shared/generation-studio";
import { generationTab, STARTERS } from "../lib/generation-presentation";

export function GenerationEmpty({ kind, onPrompt }: { kind: GenerationKind; onPrompt(prompt: string): void }) {
  const tab = generationTab(kind);
  const Icon = tab === "image" ? Image : tab === "video" ? Clapperboard : AudioLines;
  return <div className="generation-empty">
    <div className="generation-empty-heading"><span className="generation-meta flex items-center gap-2 text-muted"><Icon size={12} />Your next creation</span><h2>{tab === "image" ? "Give an idea a shape." : tab === "video" ? "Set a scene in motion." : "Make something resonate."}</h2><p>{tab === "image" ? "Start with a few words, or bring a reference." : tab === "video" ? "Describe the movement. Add a frame to build from." : "A voice, a score, a small detail that changes everything."}</p></div>
    <div className="generation-starters">{STARTERS[kind].map((starter, index) => <button type="button" className="generation-prompt-study" key={starter.title} onClick={() => onPrompt(starter.prompt)} aria-label={`Use ${starter.title} prompt`}>
      <div className="generation-prompt-art" aria-hidden="true">{tab === "audio" ? <div className="generation-wave">{Array.from({ length: 37 }, (_, i) => <i key={i} style={{ height: `${18 + Math.abs(Math.sin(i * 0.71) * Math.cos(i * 0.19)) * 72}%` }} />)}</div> : <img src={`${import.meta.env.BASE_URL}generation-studies/study-${index + 1}.jpg`} alt="" loading="lazy" />}<span className="generation-study-badge">Prompt study / 0{index + 1}</span></div>
      <span className="generation-study-caption"><strong>{starter.title}</strong><ArrowUpRight size={11} className="text-muted" /></span><small>{starter.caption}</small>
    </button>)}</div>
    <span className="generation-meta text-muted">Prompt starters · Your outputs appear here</span>
  </div>;
}
