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
} from "../../../../electron/media/types";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { bridge } from "@/shared/api/ipc";
import {
  ASIDE_SECTION,
  DETAIL_ACTIONS,
  DETAIL_BACK,
  DETAIL_CODE,
  DETAIL_COLUMN,
  DETAIL_COPY,
  DETAIL_EYEBROW,
  DETAIL_HEADING,
  DETAIL_HERO,
  DETAIL_LAYOUT,
  DETAIL_LEAD,
  DETAIL_ROUTE,
  DETAIL_SECTION,
  DETAIL_STATE,
  DETAIL_TITLE,
  HERO_ACTION_GLYPH,
  HERO_ACTION_PRIMARY,
  HERO_ACTION_SECONDARY,
  HERO_STATE,
  LIBRARY_COPY,
  LIBRARY_MONO,
  LIBRARY_PLATE,
  LIBRARY_ROUTE,
  LIBRARY_TITLE,
} from "../lib/detail-chrome";
import {
  projectMarketplaceModelDetail,
  type MarketplaceModelDetailDto,
} from "../lib/presentation";

/* Model-route vocabulary: the fact grid, the file inventory and the aside's evidence list. */
const FACT_CELL = "min-w-0 rounded-cell bg-surface-sunken p-2.5";
const FACT_LABEL = "type-xs text-muted";
const FACT_VALUE = "m-0 mt-1 type-sm wrap-anywhere";
const FILE_GLYPH = "w-3.25 flex-none";
const FILE_NOTE = "type-xs not-italic text-muted wrap-anywhere";
const ASIDE_LIST = "mt-2 pl-4.5 type-xs leading-copy text-muted";

const providerLabels = {
  huggingface: "Hugging Face",
  civitai: "Civitai",
  modelscope: "ModelScope",
} as const;

export const marketplaceDetailInstrumentStates = defineInstrumentScreenStates({
  routeKey: "marketplace.detail",
  states: ["loading", "ready", "unavailable", "error"],
  rootMarker: "marketplace-detail",
  landmarks: ["Item details", "Marketplace"],
} as const);

export const marketplaceInstalledInstrumentStates = defineInstrumentScreenStates({
  routeKey: "marketplace.library.installed",
  states: ["unavailable", "empty", "ready"],
  rootMarker: "marketplace-library-installed",
  landmarks: ["Installed on this Mac", "My Library"],
} as const);

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
  return <button className={`marketplace-model-back ${DETAIL_BACK}`} type="button" onClick={onBack}><ArrowLeft className={HERO_ACTION_GLYPH} aria-hidden="true" />Back to Models</button>;
}

function ModelPreview({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed
    ? <span className="marketplace-model-preview-fallback flex flex-col items-center gap-2 type-xs text-on-instrument-muted"><Cpu className="w-5" aria-hidden="true" />Provider preview unavailable</span>
    : <img className="h-full w-full max-h-80 object-contain" src={url} alt={`Preview of ${name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
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

  if (state.status === "loading") return <InstrumentScreenRoot descriptor={marketplaceDetailInstrumentStates} state="loading"><article className={`marketplace-model-detail marketplace-detail-route is-loading ${DETAIL_ROUTE} ${DETAIL_STATE}`} aria-busy="true"><BackButton onBack={onBack} /><p className="m-0 text-muted" role="status">Loading model details…</p></article></InstrumentScreenRoot>;
  if (state.status === "error") return <InstrumentScreenRoot descriptor={marketplaceDetailInstrumentStates} state="error"><article className={`marketplace-model-detail marketplace-detail-route is-error ${DETAIL_ROUTE} ${DETAIL_STATE}`}><BackButton onBack={onBack} /><p className="m-0 text-muted" role="alert">{state.message}</p></article></InstrumentScreenRoot>;

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

  return <InstrumentScreenRoot descriptor={marketplaceDetailInstrumentStates} state="ready"><article className={`marketplace-model-detail marketplace-detail-route ${DETAIL_ROUTE}`} aria-labelledby="marketplace-model-title">
    <BackButton onBack={onBack} />
    <header className={`marketplace-model-hero ${DETAIL_HERO}`}>
      <span className={`marketplace-model-provider ${DETAIL_EYEBROW}`}>Models · {provider}</span>
      <h2 className={DETAIL_TITLE} id="marketplace-model-title">{detail.name}</h2>
      <p className={DETAIL_LEAD}>{detail.author} · <code className="font-mono wrap-anywhere">{detail.id}</code></p>
      <div className={`marketplace-model-actions ${DETAIL_ACTIONS}`}>
        <button
          className={HERO_ACTION_PRIMARY}
          type="button"
          aria-disabled={onReviewDownload ? undefined : true}
          aria-describedby={onReviewDownload ? undefined : "marketplace-model-review-unavailable"}
          onClick={onReviewDownload ? () => onReviewDownload(detail) : undefined}
        >Review download</button>
        <button className={HERO_ACTION_SECONDARY} type="button" onClick={() => { void openProvider(); }}>Open on {provider}<ExternalLink className={HERO_ACTION_GLYPH} aria-hidden="true" /></button>
      </div>
      {!onReviewDownload && <p id="marketplace-model-review-unavailable" className={`marketplace-model-action-state ${HERO_STATE}`}>Download and installation are unavailable in the current Desktop contract.</p>}
      {providerError?.key === referenceKey && <p className={HERO_STATE} role="alert">{providerError.message}</p>}
    </header>

    <div className={`marketplace-model-detail-layout ${DETAIL_LAYOUT}`}>
      <div className={`marketplace-model-detail-main ${DETAIL_COLUMN}`}>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>What it gives you</h3><p className={DETAIL_COPY}>The provider describes this model as {detail.task} · {detail.modality} · {detail.modelType}.</p></section>
        {previews.length > 0
          ? <section className={DETAIL_SECTION} aria-labelledby="marketplace-model-preview-heading"><h3 className={DETAIL_HEADING} id="marketplace-model-preview-heading">Provider preview</h3><div className="marketplace-model-previews grid grid-cols-(--marketplace-preview-columns) gap-2">{previews.map((url) => <span className="marketplace-model-preview grid min-h-37.5 place-items-center overflow-hidden rounded-cell bg-frame text-on-instrument" key={url}><ModelPreview url={url} name={detail.name} /></span>)}</div></section>
          : <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Provider preview</h3><p className={DETAIL_COPY}>Provider preview media is unavailable.</p></section>}
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Use when</h3><p className={DETAIL_COPY}>Use when a Ralphy workflow explicitly supports {detail.task} through {detail.comfort.runtime}, after reviewing the compatibility evidence.</p></section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Do not use when</h3><p className={DETAIL_COPY}>Do not use when the required runtime or package format is unsupported, or before license and access terms are reviewed.</p></section>
        <section className={DETAIL_SECTION} aria-labelledby="marketplace-model-files"><h3 className={DETAIL_HEADING} id="marketplace-model-files">Versions and files</h3>
          <dl className="marketplace-model-facts m-0 mb-3 grid grid-cols-2 gap-2">
            <div className={FACT_CELL}><dt className={FACT_LABEL}>Revision</dt><dd className={FACT_VALUE}><code className={DETAIL_CODE}>{display(detail.revision, "Unavailable")}</code></dd></div>
            <div className={FACT_CELL}><dt className={FACT_LABEL}>Updated</dt><dd className={FACT_VALUE}>{display(detail.lastModified, "Unavailable")}</dd></div>
            <div className={FACT_CELL}><dt className={FACT_LABEL}>Base model</dt><dd className={FACT_VALUE}>{display(detail.baseModel, "Not declared")}</dd></div>
            <div className={FACT_CELL}><dt className={FACT_LABEL}>Recommended package</dt><dd className={FACT_VALUE}>{detail.recommendedPackage.format} · {formatBytes(detail.recommendedPackage.bytes)}</dd></div>
          </dl>
          {detail.files.length ? <ul className="marketplace-model-files m-0 flex list-none flex-col gap-1.5 p-0">{detail.files.map((file) => <li className="flex min-w-0 items-start gap-2.25 rounded-cell bg-surface-sunken px-2.5 py-2.25" key={file.name}>{file.warning ? <TriangleAlert className={`${FILE_GLYPH} text-alert`} aria-hidden="true" /> : file.recommended ? <Check className={FILE_GLYPH} aria-hidden="true" /> : <HardDrive className={FILE_GLYPH} aria-hidden="true" />}<span className="flex min-w-0 flex-col gap-0.75"><strong className="wrap-anywhere">{file.name}</strong><small className={FILE_NOTE}>{file.format} · {formatBytes(file.bytes)}{file.recommended ? " · Recommended" : ""}</small>{file.warning && <em className={`${FILE_NOTE} text-alert`}>{file.warning}</em>}</span></li>)}</ul> : <p className={DETAIL_COPY}>File inventory is unavailable from the provider.</p>}
        </section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Provider model card</h3><MarkdownView markdown={detail.readme || "No model card was provided by the current source."} baseUrl={detail.provider === "huggingface" ? `https://huggingface.co/${detail.id}/resolve/${detail.revision ?? "main"}/` : undefined} /></section>
      </div>

      <aside className={`marketplace-model-detail-aside ${DETAIL_COLUMN}`}>
        <section className={ASIDE_SECTION} aria-labelledby="marketplace-model-compatibility"><h3 className={DETAIL_HEADING} id="marketplace-model-compatibility">Compatibility</h3><strong className="text-ink">{detail.comfort.label}</strong><p className={DETAIL_COPY}>This is source and machine evidence, not a measured inference benchmark.</p>{detail.comfort.evidence.length ? <ul className={ASIDE_LIST}>{detail.comfort.evidence.map((line) => <li key={line}>{line}</li>)}</ul> : <p className={DETAIL_COPY}>Compatibility evidence is unavailable.</p>}</section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>License and access</h3><strong className="text-ink">{display(detail.license, "License not declared")}</strong><p className={DETAIL_COPY}>{detail.gated ? "Provider access is required before any files can be fetched." : "The provider reports public access. Review its terms before use."}</p>{detail.permissions.map((permission) => <p className={DETAIL_COPY} key={permission}>{permission}</p>)}</section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Local installation</h3><p className={DETAIL_COPY}>{localStateCopy(detail)}</p><p className={DETAIL_COPY}>Required runtime · {detail.comfort.runtime}</p></section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Used by Ralphy</h3><p className={DETAIL_COPY}>Usage backlinks are unavailable from the current Desktop contract.</p></section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Works with</h3><p className={DETAIL_COPY}>Related Marketplace items are unavailable from the current contract.</p></section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Used by</h3><p className={DETAIL_COPY}>Workspace, project, and chat backlinks are unavailable from the current contract.</p></section>
      </aside>
    </div>
  </article></InstrumentScreenRoot>;
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
  const instrumentState = !current || !runtime?.available ? "unavailable" : installed.length === 0 ? "empty" : "ready";
  return <InstrumentScreenRoot descriptor={marketplaceInstalledInstrumentStates} state={instrumentState}><section className={`marketplace-installed-models ${LIBRARY_ROUTE}`} aria-labelledby="marketplace-installed-models-title">
    <header className="flex items-center justify-between gap-4 @max-marketplace-split/main-region:flex-col @max-marketplace-split/main-region:items-start"><span><small>My Library · Models</small><h2 className={LIBRARY_TITLE} id="marketplace-installed-models-title">Installed on this Mac</h2></span><button className="inline-flex h-8 items-center gap-1.75 rounded-control bg-surface px-2.75 text-ink" type="button" disabled={refreshing} onClick={() => { void refresh(); }}><RefreshCw className="w-3.25" aria-hidden="true" />{refreshing ? "Checking…" : "Re-check this Mac"}</button></header>
    <p className={LIBRARY_COPY}>Registered in Ollama</p>
    {error && <p className={LIBRARY_COPY} role="alert">{error}</p>}
    {!current ? <div className={LIBRARY_PLATE} role="status">Runtime inventory is unavailable until this Mac is checked.</div>
      : !runtime?.available ? <div className={LIBRARY_PLATE} role="status">Ollama was not detected. No runtime registration is claimed.</div>
        : installed.length === 0 ? <div className={LIBRARY_PLATE} role="status">No models are registered in Ollama.</div>
          : <ul className="m-0 flex list-none flex-col gap-2 p-0" role="list">{installed.map((model) => <li className="grid min-h-18 min-w-0 grid-cols-(--marketplace-installed-columns) items-center gap-3 rounded-cell bg-surface px-3.5 py-3 @max-marketplace-split/main-region:grid-cols-(--marketplace-row-columns-narrow)" key={`${model.runtime}:${model.id}`}><Cpu className="w-4.25" aria-hidden="true" /><span className="flex min-w-0 flex-col gap-0.75"><strong>{model.name}</strong><code className={LIBRARY_MONO}>{model.digest}</code><small className={LIBRARY_MONO}>{model.format} · {formatBytes(model.bytes)} · Registered in Ollama</small></span><em className={`${LIBRARY_MONO} @max-marketplace-split/main-region:col-start-2`}>Load health is unavailable</em></li>)}</ul>}
    <p className="marketplace-installed-note m-0 font-mono type-sm leading-copy text-muted wrap-anywhere">Load health is unavailable because the current runtime inventory has no load-test contract.</p>
  </section></InstrumentScreenRoot>;
}
