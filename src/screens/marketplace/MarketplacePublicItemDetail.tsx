import { ArrowLeft, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownView } from "../../components/MarkdownView";
import { bridge } from "../../lib/ipc";
import type { Availability, MarketplaceItemPresentation } from "./presentation";

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

function publicMediaKind(value: string): "image" | "video" | null {
  try {
    const url = new URL(value);
    if (url.origin !== "https://ralphy.b-cdn.net"
      || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== ""
      || (!url.pathname.startsWith("/blocks/") && !url.pathname.startsWith("/units/"))) return null;
    if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return "image";
    if (/\.(?:mp4|webm)$/i.test(url.pathname)) return "video";
  } catch {
    // Invalid source URLs stay inert.
  }
  return null;
}

function allowRecipeMarkdownUrl(url: URL, kind: "link" | "image"): boolean {
  return kind === "image" && publicMediaKind(url.toString()) === "image";
}

function PublicMedia({ url, label, posterUrl, className }: { url: string; label: string; posterUrl?: string | null; className?: string }) {
  const kind = publicMediaKind(url);
  const [failed, setFailed] = useState(false);
  if (!kind) return <p className="marketplace-public-media-fallback">{label} media is unavailable.</p>;
  if (failed) return <p className="marketplace-public-media-fallback">{label} {kind} is unavailable.</p>;
  if (kind === "video") return <video
    className={className}
    src={url}
    poster={posterUrl && publicMediaKind(posterUrl) === "image" ? posterUrl : undefined}
    controls
    controlsList="nodownload"
    preload="metadata"
    onError={() => setFailed(true)}
  />;
  return <img
    className={className}
    src={url}
    alt={`${label} for Marketplace item`}
    loading="lazy"
    referrerPolicy="no-referrer"
    onError={() => setFailed(true)}
  />;
}

function TemplatePreview({ item }: { item: TemplateItem }) {
  const url = item.template.referenceUrls[0];
  return url
    ? <PublicMedia key={url} className="marketplace-public-reference" url={url} label="Template reference preview" />
    : <p>Template reference preview is unavailable from public-library schema 1.</p>;
}

function RecipePreview({ item }: { item: RecipeItem }) {
  const demo = item.recipe.recipe?.demo;
  if (!demo || ![demo.storageUrl, demo.beforeUrl, demo.afterUrl, demo.posterUrl].some(Boolean)) {
    return <p>Source-provided preview is unavailable from public-library schema 1.</p>;
  }
  return <div className="marketplace-public-preview-grid">
    {demo.storageUrl && <figure><PublicMedia key={demo.storageUrl} url={demo.storageUrl} posterUrl={demo.posterUrl} label="Source-provided preview" /><figcaption>Source-provided preview</figcaption></figure>}
    {!demo.storageUrl && demo.posterUrl && <figure><PublicMedia key={demo.posterUrl} url={demo.posterUrl} label="Source-provided preview" /><figcaption>Source-provided preview</figcaption></figure>}
    {demo.beforeUrl && <figure><PublicMedia key={demo.beforeUrl} url={demo.beforeUrl} label={`Before preview for ${item.name}`} /><figcaption>Before</figcaption></figure>}
    {demo.afterUrl && <figure><PublicMedia key={demo.afterUrl} url={demo.afterUrl} label={`After preview for ${item.name}`} /><figcaption>After</figcaption></figure>}
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

  return <article className="marketplace-public-detail marketplace-detail-route" aria-labelledby="marketplace-public-title">
    <button className="marketplace-public-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />Back to {item.category === "templates" ? "Templates" : "Recipes"}</button>
    <header className="marketplace-public-hero">
      <span>{item.category === "templates" ? "Templates" : "Recipes"} · {item.sourceLabel}</span>
      <h2 id="marketplace-public-title">{item.name}</h2>
      <p>{item.summary}</p>
      <div className="marketplace-public-actions">
        {item.category === "recipes" && <button type="button" aria-disabled={!artifact} aria-describedby={!artifact ? copyUnavailableId : undefined} onClick={artifact ? () => { void copyArtifact(); } : undefined}><Copy aria-hidden="true" />Copy artifact</button>}
        <button
          type="button"
          aria-disabled={!review}
          aria-describedby={!review ? reviewUnavailableId : undefined}
          onClick={review ? () => item.category === "templates" ? onReviewTemplateTarget?.(item) : onReviewRecipeTarget?.(item) : undefined}
        >{item.category === "templates" ? "Review project target" : "Review apply target"}</button>
      </div>
      {item.category === "recipes" && !artifact && <p id={copyUnavailableId} className="marketplace-public-action-state">Artifact copy is unavailable because public-library schema 1 did not provide an artifact.</p>}
      {!review && <p id={reviewUnavailableId} className="marketplace-public-action-state">Target review is unavailable until the current Desktop workflow contract is connected.</p>}
      {status && <p className="marketplace-public-copy-state" role={status.kind === "error" ? "alert" : "status"} aria-live="polite">{status.message}</p>}
    </header>

    <div className="marketplace-public-detail-layout">
      <div className="marketplace-public-detail-main">
        <section><h3>What it gives you</h3><p>{item.summary}</p></section>
        <section><h3>Preview or example</h3>{item.category === "templates" ? <TemplatePreview item={item} /> : <RecipePreview item={item} />}</section>
        <section><h3>Use when</h3><p>Use conditions are unavailable from public-library schema 1.</p></section>
        <section><h3>Do not use when</h3><p>Negative scope is unavailable from public-library schema 1.</p></section>
        <section><h3>Compatibility</h3><p>{available(item.compatibility)}</p></section>
        <section><h3>What will be added</h3><p>Project changes are unavailable without a Core mutation contract.</p></section>
        <section><h3>Permissions and access</h3><p>File, shell, network, credential, and runtime requirements are unavailable from public-library schema 1.</p></section>

        {item.category === "templates" ? <section className="marketplace-public-type-detail"><h3>Template details</h3>
          <h4>Expected deliverable shape</h4><p>Format and expected deliverable shape are unavailable from public-library schema 1.</p>
          <h4>Scene structure</h4><p>Scene structure is unavailable from public-library schema 1.</p>
          <h4>Slots and variables</h4><p>Slots and variables are unavailable from public-library schema 1.</p>
          <h4>Common model stack and assets</h4><p>Model stack and required assets are unavailable from public-library schema 1.</p>
          <h4>Composition skeleton</h4><p>Composition skeleton is unavailable from public-library schema 1.</p>
          <h4>Examples and common failure modes</h4><p>Examples and failure modes are unavailable from public-library schema 1.</p>
        </section> : <>
          <section><h3>How to use it</h3>{recipe?.body ? <MarkdownView markdown={recipe.body} allowUrl={allowRecipeMarkdownUrl} /> : <p>Recipe instructions are unavailable from public-library schema 1.</p>}</section>
          <section><h3>Artifact</h3>{artifact ? <pre><code>{artifact}</code></pre> : <p>An extractable artifact is unavailable from public-library schema 1.</p>}</section>
          <section><h3>Named parameters</h3>{recipe?.parameters !== null && recipe?.parameters !== undefined ? <pre><code>{JSON.stringify(recipe.parameters, null, 2)}</code></pre> : <p>Named parameters are unavailable from public-library schema 1.</p>}</section>
          <section><h3>Required tools</h3><p>Required tools are unavailable from public-library schema 1.</p></section>
        </>}
      </div>

      <aside className="marketplace-public-detail-aside">
        <section><h3>Version and provenance</h3><dl>
          <div><dt>Source</dt><dd>{item.sourceLabel}</dd></div>
          <div><dt>Version</dt><dd>{available(item.version)}</dd></div>
          <div><dt>Updated</dt><dd>{available(item.updatedAt)}</dd></div>
          <div><dt>License</dt><dd>{available(item.license)}</dd></div>
          <div><dt>Publisher identity</dt><dd>{available(item.publisherIdentity)}</dd></div>
          <div><dt>Content audit</dt><dd>{available(item.contentAudit)}</dd></div>
          <div><dt>Signature or hash</dt><dd>Signature and hash are unavailable from public-library schema 1.</dd></div>
          <div><dt>Local modifications</dt><dd>Local modification state is unavailable without a persistent library contract.</dd></div>
        </dl></section>
        <section><h3>Works with</h3><p>Related Marketplace items are unavailable from public-library schema 1.</p></section>
        <section><h3>Used by</h3><p>Usage backlinks are unavailable from the current Desktop contract.</p></section>
      </aside>
    </div>
  </article>;
}
