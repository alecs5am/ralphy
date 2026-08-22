import { ArrowLeft, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownView } from "../../components/MarkdownView";
import { bridge } from "../../lib/ipc";
import {
  ASIDE_SECTION,
  DETAIL_ACTIONS,
  DETAIL_BACK,
  DETAIL_COLUMN,
  DETAIL_COPY,
  DETAIL_EYEBROW,
  DETAIL_HEADING,
  DETAIL_HERO,
  DETAIL_LAYOUT,
  DETAIL_LEAD,
  DETAIL_ROUTE,
  DETAIL_SECTION,
  DETAIL_SUBHEADING,
  DETAIL_TITLE,
  HERO_ACTION_GLYPH,
  HERO_ACTION_PRIMARY,
  HERO_ACTION_SECONDARY,
  HERO_STATE,
} from "./detail-chrome";
import { marketplacePublicMediaKind, type Availability, type MarketplaceItemPresentation } from "./presentation";

/* Public-detail vocabulary: the provenance rail reads as a label/value table, and the recipe
   artifact is a source block rather than prose. */
const FACT_ROW = "flex min-w-0 items-start gap-2.5 py-1.25";
const FACT_LABEL = "flex-none type-xs text-muted";
const FACT_VALUE = "m-0 ml-auto min-w-0 type-xs leading-snug text-right wrap-anywhere";
const ARTIFACT_BLOCK = "m-0 max-w-full overflow-auto rounded-cell bg-surface-sunken px-3.5 py-3.25";
const ARTIFACT_CODE = "font-mono type-xs whitespace-pre-wrap wrap-anywhere";
const MEDIA_FALLBACK = DETAIL_COPY;
const FIGURE = "m-0 flex min-w-0 flex-col gap-1.75 rounded-cell bg-frame p-2 text-on-instrument";
const FIGURE_MEDIA = "w-full max-h-90 rounded-field object-contain";
const FIGURE_CAPTION = "font-mono type-meta text-on-instrument-muted";

type TemplateItem = Extract<MarketplaceItemPresentation, { category: "templates" }>;
type RecipeItem = Extract<MarketplaceItemPresentation, { category: "recipes" }>;
type PublicItem = TemplateItem | RecipeItem;

export interface MarketplacePublicItemDetailProps {
  item: PublicItem;
  onBack(): void;
  onReviewTemplateTarget?(item: TemplateItem): void;
  onReviewRecipeTarget?(item: RecipeItem): void;
}

function available(value: Availability<string>): string {
  return value.status === "ready" ? value.value : value.reason;
}

function allowRecipeMarkdownUrl(_url: URL, kind: "link" | "image", raw: string): boolean {
  return kind === "image" && marketplacePublicMediaKind(raw) === "image";
}

function PublicMedia({ url, label, posterUrl, className }: { url: string; label: string; posterUrl?: string | null; className?: string }) {
  const kind = marketplacePublicMediaKind(url);
  const [failed, setFailed] = useState(false);
  if (!kind) return <p className={`marketplace-public-media-fallback ${MEDIA_FALLBACK}`}>{label} media is unavailable.</p>;
  if (failed) return <p className={`marketplace-public-media-fallback ${MEDIA_FALLBACK}`}>{label} {kind} is unavailable.</p>;
  if (kind === "video") return <video
    src={url}
    className={className}
    poster={posterUrl && marketplacePublicMediaKind(posterUrl) === "image" ? posterUrl : undefined}
    aria-label={label}
    controls
    controlsList="nodownload"
    preload="metadata"
    onError={() => setFailed(true)}
  />;
  return <img
    src={url}
    className={className}
    alt={`${label} for Marketplace item`}
    loading="lazy"
    referrerPolicy="no-referrer"
    onError={() => setFailed(true)}
  />;
}

function TemplatePreview({ item }: { item: TemplateItem }) {
  const url = item.template.referenceUrls.find((candidate) => marketplacePublicMediaKind(candidate) !== null);
  return url
    ? <PublicMedia key={url} className="marketplace-public-reference block w-full max-w-170 max-h-105 rounded-cell bg-frame object-contain" url={url} label="Template reference preview" />
    : <p className={DETAIL_COPY}>Template reference preview is unavailable from public-library schema 1.</p>;
}

function RecipePreview({ item }: { item: RecipeItem }) {
  const demo = item.recipe.recipe?.demo;
  if (!demo || ![demo.storageUrl, demo.beforeUrl, demo.afterUrl, demo.posterUrl].some(Boolean)) {
    return <p className={DETAIL_COPY}>Source-provided preview is unavailable from public-library schema 1.</p>;
  }
  return <div className="marketplace-public-preview-grid grid grid-cols-(--marketplace-figure-columns) gap-2">
    {demo.storageUrl && <figure className={FIGURE}><PublicMedia className={FIGURE_MEDIA} key={demo.storageUrl} url={demo.storageUrl} posterUrl={demo.posterUrl} label="Source-provided preview" /><figcaption className={FIGURE_CAPTION}>Source-provided preview</figcaption></figure>}
    {!demo.storageUrl && demo.posterUrl && <figure className={FIGURE}><PublicMedia className={FIGURE_MEDIA} key={demo.posterUrl} url={demo.posterUrl} label="Source-provided preview" /><figcaption className={FIGURE_CAPTION}>Source-provided preview</figcaption></figure>}
    {demo.beforeUrl && <figure className={FIGURE}><PublicMedia className={FIGURE_MEDIA} key={demo.beforeUrl} url={demo.beforeUrl} label={`Before preview for ${item.name}`} /><figcaption className={FIGURE_CAPTION}>Before</figcaption></figure>}
    {demo.afterUrl && <figure className={FIGURE}><PublicMedia className={FIGURE_MEDIA} key={demo.afterUrl} url={demo.afterUrl} label={`After preview for ${item.name}`} /><figcaption className={FIGURE_CAPTION}>After</figcaption></figure>}
  </div>;
}

export function MarketplacePublicItemDetail({
  item,
  onBack,
  onReviewTemplateTarget,
  onReviewRecipeTarget,
}: MarketplacePublicItemDetailProps) {
  const generation = useRef(0);
  const [copyResult, setCopyResult] = useState<{ key: string; artifact: string; kind: "success" | "error"; message: string } | null>(null);
  const recipe = item.category === "recipes" ? item.recipe.recipe : null;
  const artifact = recipe?.artifact ?? null;

  useEffect(() => {
    generation.current += 1;
    setCopyResult(null);
    return () => { generation.current += 1; };
  }, [artifact, item.key]);

  const copyArtifact = async () => {
    if (!artifact) return;
    const requestGeneration = ++generation.current;
    setCopyResult(null);
    try {
      await bridge.copyText(artifact);
      if (requestGeneration === generation.current) setCopyResult({ key: item.key, artifact, kind: "success", message: "Artifact copied" });
    } catch (cause) {
      if (requestGeneration === generation.current) {
        const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 1_024);
        setCopyResult({ key: item.key, artifact, kind: "error", message });
      }
    }
  };

  const review = item.category === "templates" ? onReviewTemplateTarget : onReviewRecipeTarget;
  const reviewUnavailableId = `marketplace-${item.category}-review-unavailable`;
  const copyUnavailableId = "marketplace-recipe-copy-unavailable";
  const status = copyResult?.key === item.key && copyResult.artifact === artifact ? copyResult : null;

  return <article className={`marketplace-public-detail marketplace-detail-route ${DETAIL_ROUTE}`} aria-labelledby="marketplace-public-title">
    <button className={`marketplace-public-back ${DETAIL_BACK}`} type="button" onClick={onBack}><ArrowLeft className={HERO_ACTION_GLYPH} aria-hidden="true" />Back to {item.category === "templates" ? "Templates" : "Recipes"}</button>
    <header className={`marketplace-public-hero ${DETAIL_HERO}`}>
      <span className={DETAIL_EYEBROW}>{item.category === "templates" ? "Templates" : "Recipes"} · {item.sourceLabel}</span>
      <h2 className={DETAIL_TITLE} id="marketplace-public-title">{item.name}</h2>
      <p className={DETAIL_LEAD}>{item.summary}</p>
      <div className={`marketplace-public-actions ${DETAIL_ACTIONS}`}>
        {item.category === "recipes" && <button className={HERO_ACTION_PRIMARY} type="button" aria-disabled={!artifact} aria-describedby={!artifact ? copyUnavailableId : undefined} onClick={artifact ? () => { void copyArtifact(); } : undefined}><Copy className={HERO_ACTION_GLYPH} aria-hidden="true" />Copy artifact</button>}
        <button
          className={item.category === "recipes" ? HERO_ACTION_SECONDARY : HERO_ACTION_PRIMARY}
          type="button"
          aria-disabled={!review}
          aria-describedby={!review ? reviewUnavailableId : undefined}
          onClick={review ? () => item.category === "templates" ? onReviewTemplateTarget?.(item) : onReviewRecipeTarget?.(item) : undefined}
        >{item.category === "templates" ? "Review project target" : "Review apply target"}</button>
      </div>
      {item.category === "recipes" && !artifact && <p id={copyUnavailableId} className={`marketplace-public-action-state ${HERO_STATE}`}>Artifact copy is unavailable because public-library schema 1 did not provide an artifact.</p>}
      {!review && <p id={reviewUnavailableId} className={`marketplace-public-action-state ${HERO_STATE}`}>Target review is unavailable until the current Desktop workflow contract is connected.</p>}
      {status && <p className={`marketplace-public-copy-state ${HERO_STATE} [&[role=alert]]:text-alert-bright`} role={status.kind === "error" ? "alert" : "status"} aria-live="polite">{status.message}</p>}
    </header>

    <div className={`marketplace-public-detail-layout ${DETAIL_LAYOUT}`}>
      <div className={`marketplace-public-detail-main ${DETAIL_COLUMN}`}>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>What it gives you</h3><p className={DETAIL_COPY}>{item.summary}</p></section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Preview or example</h3>{item.category === "templates" ? <TemplatePreview item={item} /> : <RecipePreview item={item} />}</section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Use when</h3><p className={DETAIL_COPY}>Use conditions are unavailable from public-library schema 1.</p></section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Do not use when</h3><p className={DETAIL_COPY}>Negative scope is unavailable from public-library schema 1.</p></section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Compatibility</h3><p className={DETAIL_COPY}>{available(item.compatibility)}</p></section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>What will be added</h3><p className={DETAIL_COPY}>Project changes are unavailable without a Core mutation contract.</p></section>
        <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Permissions and access</h3><p className={DETAIL_COPY}>File, shell, network, credential, and runtime requirements are unavailable from public-library schema 1.</p></section>

        {item.category === "templates" ? <section className={`marketplace-public-type-detail ${DETAIL_SECTION}`}><h3 className={DETAIL_HEADING}>Template details</h3>
          <h4 className={DETAIL_SUBHEADING}>Expected deliverable shape</h4><p className={DETAIL_COPY}>Format and expected deliverable shape are unavailable from public-library schema 1.</p>
          <h4 className={DETAIL_SUBHEADING}>Scene structure</h4><p className={DETAIL_COPY}>Scene structure is unavailable from public-library schema 1.</p>
          <h4 className={DETAIL_SUBHEADING}>Slots and variables</h4><p className={DETAIL_COPY}>Slots and variables are unavailable from public-library schema 1.</p>
          <h4 className={DETAIL_SUBHEADING}>Common model stack and assets</h4><p className={DETAIL_COPY}>Model stack and required assets are unavailable from public-library schema 1.</p>
          <h4 className={DETAIL_SUBHEADING}>Composition skeleton</h4><p className={DETAIL_COPY}>Composition skeleton is unavailable from public-library schema 1.</p>
          <h4 className={DETAIL_SUBHEADING}>Examples and common failure modes</h4><p className={DETAIL_COPY}>Examples and failure modes are unavailable from public-library schema 1.</p>
        </section> : <>
          <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>How to use it</h3>{recipe?.body ? <MarkdownView markdown={recipe.body} allowUrl={allowRecipeMarkdownUrl} /> : <p className={DETAIL_COPY}>Recipe instructions are unavailable from public-library schema 1.</p>}</section>
          <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Artifact</h3>{artifact ? <pre className={ARTIFACT_BLOCK}><code className={ARTIFACT_CODE}>{artifact}</code></pre> : <p className={DETAIL_COPY}>An extractable artifact is unavailable from public-library schema 1.</p>}</section>
          <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Named parameters</h3>{recipe?.parameters !== null && recipe?.parameters !== undefined ? <pre className={ARTIFACT_BLOCK}><code className={ARTIFACT_CODE}>{JSON.stringify(recipe.parameters, null, 2)}</code></pre> : <p className={DETAIL_COPY}>Named parameters are unavailable from public-library schema 1.</p>}</section>
          <section className={DETAIL_SECTION}><h3 className={DETAIL_HEADING}>Required tools</h3><p className={DETAIL_COPY}>Required tools are unavailable from public-library schema 1.</p></section>
        </>}
      </div>

      <aside className={`marketplace-public-detail-aside ${DETAIL_COLUMN}`}>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Version and provenance</h3><dl className="m-0 flex flex-col gap-px">
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Source</dt><dd className={FACT_VALUE}>{item.sourceLabel}</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Version</dt><dd className={FACT_VALUE}>{available(item.version)}</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Updated</dt><dd className={FACT_VALUE}>{available(item.updatedAt)}</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>License</dt><dd className={FACT_VALUE}>{available(item.license)}</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Publisher identity</dt><dd className={FACT_VALUE}>{available(item.publisherIdentity)}</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Content audit</dt><dd className={FACT_VALUE}>{available(item.contentAudit)}</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Signature or hash</dt><dd className={FACT_VALUE}>Signature and hash are unavailable from public-library schema 1.</dd></div>
          <div className={FACT_ROW}><dt className={FACT_LABEL}>Local modifications</dt><dd className={FACT_VALUE}>Local modification state is unavailable without a persistent library contract.</dd></div>
        </dl></section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Works with</h3><p className={DETAIL_COPY}>Related Marketplace items are unavailable from public-library schema 1.</p></section>
        <section className={ASIDE_SECTION}><h3 className={DETAIL_HEADING}>Used by</h3><p className={DETAIL_COPY}>Usage backlinks are unavailable from the current Desktop contract.</p></section>
      </aside>
    </div>
  </article>;
}
