import { PageHeader } from "@/shared/ui/PageHeader";
import { useState } from "react";
import { LoaderCircle, Plug, RefreshCw, Sparkles, X } from "@/shared/ui/icons";
import { InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { GENERATION_SCREEN_STATES } from "../model/instrument-states";
import { useGenerationStudio } from "../model/use-generation-studio";
import { GENERATION_TABS, generationTab } from "../lib/generation-presentation";
import { GenerationForm } from "./GenerationForm";
import { GenerationResults } from "./GenerationResults";
import { type OpenGeneratedUnit, studioSelection, STUDIO_ICON } from "@/entities/generation"

export interface GenerationScreenProps { workspaceId: string; workspaceName: string; rootEpoch: number; onOpenProviders?(): void; onOpenUnit?: OpenGeneratedUnit }

export function GenerationScreen(props: GenerationScreenProps) {
  return <GenerationWorkspace key={`${props.workspaceId}:${props.rootEpoch}`} {...props} />;
}

function GenerationWorkspace({ workspaceId, workspaceName, onOpenProviders, onOpenUnit }: GenerationScreenProps) {
  const studio = useGenerationStudio(workspaceId);
  const [showModels, setShowModels] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tab = generationTab(studio.draft.kind);
  const model = studio.catalog.models.find((item) => item.id === studio.draft.modelId && item.provider === studio.draft.provider && item.kind === studio.draft.kind);
  const state = studio.error ? "error" : studio.loading || !studio.ready ? "loading" : studio.runs.length ? "history" : studio.draft.prompt ? "editing" : studio.catalog.models.length ? "ready" : "empty";
  return <InstrumentScreenRoot descriptor={GENERATION_SCREEN_STATES} state={state}><section className="generation-screen flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 text-ink" data-medium={tab} aria-label="Create studio">
    <PageHeader title="Create" icon={Sparkles} meta={workspaceName}>
      <div className="page-header-segments flex shrink-0 items-center gap-1 rounded-full bg-panel p-0.5" role="group" aria-label="Generation type">{GENERATION_TABS.map(({ id, label, icon: Icon }) => <button className={`${studioSelection(tab === id)} min-h-8 gap-2 px-3`} type="button" key={id} aria-label={label} title={label} aria-pressed={tab === id} onClick={() => { studio.chooseKind(id === "audio" ? "voiceover" : id); setShowModels(false); }}><Icon size={14} /><span className="page-header-action-label">{label}</span></button>)}</div>
      <span className="flex shrink-0 gap-1"><button className={STUDIO_ICON} type="button" aria-label="Refresh generation models" disabled={studio.loading} onClick={() => { void studio.refreshCatalog(); }}>{studio.loading ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" /> : <RefreshCw size={13} />}</button>{onOpenProviders && <button className={STUDIO_ICON} type="button" aria-label="Manage generation providers" onClick={onOpenProviders}><Plug size={14} /></button>}</span>
    </PageHeader>
    {studio.error && <div className="flex shrink-0 items-start gap-2 rounded-field bg-panel p-3 type-xs" role="alert"><span className="min-w-0 flex-1 leading-relaxed whitespace-pre-wrap">{studio.error}</span><button className={STUDIO_ICON} type="button" aria-label="Dismiss generation error" onClick={() => studio.setError(null)}><X size={12} /></button></div>}
    {studio.catalog.errors.length > 0 && <details className="shrink-0 type-xs text-muted"><summary className="cursor-pointer">{studio.catalog.models.length ? "Some model catalogs are unavailable" : "Model discovery needs attention"}</summary><ul className="pl-4 leading-relaxed">{studio.catalog.errors.map((error, index) => <li className="mt-1" key={index}>{error}</li>)}</ul></details>}
    <div className="generation-layout min-h-0 min-w-0 flex-1 gap-2" data-expanded={expanded}>
      {!expanded && <div className="generation-composer-slot"><GenerationForm studio={studio} workspaceId={workspaceId} model={model} showModels={showModels} onShowModels={setShowModels} onOpenProviders={onOpenProviders} /></div>}
      <div className="generation-results-slot"><GenerationResults workspaceId={workspaceId} onOpenUnit={onOpenUnit} hasOlder={studio.hasOlder} loadingOlder={studio.loadingOlder} onLoadOlder={studio.loadOlder} lastStartedId={studio.lastStartedId} models={studio.catalog.models} runs={studio.runs} kind={studio.draft.kind} draft={studio.draft} model={model} expanded={expanded} onExpand={() => setExpanded((value) => !value)} onPrompt={(prompt) => { studio.edit({ ...studio.draft, prompt }); setExpanded(false); setShowModels(false); }} onRestore={studio.restore} onCancel={(id) => { void studio.cancel(id); }} onExport={(result) => { void studio.exportResult(result); }} onReference={studio.addReference} /></div>
    </div>
  </section></InstrumentScreenRoot>;
}
