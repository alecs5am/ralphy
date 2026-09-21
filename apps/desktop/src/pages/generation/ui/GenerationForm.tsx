import { ChevronDown, Plus, SlidersHorizontal } from "@/shared/ui/icons";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { GenerationDraft, GenerationModel } from "../../../../shared/generation-studio";
import type { useGenerationStudio } from "../model/use-generation-studio";
import { AUDIO_TASKS, generationProblem, generationTab } from "../lib/generation-presentation";
import { GenerationFields } from "./GenerationFields";
import { GenerationInputs } from "./GenerationInputs";
import { GenerationModelIcon, GenerationModels } from "./GenerationModels";
import { GenerationVoicePicker, studioSelection, STUDIO_LABEL } from "@/entities/generation";
import { GenerationFooter } from "./GenerationFooter";
import { GenerationOptions } from "./GenerationOptions";
import { GenerationQuickControls, quickGenerationField } from "./GenerationQuickControls";

export function GenerationForm({ studio, workspaceId, model, showModels, onShowModels, onOpenProviders }: {
  studio: ReturnType<typeof useGenerationStudio>; workspaceId: string; model?: GenerationModel;
  showModels: boolean; onShowModels(show: boolean): void; onOpenProviders?(): void;
}) {
  const { draft } = studio;
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<"settings" | "references" | null>(null);
  useEffect(() => setPanel(draft.kind === "voiceover" ? "settings" : null), [draft.kind, draft.modelId]);
  const problem = generationProblem(draft, model);
  const canSubmit = studio.ready && !studio.loading && !studio.busy && !studio.importing && !problem;
  const set = (next: GenerationDraft) => studio.edit(next);
  const tab = generationTab(draft.kind);
  const provider = studio.catalog.providers.find((item) => item.id === model?.provider)?.label ?? model?.provider ?? "your provider";
  const generate = () => { if (canSubmit && model?.available) void studio.start("execute"); };
  return <Dialog.Root open={showModels} onOpenChange={onShowModels} modal={false}><section className="generation-composer" aria-label="Generation composer">
    <form id="generation-form" onSubmit={(event) => { event.preventDefault(); generate(); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); generate(); } }}>
      <fieldset disabled={!studio.ready || studio.importing} className="generation-form-fields">
        <div className="generation-prompt-field">
          {!!model?.inputs.length && <GenerationOptions label="Generation references" title="References" icon={Plus} compact summary={draft.inputs.length ? String(draft.inputs.length) : undefined} open={panel === "references"} onOpenChange={(open) => setPanel(open ? "references" : null)}>
            <GenerationInputs workspaceId={workspaceId} model={model} draft={draft} importing={studio.importing} onImport={studio.importReference} onChange={set} />
          </GenerationOptions>}
          <label className="sr-only" htmlFor="generation-prompt">{draft.kind === "voiceover" ? "Script" : "Prompt"}</label>
          <textarea id="generation-prompt" className="generation-prompt" rows={2} maxLength={20000} value={draft.prompt} placeholder={draft.kind === "voiceover" ? "Write the words you want to hear…" : draft.kind === "music" ? "Describe the music you want to hear…" : draft.kind === "sfx" ? "Describe the sound you imagine…" : "Describe the scene you imagine…"} onChange={(event) => set({ ...draft, prompt: event.currentTarget.value })} />
        </div>
        <div className="generation-composer-tools">
          <Dialog.Trigger asChild><button ref={modelTrigger} type="button" disabled={studio.loading} className="generation-model-row generation-model-compact" data-connected={model?.available} aria-label="Choose generation model" title={model ? `${model.name} · ${provider} · ${model.available ? "Key present" : "Connection needed"}` : "Choose a model"} onClick={() => setPanel(null)}>
            <span className="generation-model-tile"><GenerationModelIcon model={model} /></span><span className="generation-row-copy"><strong>{studio.loading ? "Loading models…" : model?.name ?? (draft.modelId ? "Model unavailable" : "Choose a model")}</strong></span><ChevronDown size={12} />
          </button></Dialog.Trigger>
          {model && <GenerationQuickControls model={model} draft={draft} onChange={set} />}
          {model?.fields.some((field) => !quickGenerationField(field)) && <GenerationOptions label="Generation settings" title="Settings" icon={SlidersHorizontal} compact open={panel === "settings"} onOpenChange={(open) => setPanel(open ? "settings" : null)}>
            {model.fields.some((field) => field.id === "voice") && <div className="generation-parameter"><label className={STUDIO_LABEL} htmlFor="generation-voice">Voice<small>Required</small></label><GenerationVoicePicker workspaceId={workspaceId} connected={model.available} value={String(draft.parameters.voice ?? "")} onChange={(voice) => set({ ...draft, parameters: { ...draft.parameters, voice } })} /></div>}
            <GenerationFields model={model} draft={draft} onChange={set} />
          </GenerationOptions>}
        </div>
        {tab === "audio" && <div className="generation-audio-types" role="group" aria-label="Audio generation type">{AUDIO_TASKS.map(({ id, label, icon: Icon }) => <button className={studioSelection(draft.kind === id)} type="button" disabled={studio.loading} key={id} aria-pressed={draft.kind === id} onClick={() => { studio.chooseKind(id); setPanel(id === "voiceover" ? "settings" : null); }}><Icon size={12} />{label}</button>)}</div>}
      </fieldset>
    </form>
    {studio.saveState === "failed" && <button type="button" className="generation-save-error" onClick={studio.retrySave}>Draft not saved. Retry</button>}
    <GenerationFooter studio={studio} model={model} provider={provider} problem={problem} canSubmit={canSubmit} onOpenProviders={onOpenProviders} />
    {showModels && <GenerationModels catalog={studio.catalog} draft={draft} opener={modelTrigger.current} onClose={() => onShowModels(false)} onChoose={(selected) => { studio.chooseModel(selected); onShowModels(false); }} />}
  </section></Dialog.Root>;
}
