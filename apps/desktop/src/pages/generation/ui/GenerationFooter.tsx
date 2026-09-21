import { Plug, Sparkles } from "@/shared/ui/icons";
import type { GenerationModel } from "../../../../shared/generation-studio";
import { settingsStorage, useAppPreferences } from "@/shared/model/app-preferences";
import type { useGenerationStudio } from "../model/use-generation-studio";
import { estimateLabel, generationCost, generationEstimate, running } from "../lib/generation-presentation";

export function GenerationFooter({ studio, model, provider, problem, canSubmit, onOpenProviders }: {
  studio: ReturnType<typeof useGenerationStudio>; model?: GenerationModel; provider: string; problem: string | null; canSubmit: boolean; onOpenProviders?(): void;
}) {
  const { values } = useAppPreferences(settingsStorage);
  const limit = values["generation.costWarningUsd"];
  const threshold = Number.isFinite(limit) && limit > 0 ? limit : 5;
  const estimate = generationEstimate(studio.runs, studio.draft, model);
  const cost = generationCost(estimate);
  const expensive = cost !== null && cost > threshold;
  const estimating = estimate && running(estimate);
  const unavailable = !model?.previewSupported;
  const active = studio.runs.find(running);
  const status = estimating ? "Estimating…" : estimate?.status === "failed" ? "Retry estimate" : cost !== null ? `Estimated ${estimateLabel(estimate!)}` : "Estimate cost";
  return <footer className="generation-footer">
    <div className="generation-actions">
      <button type="submit" form="generation-form" className="generation-primary" disabled={!canSubmit || !model?.available}><span>{studio.busy ? <span className="generation-working" aria-hidden="true"><i /><i /><i /></span> : <Sparkles size={15} />}{studio.busy ? "Working" : expensive ? "Generate anyway" : "Generate"}</span>{expensive && <small>{estimateLabel(estimate!)}</small>}</button>
      <div className="generation-estimate" data-high-cost={expensive} role="status" aria-label="Current generation estimate"><button type="button" aria-label="Estimate" disabled={!canSubmit || unavailable} onClick={() => { void studio.start("preview"); }} title={unavailable ? "This model does not support cost estimates" : `Check inputs and estimate cost with ${provider} without generating`}>{status}</button></div>
    </div>
    {(!studio.ready || studio.busy || studio.importing || model && !model.available || expensive || studio.draft.prompt.trim() && problem) && <div className="generation-footer-hint" role="status">
      {!studio.ready && !studio.loading ? <button type="button" onClick={studio.retryLoad}>Retry loading your draft</button> : studio.busy ? <>Generating{active && <button type="button" aria-label="Stop generation" onClick={() => { void studio.cancel(active.id); }}>Stop</button>}</> : studio.importing ? "Importing reference…" : model && !model.available ? <><span>Connect {provider} to use this model.</span><button type="button" onClick={onOpenProviders} disabled={!onOpenProviders} aria-label={`Connect ${provider}`}><Plug size={12} />Connect</button></> : expensive ? `Estimated cost exceeds your $${threshold} warning.` : problem}
    </div>}
  </footer>;
}
