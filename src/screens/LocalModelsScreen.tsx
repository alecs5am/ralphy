import {
  ArrowDownToLine,
  Check,
  Cpu,
  ExternalLink,
  HardDrive,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  LocalInstalledModel,
  LocalModelCatalog,
  LocalModelDetail,
  LocalModelMachine,
  LocalModelProvider,
  LocalModelRuntimeId,
  LocalModelSummary,
} from "../../electron/media/types";
import { MarkdownView } from "../components/MarkdownView";
import { SelectMenu } from "../components/ui/SelectMenu";
import { bridge } from "../lib/ipc";

type View = "browse" | "installed";
type Sort = "trending" | "downloads" | "updated" | "comfort" | "size";

const SORTS: { value: Sort; label: string }[] = [
  { value: "trending", label: "TRENDING" },
  { value: "downloads", label: "MOST DOWNLOADED" },
  { value: "updated", label: "RECENTLY UPDATED" },
  { value: "comfort", label: "RUNS BEST HERE" },
  { value: "size", label: "SMALLEST DOWNLOAD" },
];

const PROVIDERS: Record<LocalModelProvider, { label: string; mark: string }> = {
  huggingface: { label: "Hugging Face", mark: "assets/providers/huggingface.svg" },
  civitai: { label: "Civitai", mark: "assets/providers/civitai.svg" },
  modelscope: { label: "ModelScope", mark: "assets/providers/modelscope.svg" },
};

function FacetSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  return (
    <SelectMenu
      className={`local-model-facet${value !== "all" ? " is-active" : ""}`}
      value={value}
      options={[{ value: "all", label }, ...options]}
      ariaLabel={label}
      onValueChange={onChange}
    />
  );
}

function bytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "SIZE UNKNOWN";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ProviderMark({ provider }: { provider: LocalModelProvider }) {
  const item = PROVIDERS[provider];
  return <img className="local-model-provider-mark" src={item.mark} alt={item.label} title={item.label} />;
}

function brandIconFor(model: LocalModelSummary): string | null {
  const identity = `${model.id} ${model.name}`.toLocaleLowerCase();
  if (/minimax|minmax|\babab\b/.test(identity)) return "assets/models/minimax-color.svg";
  if (/qwen|\bqwq\b/.test(identity)) return "assets/models/qwen-color.svg";
  return null;
}

function ModelPlate({ model }: { model: LocalModelSummary }) {
  const format = model.recommendedPackage.format;
  const mark = /safetensor/i.test(format) ? "ST" : /gguf/i.test(format) ? "GGUF" : format.slice(0, 4).toUpperCase();
  const brandIcon = brandIconFor(model);
  const source = model.previewUrl ?? model.iconUrl ?? brandIcon;
  return (
    <span className={`local-model-plate local-model-plate-${model.provider}`} aria-hidden="true">
      <span>{mark}</span>
      {source && <img className={source === brandIcon ? "is-brand" : undefined} src={source} alt="" onError={(event) => event.currentTarget.remove()} />}
    </span>
  );
}

function ComfortBars({ score }: { score: number }) {
  return (
    <span className="local-model-comfort-bars" aria-label={`${score} of 4 comfort bars`}>
      {[0, 1, 2, 3].map((index) => <i className={index < score ? "is-on" : ""} key={index} />)}
    </span>
  );
}

function MachineStrip({ machine, onRefresh }: { machine: LocalModelMachine; onRefresh(): void }) {
  return (
    <div className="local-model-machine-strip">
      <Cpu size={14} aria-hidden="true" />
      <span className="local-model-machine-line">
        {machine.platform} · {machine.cpu} · {bytes(machine.totalMemoryBytes)} MEMORY · {bytes(machine.freeDiskBytes)} FREE
      </span>
      <span className="local-model-divider" />
      {machine.runtimes.map((runtime) => (
        <span className={`local-model-runtime${runtime.available ? " is-ready" : ""}`} title={runtime.detail} key={runtime.id}>
          <i />{runtime.label}
        </span>
      ))}
      <span className="local-model-machine-note">Performance is estimated from memory, disk and runtime availability</span>
      <button className="local-model-quiet-button" type="button" onClick={onRefresh}>
        <RefreshCw size={11} aria-hidden="true" /> Re-check
      </button>
    </div>
  );
}

function ModelRow({ model, onOpen }: { model: LocalModelSummary; onOpen(): void }) {
  const provider = PROVIDERS[model.provider];
  const setupRequired = model.comfort.level === "unknown" && model.comfort.evidence.some((line) => line.includes("not detected"));
  return (
    <article className="local-model-row" role="listitem" tabIndex={0} onClick={onOpen} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onOpen();
    }}>
      <ModelPlate model={model} />
      <div className="local-model-row-identity">
        <span className="local-model-row-name">
          {model.name}
          {model.gated && <small>Gated</small>}
        </span>
        <span className="local-model-row-meta">
          <ProviderMark provider={model.provider} />
          <b>{model.id}</b><i />
          {titleCase(model.task)}<i />
          {bytes(model.recommendedPackage.bytes)}
        </span>
      </div>
      <div className="local-model-row-popularity">
        <span className={`local-model-comfort local-model-comfort-${model.comfort.level}`}>
          <ComfortBars score={model.comfort.score} />
          {model.comfort.estimatedMemoryBytes ? `~${bytes(model.comfort.estimatedMemoryBytes)} peak` : "No resource estimate"}
        </span>
        <span>ESTIMATED · {bytes(model.recommendedPackage.bytes)} PACKAGE · {compact(model.downloads)} DOWNLOADS</span>
      </div>
      <div className="local-model-row-comfort">
        <span className={`local-model-comfort local-model-comfort-${model.comfort.level}`}>
          <ComfortBars score={model.comfort.score} />
          {model.comfort.label}
        </span>
        <small>{model.comfort.evidence.join(" · ") || `Not enough package data from ${provider.label}`}</small>
      </div>
      <div className="local-model-row-action">
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          {model.gated ? "Review access" : setupRequired ? "Setup required" : "View details"}
        </button>
      </div>
    </article>
  );
}

function InstalledRow({ model }: { model: LocalInstalledModel }) {
  return (
    <article className="local-model-installed-row">
      <span className="local-model-plate local-model-plate-huggingface" aria-hidden="true"><span>{model.format.slice(0, 4)}</span></span>
      <span className="local-model-installed-identity"><strong>{model.name}</strong><small>{model.digest} · {titleCase(model.runtime)}</small></span>
      <span className="local-model-installed-health"><i />Registered in {titleCase(model.runtime)}</span>
      <span className="local-model-installed-disk"><strong>{bytes(model.bytes)}</strong><small>{model.format}</small></span>
      <button type="button" disabled title="Load testing and model selection will be added with local generation">Registered</button>
    </article>
  );
}

function DetailDialog({ detail, loading, onClose }: {
  detail: LocalModelDetail | null;
  loading: boolean;
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => (closeRef.current ?? dialogRef.current)?.focus(), [detail]);
  const visibleFiles = detail ? [...detail.files]
    .sort((left, right) => Number(right.recommended) - Number(left.recommended) || Number(Boolean(right.warning)) - Number(Boolean(left.warning)))
    .slice(0, 8) : [];
  return createPortal(
    <div className="local-model-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="local-model-dialog" role="dialog" aria-modal="true" aria-label="Model details" tabIndex={-1} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        {loading || !detail ? (
          <div className="local-model-dialog-loading">Loading model card…</div>
        ) : (
          <>
            <header className="local-model-dialog-header">
              <ModelPlate model={detail} />
              <span>
                <small><ProviderMark provider={detail.provider} />{PROVIDERS[detail.provider].label} · {detail.author}</small>
                <h2>{detail.name}</h2>
                <code>{detail.id}</code>
              </span>
              <button ref={closeRef} type="button" aria-label="Close model details" onClick={onClose}><X size={15} /></button>
            </header>
            <div className="local-model-dialog-body">
              <div className="local-model-card-column">
                {detail.previewUrls.length > 0 && (
                  <section><small className="local-model-section-label">PROVIDER PREVIEWS</small><div className="local-model-previews">
                    {detail.previewUrls.slice(0, 5).map((url) => <img src={url} alt="Model preview" onError={(event) => event.currentTarget.remove()} key={url} />)}
                  </div></section>
                )}
                <div className="local-model-tags">
                  {[detail.task, detail.modality, detail.modelType, detail.recommendedPackage.format, detail.license ?? "License not declared"].map((tag) => <span key={tag}>{titleCase(tag)}</span>)}
                </div>
                <div className="local-model-card-metadata">
                  <section>
                    <small className="local-model-section-label">RECOMMENDED PACKAGE</small>
                    <h3>{detail.recommendedPackage.format}</h3>
                    <p>{bytes(detail.recommendedPackage.bytes)} · {detail.recommendedPackage.files.length || detail.files.length} selected files</p>
                    <div className="local-model-file-list">
                      {visibleFiles.map((file) => (
                        <span className={`${file.recommended ? "is-recommended" : ""}${file.warning ? " has-warning" : ""}`} title={file.warning ?? undefined} key={file.name}>
                          {file.warning ? <TriangleAlert size={10} /> : file.recommended ? <Check size={10} /> : <i />}
                          <b>{file.name}</b><em>{file.warning ?? bytes(file.bytes)}</em>
                        </span>
                      ))}
                    </div>
                  </section>
                  <section>
                    <small className="local-model-section-label">MODEL SOURCE</small>
                    <div className="local-model-facts">
                      <span><b>Revision</b><code>{detail.revision?.slice(0, 12) ?? "Remote head"}</code></span>
                      <span><b>Base model</b><code>{detail.baseModel ?? "Not declared"}</code></span>
                      <span><b>Updated</b><code>{detail.lastModified ? new Date(detail.lastModified).toLocaleDateString() : "Unknown"}</code></span>
                    </div>
                  </section>
                  <section>
                    <small className="local-model-section-label">ACCESS & LICENSE</small>
                    <h3>{detail.license ?? "License not declared"}</h3>
                    <p>{detail.gated ? "Provider access is required before any files can be fetched." : "Public provider page. Review the model card before use."}</p>
                    {detail.permissions.map((permission) => <p key={permission}>{permission}</p>)}
                  </section>
                </div>
                <small className="local-model-section-label">MODEL CARD</small>
                <MarkdownView
                  markdown={detail.readme || "No model card was provided by this catalogue."}
                  baseUrl={detail.provider === "huggingface" ? `https://huggingface.co/${detail.id}/resolve/${detail.revision ?? "main"}/` : undefined}
                />
              </div>
              <aside className="local-model-detail-rail">
                <section className={`local-model-performance local-model-performance-${detail.comfort.level}`}>
                  <small>FIT ON THIS COMPUTER</small>
                  <h3><ComfortBars score={detail.comfort.score} />{detail.comfort.label}</h3>
                  <p>This is a resource estimate, not a measured inference benchmark.</p>
                  <ul>{detail.comfort.evidence.map((line) => <li key={line}>{line.includes("not detected") ? <TriangleAlert size={11} /> : <Check size={11} />}{line}</li>)}</ul>
                </section>
                <section>
                  <small>USED BY RALPHY</small>
                  <h3>Not assigned</h3>
                  <p>Model loading and workspace assignment will be added with local generation.</p>
                </section>
              </aside>
            </div>
            <footer className="local-model-dialog-footer">
              <span>No files will be downloaded in this release.</span>
              <button type="button" onClick={() => void bridge.openLocalModelProvider(detail.providerUrl)}>
                Open on {PROVIDERS[detail.provider].label} <ExternalLink size={12} />
              </button>
            </footer>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}

export function LocalModelsScreen() {
  const [view, setView] = useState<View>("browse");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<"all" | LocalModelProvider>("all");
  const [modality, setModality] = useState<"all" | LocalModelSummary["modality"]>("all");
  const [format, setFormat] = useState<"all" | "GGUF" | "Safetensors" | "ONNX" | "MLX">("all");
  const [licensedOnly, setLicensedOnly] = useState(false);
  const [runsWell, setRunsWell] = useState(false);
  const [stateFilter, setStateFilter] = useState<"all" | LocalModelSummary["state"]>("all");
  const [installedModality, setInstalledModality] = useState<"all" | "unknown">("all");
  const [installedRuntime, setInstalledRuntime] = useState<"all" | LocalModelRuntimeId>("all");
  const [installedHealth, setInstalledHealth] = useState<"all" | "registered">("all");
  const [installedUsage, setInstalledUsage] = useState<"all" | "unused">("all");
  const [sort, setSort] = useState<Sort>("trending");
  const [catalog, setCatalog] = useState<LocalModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LocalModelDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => {
    if (view === "installed") return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await bridge.searchLocalModels({ query, provider, sort, limit: 10 });
        if (active) setCatalog(next);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (active) setLoading(false);
      }
    };
    const timer = query ? window.setTimeout(() => void load(), 240) : null;
    if (!timer) void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [provider, query, sort, view]);

  useEffect(() => {
    if (view !== "installed") return;
    void bridge.refreshLocalModelMachine()
      .then((machine) => setCatalog((current) => current ? { ...current, machine } : current))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [view]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dialogOpen) {
        setDialogOpen(false);
        window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
      }
      else if (drawerOpen) setDrawerOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialogOpen, drawerOpen]);

  const models = useMemo(() => (catalog?.items ?? []).filter((model) => (
    (modality === "all" || model.modality === modality)
    && (format === "all" || model.recommendedPackage.format.toLowerCase().includes(format.toLowerCase()))
    && (!licensedOnly || model.license !== null)
    && (!runsWell || model.comfort.score >= 3)
    && (stateFilter === "all" || model.state === stateFilter)
  )), [catalog?.items, format, licensedOnly, modality, runsWell, stateFilter]);

  const filters = [
    provider !== "all" ? { key: "provider", label: PROVIDERS[provider].label, clear: () => setProvider("all") } : null,
    modality !== "all" ? { key: "modality", label: titleCase(modality), clear: () => setModality("all") } : null,
    format !== "all" ? { key: "format", label: format, clear: () => setFormat("all") } : null,
    licensedOnly ? { key: "license", label: "License declared", clear: () => setLicensedOnly(false) } : null,
    runsWell ? { key: "runs", label: "Runs well here", clear: () => setRunsWell(false) } : null,
    stateFilter !== "all" ? { key: "state", label: titleCase(stateFilter), clear: () => setStateFilter("all") } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const openDetail = async (model: LocalModelSummary) => {
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialogOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await bridge.loadLocalModelDetail({ provider: model.provider, id: model.id }));
    } catch (cause) {
      setDialogOpen(false);
      window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDialogOpen(false);
    window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
  };

  const recheck = async () => {
    try {
      setLoading(true);
      if (view === "installed") {
        const machine = await bridge.refreshLocalModelMachine();
        setCatalog((current) => current ? { ...current, machine } : current);
      } else {
        setCatalog(await bridge.searchLocalModels({ query, provider, sort, limit: 10 }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setProvider("all");
    setModality("all");
    setFormat("all");
    setLicensedOnly(false);
    setRunsWell(false);
    setStateFilter("all");
  };

  const installed = (catalog?.machine.installed ?? []).filter((item) => (
    (installedModality === "all" || installedModality === "unknown")
    && (installedRuntime === "all" || item.runtime === installedRuntime)
    && (installedHealth === "all" || installedHealth === "registered")
    && (installedUsage === "all" || installedUsage === "unused")
    && (!query.trim() || `${item.name} ${item.id} ${item.format}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  ));
  const readyRuntimes = catalog?.machine.runtimes.filter((runtime) => runtime.available).length ?? 0;

  return (
    <main className={`local-models-region${drawerOpen ? " has-downloads" : ""}`}>
      <header className="local-models-topbar">
        <span>Application · this computer</span>
        <span className="local-models-topbar-spacer" />
        <button className={readyRuntimes > 0 ? "has-runtime" : ""} type="button" onClick={() => void recheck()}><i />{readyRuntimes} of {catalog?.machine.runtimes.length ?? 0} runtimes</button>
        <span>{bytes(installed.reduce((sum, item) => sum + item.bytes, 0))} IN MODEL CACHE</span>
        <button type="button" className={drawerOpen ? "is-active" : ""} onClick={() => setDrawerOpen((open) => !open)}>
          <ArrowDownToLine size={13} />Downloads <b>0</b>
        </button>
      </header>

      <section className="local-models-title-row">
        <span><h1>Local Models</h1><p>Open models available on this computer and shared by every workspace</p></span>
        <span><strong>{view === "browse" ? `${models.length} RESULTS · ${models.filter((model) => model.comfort.score >= 3).length} LIKELY TO FIT` : `${installed.length} PACKAGES · REGISTERED IN RUNTIME`}</strong><small>{view === "browse" ? "HUGGING FACE + CIVITAI · LIVE CATALOGUES" : `${bytes(installed.reduce((sum, item) => sum + item.bytes, 0))} IN CACHE · ${bytes(catalog?.machine.freeDiskBytes)} FREE`}</small></span>
      </section>

      <section className="local-models-controls">
        <div className="local-models-segments" role="tablist">
          <button className={view === "browse" ? "is-active" : ""} type="button" role="tab" aria-selected={view === "browse"} onClick={() => setView("browse")}>Browse</button>
          <button className={view === "installed" ? "is-active" : ""} type="button" role="tab" aria-selected={view === "installed"} onClick={() => setView("installed")}>Installed</button>
        </div>
        <label className="local-model-search"><Search size={13} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "browse" ? "Search models, authors, tasks" : "Search installed models"} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={9} /></button>}</label>
        <span className="local-model-divider" />
        {view === "browse" ? (
          <>
            <FacetSelect label="Provider" value={provider} options={Object.entries(PROVIDERS).map(([value, item]) => ({ value, label: item.label }))} onChange={(value) => setProvider(value as typeof provider)} />
            <FacetSelect label="Modality" value={modality} options={["text", "image", "video", "audio", "multimodal"].map((value) => ({ value, label: titleCase(value) }))} onChange={(value) => setModality(value as typeof modality)} />
            <FacetSelect label="Format" value={format} options={["GGUF", "Safetensors", "ONNX", "MLX"].map((value) => ({ value, label: value }))} onChange={(value) => setFormat(value as typeof format)} />
            <FacetSelect label="License" value={licensedOnly ? "declared" : "all"} options={[{ value: "declared", label: "License declared" }]} onChange={(value) => setLicensedOnly(value === "declared")} />
            <FacetSelect label="Runs well here" value={runsWell ? "yes" : "all"} options={[{ value: "yes", label: "Comfortable or usable" }]} onChange={(value) => setRunsWell(value === "yes")} />
            <FacetSelect label="State" value={stateFilter} options={[{ value: "remote", label: "Remote" }, { value: "gated", label: "Gated" }]} onChange={(value) => setStateFilter(value as typeof stateFilter)} />
          </>
        ) : <>
          <FacetSelect label="Modality" value={installedModality} options={[{ value: "unknown", label: "Not declared by runtime" }]} onChange={(value) => setInstalledModality(value as typeof installedModality)} />
          <FacetSelect label="Runtime" value={installedRuntime} options={["ollama", "diffusers", "transformers", "mlx"].map((value) => ({ value, label: titleCase(value) }))} onChange={(value) => setInstalledRuntime(value as typeof installedRuntime)} />
          <FacetSelect label="Health" value={installedHealth} options={[{ value: "registered", label: "Registered · not load-tested" }]} onChange={(value) => setInstalledHealth(value as typeof installedHealth)} />
          <FacetSelect label="Usage" value={installedUsage} options={[{ value: "unused", label: "Unused by Ralphy" }]} onChange={(value) => setInstalledUsage(value as typeof installedUsage)} />
        </>}
        <span className="local-model-controls-spacer" />
        <SelectMenu<Sort> className="local-model-sort" value={sort} options={SORTS} ariaLabel="Sort models" align="end" onValueChange={setSort} />
      </section>

      {filters.length > 0 && view === "browse" && (
        <section className="local-model-active-filters">
          {filters.map((filter) => <span key={filter.key}>{filter.label}<button type="button" aria-label={`Remove ${filter.label} filter`} onClick={filter.clear}><X size={8} /></button></span>)}
          <button type="button" onClick={clearFilters}>Clear all</button>
          <small>{catalog?.items.length ?? 0} → {models.length} RESULTS</small>
        </section>
      )}

      {view === "browse" && catalog && <MachineStrip machine={catalog.machine} onRefresh={() => void recheck()} />}
      {Boolean(error || catalog?.errors.length) && <div className="local-model-error" role="alert">{error ?? catalog?.errors.map((item) => `${PROVIDERS[item.provider].label}: ${item.message}`).join(" · ")}<button type="button" onClick={() => void recheck()}>Retry</button></div>}

      <section className="local-models-body">
        {loading && !catalog ? <div className="local-model-empty">Loading live model catalogues…</div> : view === "browse" ? (
          models.length > 0 ? <div className="local-model-list" role="list">{models.map((model) => <ModelRow model={model} onOpen={() => void openDetail(model)} key={`${model.provider}:${model.id}`} />)}<footer>SEARCH RANKING IS DISCOVERY EVIDENCE, NOT A QUALITY OR SAFETY GUARANTEE</footer></div> : <div className="local-model-empty"><Search size={20} /><h2>{catalog?.errors.length ? "Catalogues are unavailable" : "No matching models"}</h2><p>{catalog?.errors.length ? "Retry the live provider request." : "Clear filters or try a provider model ID."}</p></div>
        ) : installed.length > 0 ? (
          <div className="local-model-installed-list"><header><HardDrive size={12} />REGISTERED IN LOCAL RUNTIME <b>{installed.length}</b><span />Load health has not been tested</header>{installed.map((item) => <InstalledRow model={item} key={`${item.runtime}:${item.id}`} />)}</div>
        ) : <div className="local-model-empty"><HardDrive size={20} /><h2>No local runtime models found</h2><p>Models registered in Ollama will appear here automatically.</p></div>}
      </section>

      {drawerOpen && (
        <aside className="local-model-downloads" aria-label="Downloads">
          <header><span><ArrowDownToLine size={14} />Downloads</span><button type="button" aria-label="Close downloads" onClick={() => setDrawerOpen(false)}><X size={13} /></button></header>
          <div><ArrowDownToLine size={20} /><h2>No downloads yet</h2><p>Download and installation support is intentionally postponed. Catalogue browsing and computer-fit estimates are live.</p></div>
        </aside>
      )}
      {dialogOpen && <DetailDialog detail={detail} loading={detailLoading} onClose={closeDetail} />}
    </main>
  );
}
