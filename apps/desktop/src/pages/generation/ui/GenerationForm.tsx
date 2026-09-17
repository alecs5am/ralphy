import { Check, ChevronDown, Sparkles } from "@/shared/ui/icons";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import type { GenerationDraft, GenerationModel } from "../../../../shared/generation-studio";
import type { useGenerationStudio } from "../model/use-generation-studio";
import { AUDIO_TASKS, generationProblem, generationTab } from "../lib/generation-presentation";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import { GenerationFields } from "./GenerationFields";
import { GenerationInputs } from "./GenerationInputs";
import { GenerationModelIcon, GenerationModels } from "./GenerationModels";
import { GenerationVoicePicker } from "@/entities/generation"
import { GenerationFooter } from "./GenerationFooter";
import { studioSelection, STUDIO_FIELD, STUDIO_LABEL } from "@/entities/generation"

export function GenerationForm({ studio, workspaceId, model, showModels, onShowModels, onOpenProviders }: {
  studio: ReturnType<typeof useGenerationStudio>; workspaceId: string; model?: GenerationModel;
  showModels: boolean; onShowModels(show: boolean): void; onOpenProviders?(): void;
}) {
  const { draft } = studio;
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const problem = generationProblem(draft, model);
  const canSubmit = studio.ready && !studio.loading && !studio.busy && !studio.importing && !problem;
  const set = (next: GenerationDraft) => studio.edit(next);
  const provider = studio.catalog.providers.find((item) => item.id === model?.provider)?.label ?? model?.provider ?? "your provider";
  const generate = () => { if (canSubmit && model?.available) void studio.start("execute"); };
  return <Dialog.Root open={showModels} onOpenChange={onShowModels} modal={false}><Window className="generation-composer">
    <WindowTitlebar className="generation-titlebar"><Sparkles size={13} className="text-muted" /><strong className="flex-1 type-sm font-medium">Create something</strong><span className="generation-meta flex items-center gap-1 text-muted" role="status">{studio.saveState === "saving" ? "Saving…" : studio.saveState === "failed" ? <button type="button" className="underline" onClick={studio.retrySave}>Retry save</button> : <><Check size={10} />Saved</>}</span></WindowTitlebar>
    <WindowBody>
        <form id="generation-form" className="flex min-h-0 flex-1 flex-col overflow-y-auto" onSubmit={(event) => { event.preventDefault(); generate(); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); generate(); } }}>
          <fieldset disabled={!studio.ready || studio.loading || studio.importing} className="generation-form-fields">
            {generationTab(draft.kind) === "audio" && <div className="generation-audio-types" role="group" aria-label="Audio generation type">{AUDIO_TASKS.map(({ id, label, icon: Icon }) => <button className={studioSelection(draft.kind === id)} type="button" key={id} aria-pressed={draft.kind === id} onClick={() => studio.chooseKind(id)}><Icon size={12} />{label}</button>)}</div>}
            <Dialog.Trigger asChild><button ref={modelTrigger} type="button" className="generation-model-row" data-connected={model?.available} aria-label="Choose generation model">
              <span className="generation-model-tile"><GenerationModelIcon model={model} /></span><span className="generation-row-copy"><strong>{studio.loading ? "Loading models…" : model?.name ?? (draft.modelId ? "Model unavailable" : "Choose a model")}</strong><small>{model ? `${provider} · ${model.available ? "Key present" : "Connection needed"} · ${draft.kind === "voiceover" ? "Voice" : draft.kind}` : "Browse your creative engines"}</small></span><ChevronDown size={12} />
            </button></Dialog.Trigger>
            {model && <GenerationInputs workspaceId={workspaceId} model={model} draft={draft} importing={studio.importing} onImport={studio.importReference} onChange={set} />}
            {model?.fields.some((field) => field.id === "voice") && <div className="generation-parameter"><label className={STUDIO_LABEL} htmlFor="generation-voice">Voice<small>Required</small></label><GenerationVoicePicker workspaceId={workspaceId} connected={model.available} value={String(draft.parameters.voice ?? "")} onChange={(voice) => set({ ...draft, parameters: { ...draft.parameters, voice } })} /></div>}
            <div className="generation-parameter"><label className={STUDIO_LABEL} htmlFor="generation-prompt">{draft.kind === "voiceover" ? "Script" : "Prompt"}<span>{draft.prompt.length.toLocaleString()}</span></label><textarea id="generation-prompt" className={`${STUDIO_FIELD} generation-prompt resize-y leading-relaxed`} rows={4} maxLength={20000} value={draft.prompt} placeholder={draft.kind === "voiceover" ? "Write the words you want to hear…" : draft.kind === "music" ? "Genre, instruments, mood, rhythm…" : draft.kind === "sfx" ? "Describe the sound, its texture and movement…" : "Describe your scene. Think subject, light, texture and mood…"} onChange={(event) => set({ ...draft, prompt: event.currentTarget.value })} /></div>
            {model && <GenerationFields model={model} draft={draft} onChange={set} />}
          </fieldset>
        </form>
        <GenerationFooter studio={studio} model={model} provider={provider} problem={problem} canSubmit={canSubmit} onOpenProviders={onOpenProviders} />
        {showModels && <GenerationModels catalog={studio.catalog} draft={draft} opener={modelTrigger.current} onClose={() => onShowModels(false)} onChoose={(selected) => { studio.chooseModel(selected); onShowModels(false); }} />}
    </WindowBody>
  </Window></Dialog.Root>;
}
