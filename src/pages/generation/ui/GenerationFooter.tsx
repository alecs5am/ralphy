import { Plug, Scan, Sparkles } from "lucide-react";
import type { GenerationModel } from "../../../../shared/generation-studio";
import { settingsStorage, useAppPreferences } from "@/shared/model/app-preferences";
import type { useGenerationStudio } from "../model/use-generation-studio";
import { estimateLabel, generationCost, generationEstimate, running } from "../lib/generation-presentation";
import { STUDIO_BUTTON, STUDIO_PRIMARY } from "@/entities/generation"

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
  const basis = [String(studio.draft.variants), studio.draft.parameters.duration ? `× ${studio.draft.parameters.duration}s` : studio.draft.variants === 1 ? "output" : "outputs", studio.draft.parameters.resolution, `Reported by ${provider}`].filter(Boolean).join(" · ").replace(" · ×", " ×");
  const unavailable = !model?.previewSupported;
  const active = studio.runs.find(running);
  const status = estimating ? "Checking inputs and cost…" : estimate?.status === "failed" ? "Estimate failed · try again" : estimate?.status === "cancelled" ? "Estimate stopped" : unavailable ? "Provider has no cost preview" : "Estimate this setup first";
  return <footer className="generation-footer">
    {model && !model.available && <div className="generation-connect"><span><strong className="generation-meta">Action needed</strong><span>{provider} runs this model. Add a key to generate.</span></span><button className={STUDIO_BUTTON} type="button" onClick={onOpenProviders} disabled={!onOpenProviders} aria-label={`Connect ${provider}`}><Plug size={12} />Connect</button></div>}
    <div className="generation-estimate" data-high-cost={expensive} role="status" aria-label="Current generation estimate">
      <span className="generation-estimate-copy"><strong className="generation-meta">{expensive ? `High cost run · over your $${threshold} warning` : "Estimate · before you spend"}</strong><small className="generation-meta">{cost !== null ? basis : status}</small></span>
      <span className="generation-price">{cost !== null ? <><small>$</small><strong>{estimateLabel(estimate!).replace("$", "")}</strong></> : <strong>—</strong>}</span>
    </div>
    <div className="generation-actions"><button type="button" className={STUDIO_BUTTON} disabled={!canSubmit || unavailable} onClick={() => { void studio.start("preview"); }} title={unavailable ? "This model does not support cost estimates" : "Check inputs and estimate cost without generating"}><Scan size={14} />Estimate</button><button type="submit" form="generation-form" className={STUDIO_PRIMARY} disabled={!canSubmit || !model?.available}>{studio.busy ? <span className="generation-working" aria-hidden="true"><i /><i /><i /></span> : <Sparkles size={14} />}{studio.busy ? "Working" : expensive ? "Generate anyway" : "Generate"}{!studio.busy && <span className="generation-generate-badge">{expensive ? estimateLabel(estimate!) : studio.draft.variants}</span>}</button></div>
    <span className="generation-footer-hint generation-meta">{!studio.ready && !studio.loading ? <button type="button" className="underline" onClick={studio.retryLoad}>Retry loading your draft</button> : studio.busy ? <>Working{active && <> · <button type="button" className="underline" aria-label="Stop generation" onClick={() => { void studio.cancel(active.id); }}>Stop</button></>}</> : studio.importing ? "Importing your reference…" : model && !model.available ? `Connect ${provider} to generate` : problem ?? `⌘⏎ to generate · billed by ${provider}`}</span>
  </footer>;
}
