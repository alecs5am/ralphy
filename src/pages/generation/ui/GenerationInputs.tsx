import { useEffect, useState } from "react";
import { ArrowRight, Film, Image, Plus, X } from "@/shared/ui/icons";
import { bridge } from "@/shared/api/ipc";
import type { GenerationDraft, GenerationInputSpec, GenerationModel } from "../../../../shared/generation-studio";
import { STUDIO_LABEL } from "@/entities/generation"

type InputProps = { workspaceId: string; model: GenerationModel; draft: GenerationDraft; importing: boolean; onImport(role: string, file?: File): Promise<string | null>; onChange(draft: GenerationDraft): void };

export function GenerationInputs(props: InputProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const assetsKey = JSON.stringify(props.draft.inputs);
  useEffect(() => {
    let current = true;
    void Promise.all(props.draft.inputs.map(async ({ asset }) => [asset.path, await bridge.loadCanvasAssetPreview(props.workspaceId, asset).catch(() => null)] as const)).then((items) => {
      if (current) setPreviews(Object.fromEntries(items.filter((item): item is readonly [string, string] => Boolean(item[1]))));
    });
    return () => { current = false; };
  }, [props.workspaceId, assetsKey]);
  const frames = props.model.inputs.filter((input) => input.id === "firstFrame" || input.id === "lastFrame").sort((a) => a.id === "firstFrame" ? -1 : 1);
  const slot = (spec: GenerationInputSpec) => <GenerationInputSlot key={`${props.model.provider}:${props.model.id}:${spec.id}`} {...props} spec={spec} previews={previews} />;
  return props.model.inputs.length ? <div className="generation-fields">
    {!!frames.length && <div className="generation-parameter"><span className={STUDIO_LABEL}>Motion frames<small>{frames.some((spec) => spec.required) ? "Required" : "Optional"}</small></span><div className="generation-motion-frames" data-pair={frames.length === 2}>{frames.map(slot)}{frames.length === 2 && <span className="generation-frame-arrow" aria-hidden="true"><ArrowRight size={12} /></span>}</div></div>}
    {props.model.inputs.filter((spec) => !frames.includes(spec)).map(slot)}
  </div> : null;
}

function GenerationInputSlot({ spec, previews, draft, importing, onImport, onChange }: InputProps & { spec: GenerationInputSpec; previews: Record<string, string> }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = draft.inputs.map((input, index) => ({ ...input, index })).filter((input) => input.role === spec.id);
  const frame = spec.id === "firstFrame" || spec.id === "lastFrame";
  const Icon = spec.kind === "video" ? Film : Image;
  const importFile = async (file?: File) => {
    setError(null);
    if (file && (file.size > 250 * 1024 * 1024 || spec.kind === "image" && !/\.(png|jpe?g|webp|gif)$/i.test(file.name))) {
      setError(file.size > 250 * 1024 * 1024 ? "Files under 250 MB only" : "Image files only"); return false;
    }
    const problem = await onImport(spec.id, file);
    setError(problem); return !problem;
  };
  return <div className="generation-input-group" data-frame={frame} data-dragging={dragging} data-error={Boolean(error)} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => {
    event.preventDefault(); setDragging(false);
    if (importing) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > spec.maxCount - inputs.length) { setError(`Choose up to ${spec.maxCount - inputs.length} more ${spec.kind} ${spec.maxCount - inputs.length === 1 ? "file" : "files"}`); return; }
    void (async () => { for (const file of files) if (!await importFile(file)) break; })();
  }}>
    {!frame && <span className={STUDIO_LABEL}>{spec.label}<small>{inputs.length}/{spec.maxCount}{spec.required ? " · Required" : ""}</small></span>}
    <div className="generation-input-slots">{inputs.map(({ asset, index }) => <div className="generation-input-preview" key={`${index}:${asset.path}`}>
      {asset.kind === "image" && previews[asset.path] ? <img src={previews[asset.path]} alt={asset.name} /> : <Icon size={18} aria-label={asset.name} />}
      <span className="generation-input-caption">{frame && <small>{spec.id === "firstFrame" ? "First" : "Last"}</small>}<span title={asset.name}>{asset.name}</span><button type="button" aria-label={`Remove ${asset.name}`} onClick={() => { setError(null); onChange({ ...draft, inputs: draft.inputs.filter((_, i) => i !== index) }); }}><X size={10} /></button></span>
    </div>)}{inputs.length < spec.maxCount && <button className="generation-input-empty" type="button" disabled={importing} onClick={() => { void importFile(); }} aria-label={`Add ${spec.label.toLocaleLowerCase()}`}><span><Plus size={14} /></span>{frame && <small>{dragging ? "Drop to set" : spec.label}</small>}</button>}</div>
    {error && <span className="generation-input-error generation-meta" role="alert">{error}</span>}
    {spec.description && <span className="type-xs leading-relaxed text-muted">{spec.description}</span>}
  </div>;
}
