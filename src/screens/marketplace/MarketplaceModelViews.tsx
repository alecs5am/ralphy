import {
  ArrowLeft,
  Check,
  Cpu,
  ExternalLink,
  HardDrive,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  LocalModelMachine,
  LocalModelReference,
} from "../../../electron/media/types";
import { MarkdownView } from "../../components/MarkdownView";
import { bridge } from "../../lib/ipc";
import {
  projectMarketplaceModelDetail,
  type MarketplaceModelDetailDto,
} from "./presentation";

const providerLabels = {
  huggingface: "Hugging Face",
  civitai: "Civitai",
  modelscope: "ModelScope",
} as const;

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function display(value: string | null, unavailableCopy: string): string {
  return value?.trim() ? value : unavailableCopy;
}

function detailError(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 1_024);
}

export interface MarketplaceModelDetailProps {
  reference: LocalModelReference;
  onBack(): void;
  onReviewDownload?(model: MarketplaceModelDetailDto): void;
}

export type MarketplaceModelDetailState =
  | { status: "loading" }
  | { status: "ready"; value: MarketplaceModelDetailDto }
  | { status: "error"; message: string };

export function useMarketplaceModelDetail(reference: LocalModelReference): MarketplaceModelDetailState {
  const key = `${reference.provider}:${reference.id}`;
  const generation = useRef(0);
  const [result, setResult] = useState<{ key: string; state: MarketplaceModelDetailState }>({
    key,
    state: { status: "loading" },
  });
  useEffect(() => {
    const requestGeneration = ++generation.current;
    let cancelled = false;
    setResult({ key, state: { status: "loading" } });
    void bridge.loadLocalModelDetail(reference).then(
      (value) => {
        if (!cancelled && requestGeneration === generation.current) {
          setResult({ key, state: { status: "ready", value: projectMarketplaceModelDetail(value) } });
        }
      },
      (cause) => {
        if (!cancelled && requestGeneration === generation.current) {
          setResult({ key, state: { status: "error", message: detailError(cause) } });
        }
      },
    );
    return () => {
      cancelled = true;
      generation.current += 1;
    };
  }, [key]);
  return result.key === key ? result.state : { status: "loading" };
}

function BackButton({ onBack }: { onBack(): void }) {
  return <button className="marketplace-model-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />Back to Models</button>;
}

function ModelPreview({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed
    ? <span className="marketplace-model-preview-fallback"><Cpu aria-hidden="true" />Provider preview unavailable</span>
    : <img src={url} alt={`Preview of ${name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function localStateCopy(detail: MarketplaceModelDetailDto): string {
  if (detail.state === "ready") return "The current model contract reports this package as ready.";
  if (detail.state === "downloaded") return "Files are downloaded, but runtime registration and load health are not confirmed.";
  if (detail.state === "gated") return "Provider access is required before local files can be fetched.";
  return "No downloaded or runtime-registered state was returned for this model.";
}

export function MarketplaceModelDetail({ reference, onBack, onReviewDownload }: MarketplaceModelDetailProps) {
  const state = useMarketplaceModelDetail(reference);
  const referenceKey = `${reference.provider}:${reference.id}`;
  const actionGeneration = useRef(0);
  const [providerError, setProviderError] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => () => { actionGeneration.current += 1; }, [reference.id, reference.provider]);

  if (state.status === "loading") return <article className="marketplace-model-detail marketplace-detail-route is-loading" aria-busy="true"><BackButton onBack={onBack} /><p role="status">Loading model details…</p></article>;
  if (state.status === "error") return <article className="marketplace-model-detail marketplace-detail-route is-error"><BackButton onBack={onBack} /><p role="alert">{state.message}</p></article>;

  const detail = state.value;
  const provider = providerLabels[detail.provider];
  const previews = detail.previewUrls.length ? detail.previewUrls.slice(0, 5) : [detail.previewUrl].filter((url): url is string => url !== null);
  const openProvider = async () => {
    const requestGeneration = ++actionGeneration.current;
    setProviderError(null);
    try {
      await bridge.openLocalModelProvider(detail.providerUrl);
    } catch {
      if (requestGeneration === actionGeneration.current) {
        setProviderError({ key: referenceKey, message: "The provider page could not be opened." });
      }
    }
  };

  return <article className="marketplace-model-detail marketplace-detail-route" aria-labelledby="marketplace-model-title">
    <BackButton onBack={onBack} />
    <header className="marketplace-model-hero">
      <span className="marketplace-model-provider">Models · {provider}</span>
      <h2 id="marketplace-model-title">{detail.name}</h2>
      <p>{detail.author} · <code>{detail.id}</code></p>
      <div className="marketplace-model-actions">
        <button
          type="button"
          aria-disabled={onReviewDownload ? undefined : true}
          aria-describedby={onReviewDownload ? undefined : "marketplace-model-review-unavailable"}
          onClick={onReviewDownload ? () => onReviewDownload(detail) : undefined}
        >Review download</button>
        <button type="button" onClick={() => { void openProvider(); }}>Open on {provider}<ExternalLink aria-hidden="true" /></button>
      </div>
      {!onReviewDownload && <p id="marketplace-model-review-unavailable" className="marketplace-model-action-state">Download and installation are unavailable in the current Desktop contract.</p>}
      {providerError?.key === referenceKey && <p role="alert">{providerError.message}</p>}
    </header>

    <div className="marketplace-model-detail-layout">
      <div className="marketplace-model-detail-main">
        <section><h3>What it gives you</h3><p>The provider describes this model as {detail.task} · {detail.modality} · {detail.modelType}.</p></section>
        {previews.length > 0
          ? <section aria-labelledby="marketplace-model-preview-heading"><h3 id="marketplace-model-preview-heading">Provider preview</h3><div className="marketplace-model-previews">{previews.map((url) => <span className="marketplace-model-preview" key={url}><ModelPreview url={url} name={detail.name} /></span>)}</div></section>
          : <section><h3>Provider preview</h3><p>Provider preview media is unavailable.</p></section>}
        <section><h3>Use when</h3><p>Use when a Ralphy workflow explicitly supports {detail.task} through {detail.comfort.runtime}, after reviewing the compatibility evidence.</p></section>
        <section><h3>Do not use when</h3><p>Do not use when the required runtime or package format is unsupported, or before license and access terms are reviewed.</p></section>
        <section aria-labelledby="marketplace-model-files"><h3 id="marketplace-model-files">Versions and files</h3>
          <dl className="marketplace-model-facts">
            <div><dt>Revision</dt><dd><code>{display(detail.revision, "Unavailable")}</code></dd></div>
            <div><dt>Updated</dt><dd>{display(detail.lastModified, "Unavailable")}</dd></div>
            <div><dt>Base model</dt><dd>{display(detail.baseModel, "Not declared")}</dd></div>
            <div><dt>Recommended package</dt><dd>{detail.recommendedPackage.format} · {formatBytes(detail.recommendedPackage.bytes)}</dd></div>
          </dl>
          {detail.files.length ? <ul className="marketplace-model-files">{detail.files.map((file) => <li key={file.name} className={file.warning ? "has-warning" : ""}>{file.warning ? <TriangleAlert aria-hidden="true" /> : file.recommended ? <Check aria-hidden="true" /> : <HardDrive aria-hidden="true" />}<span><strong>{file.name}</strong><small>{file.format} · {formatBytes(file.bytes)}{file.recommended ? " · Recommended" : ""}</small>{file.warning && <em>{file.warning}</em>}</span></li>)}</ul> : <p>File inventory is unavailable from the provider.</p>}
        </section>
        <section><h3>Provider model card</h3><MarkdownView markdown={detail.readme || "No model card was provided by the current source."} baseUrl={detail.provider === "huggingface" ? `https://huggingface.co/${detail.id}/resolve/${detail.revision ?? "main"}/` : undefined} /></section>
      </div>

      <aside className="marketplace-model-detail-aside">
        <section aria-labelledby="marketplace-model-compatibility"><h3 id="marketplace-model-compatibility">Compatibility</h3><strong>{detail.comfort.label}</strong><p>This is source and machine evidence, not a measured inference benchmark.</p>{detail.comfort.evidence.length ? <ul>{detail.comfort.evidence.map((line) => <li key={line}>{line}</li>)}</ul> : <p>Compatibility evidence is unavailable.</p>}</section>
        <section><h3>License and access</h3><strong>{display(detail.license, "License not declared")}</strong><p>{detail.gated ? "Provider access is required before any files can be fetched." : "The provider reports public access. Review its terms before use."}</p>{detail.permissions.map((permission) => <p key={permission}>{permission}</p>)}</section>
        <section><h3>Local installation</h3><p>{localStateCopy(detail)}</p><p>Required runtime · {detail.comfort.runtime}</p></section>
        <section><h3>Used by Ralphy</h3><p>Usage backlinks are unavailable from the current Desktop contract.</p></section>
        <section><h3>Works with</h3><p>Related Marketplace items are unavailable from the current contract.</p></section>
        <section><h3>Used by</h3><p>Workspace, project, and chat backlinks are unavailable from the current contract.</p></section>
      </aside>
    </div>
  </article>;
}

export function MarketplaceInstalledModels({ machine }: { machine: LocalModelMachine | null }) {
  const generation = useRef(0);
  const [current, setCurrent] = useState(machine);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setCurrent(machine), [machine]);
  useEffect(() => () => { generation.current += 1; }, []);
  const refresh = async () => {
    const requestGeneration = ++generation.current;
    setRefreshing(true);
    setError(null);
    try {
      const value = await bridge.refreshLocalModelMachine();
      if (requestGeneration === generation.current) setCurrent(value);
    } catch (cause) {
      if (requestGeneration === generation.current) setError(detailError(cause));
    } finally {
      if (requestGeneration === generation.current) setRefreshing(false);
    }
  };
  const runtime = current?.runtimes.find(({ id }) => id === "ollama") ?? null;
  const installed = current?.installed?.filter(({ runtime: id }) => id === "ollama") ?? [];
  return <section className="marketplace-installed-models" aria-labelledby="marketplace-installed-models-title">
    <header><span><small>My Library · Models</small><h2 id="marketplace-installed-models-title">Installed on this Mac</h2></span><button type="button" disabled={refreshing} onClick={() => { void refresh(); }}><RefreshCw aria-hidden="true" />{refreshing ? "Checking…" : "Re-check this Mac"}</button></header>
    <p>Registered in Ollama</p>
    {error && <p role="alert">{error}</p>}
    {!current ? <div role="status">Runtime inventory is unavailable until this Mac is checked.</div>
      : !runtime?.available ? <div role="status">Ollama was not detected. No runtime registration is claimed.</div>
        : installed.length === 0 ? <div role="status">No models are registered in Ollama.</div>
          : <ul role="list">{installed.map((model) => <li key={`${model.runtime}:${model.id}`}><Cpu aria-hidden="true" /><span><strong>{model.name}</strong><code>{model.digest}</code><small>{model.format} · {formatBytes(model.bytes)} · Registered in Ollama</small></span><em>Load health is unavailable</em></li>)}</ul>}
    <p className="marketplace-installed-note">Load health is unavailable because the current runtime inventory has no load-test contract.</p>
  </section>;
}
