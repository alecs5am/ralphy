import { useEffect, useRef, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { ArrowUpRight, Save, X } from "@/shared/ui/icons";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import type { GenerationUnitOptions, GenerationUnitSource, SavedGenerationUnit } from "../../../../shared/generation-units";
import { STUDIO_BUTTON, STUDIO_FIELD, STUDIO_LABEL, STUDIO_PRIMARY } from "./generation-chrome";

export type OpenGeneratedUnit = (reference: ProjectReference, unitId: string, label: string, revisionId?: string) => void;

/** Saving is explicit. A durable native receipt makes retried clicks return the same revision. */
export function SaveGenerationToUnit({ workspaceId, source, kind, label, onOpenUnit }: {
  workspaceId: string; source: GenerationUnitSource; kind: string; label: string; onOpenUnit?: OpenGeneratedUnit;
}) {
  const [open, setOpen] = useState(false), [projectId, setProjectId] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new"), [unitId, setUnitId] = useState("");
  const [name, setName] = useState(label.slice(0, 120)), [options, setOptions] = useState<GenerationUnitOptions | null>(null);
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedGenerationUnit | null>(null), [refresh, setRefresh] = useState(0);
  const submitting = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    let current = true; setLoading(true); setOptions(null); setError(null);
    void bridge.loadGenerationUnitOptions(workspaceId, projectId || null).then((options) => {
      if (current) { setOptions(options); setUnitId((id) => options.units.some((unit) => unit.id === id && unit.format === kind) ? id : options.units.find((unit) => unit.format === kind)?.id ?? ""); }
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, projectId, workspaceId, kind, refresh]);
  if (!["image", "video", "audio"].includes(kind)) return null;
  const selected = options?.units.find((unit) => unit.id === unitId);
  const save = async () => {
    if (submitting.current || !options || loading || (mode === "new" ? !name.trim() : !selected || selected.format !== kind)) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const saved = await bridge.saveGenerationToUnit(workspaceId, source, { projectId: projectId || null, ...(mode === "new" ? { name: name.trim() } : { unitId: selected!.id, expectedLatestRevisionId: selected!.latestRevisionId }) });
      if (alive.current) setSaved(saved);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  };
  if (!open) return <button className={STUDIO_BUTTON} type="button" onClick={() => setOpen(true)}><Save size={12} />Save to Unit</button>;
  return <section className="flex w-full flex-col gap-3 rounded-field border border-divider bg-panel p-4" aria-label="Save generated result to Unit">
    <div className="flex items-center gap-2"><strong className="flex-1 type-sm font-medium">Save to Unit</strong><button className={STUDIO_BUTTON} type="button" aria-label="Close Save to Unit" disabled={busy} onClick={() => setOpen(false)}><X size={12} /></button></div>
    {saved ? <><p className="m-0 type-sm" role="status">{saved.alreadySaved ? "Already saved" : "Saved"} as revision {saved.revisionNo} of {saved.label}. Its selected version and publishing status are unchanged.</p>{onOpenUnit && <button className={STUDIO_PRIMARY} type="button" onClick={() => onOpenUnit({ workspaceId: saved.workspaceId, projectId: saved.projectId }, saved.unitId, saved.label, saved.revisionId)}><ArrowUpRight size={12} />Open Unit</button>}</> : <>
      {loading ? <p className="m-0 type-sm text-muted" role="status">Loading Unit destinations…</p> : options && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p className="m-0 type-xs text-muted">Workspace: {options.workspaceName}</p>
        <div className={STUDIO_LABEL}>Save in<SelectMenu overlayOwner="generation.unit-save" tone="caller" className={STUDIO_FIELD} ariaLabel="Save in" value={projectId} disabled={busy} onValueChange={(value) => { setProjectId(value); setUnitId(""); }} options={[{ value: "", label: "Workspace Units" }, ...options.projects.map((project) => ({ value: project.id, label: project.name }))]} /></div>
        <div className={STUDIO_LABEL}>Destination<SelectMenu<"new" | "existing"> overlayOwner="generation.unit-save" tone="caller" className={STUDIO_FIELD} ariaLabel="Unit destination" value={mode} disabled={busy} onValueChange={setMode} options={[{ value: "new", label: "New Unit" }, { value: "existing", label: "Revision of an existing Unit" }]} /></div>
        {mode === "new" ? <label className={STUDIO_LABEL}>Unit name<input className={STUDIO_FIELD} value={name} maxLength={120} required disabled={busy} onChange={(event) => setName(event.currentTarget.value)} /></label> : <div className={STUDIO_LABEL}>Existing Unit<SelectMenu overlayOwner="generation.unit-save" tone="caller" className={STUDIO_FIELD} ariaLabel="Existing Unit" value={unitId} disabled={busy} onValueChange={setUnitId} options={[{ value: "", label: `Choose a ${kind} Unit` }, ...options.units.filter((unit) => unit.format === kind).map((unit) => ({ value: unit.id, label: unit.label }))]} /><span className="type-xs text-muted">Only {kind} Units can receive this result.</span></div>}
        <p className="m-0 type-xs leading-relaxed text-muted">Preserves the media, prompt, model, settings and reference files. Saving adds a revision; choose a default or publish separately in the Unit.</p>
        <button className={STUDIO_PRIMARY} disabled={busy || (mode === "new" ? !name.trim() : !selected)}>{busy ? "Saving…" : "Save result"}</button>
      </form>}
    </>}
    {error && <div className="flex flex-col gap-2" role="alert"><p className="m-0 type-sm">{error}</p><button className={STUDIO_BUTTON} type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Refresh destinations</button></div>}
  </section>;
}
