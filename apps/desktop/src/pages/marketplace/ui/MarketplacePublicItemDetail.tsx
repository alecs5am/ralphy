import { ArrowLeft, Copy, MessageCircle } from "@/shared/ui/icons";
import { useEffect, useRef, useState } from "react";
import { MarkdownView } from "@/shared/ui/MarkdownView";
import { bridge } from "@/shared/api/ipc";
import { marketplacePublicMediaKind, type MarketplaceItemPresentation, type MarketplacePublicItemPresentation } from "../lib/presentation";
import { EXPLORE_ACTION, EXPLORE_CODE, EXPLORE_COPY, EXPLORE_DETAIL, EXPLORE_HEADER, EXPLORE_ICON, EXPLORE_INFO, EXPLORE_PRIMARY, EXPLORE_SUMMARY } from "../lib/explore-detail-chrome";
import { MarketplaceDetailPreview } from "./MarketplaceDetailPreview";
import { MarketplaceDetailFacts, MarketplaceDetailTags } from "./MarketplaceDetailInfo";
import { categoryLabels } from "./browse-discover";
import { effectStudio, type EffectSettings } from "../lib/effect-settings";
import { fillPrompt } from "../lib/prompt-variables";
import { MarketplacePromptEditor } from "./MarketplacePromptEditor";
import { MarketplaceTemplatePlan } from "./MarketplaceTemplatePlan";
import { MarketplaceEffectControls } from "./MarketplaceEffectPreview";
import { MarketplaceVisualControls } from "./MarketplaceVisualPreview";
import { visualArtifact, visualFormat, type VisualSettings } from "../lib/studio-visual-scenes";
import { remocnVisualArtifact, remocnVisualFormat } from "../lib/studio-remocn-preview";
import { bundledMediaReference, marketplaceStudioReference } from "../lib/agent-request";
import { MarketplaceDetailCollection } from "./MarketplaceDetailCollection";
import { marketplacePreview } from "./MarketplaceItemPreview";

type TemplateItem = Extract<MarketplacePublicItemPresentation, { category: "templates" }>;
type RecipeItem = Extract<MarketplacePublicItemPresentation, { category: "recipes" }>;

export interface MarketplacePublicItemDetailProps {
  item: MarketplacePublicItemPresentation;
  onBack(): void;
  onReviewTemplateTarget?(item: TemplateItem): void;
  onReviewRecipeTarget?(item: RecipeItem): void;
  onUse?(item: MarketplaceItemPresentation): void;
  onTag?(tag: string): void;
  items?: MarketplaceItemPresentation[];
  onOpenItem?(key: string): void;
}

function allowRecipeMarkdownUrl(_url: URL, kind: "link" | "image", raw: string): boolean {
  return kind === "image" && marketplacePublicMediaKind(raw) === "image";
}

export function MarketplacePublicItemDetail({ item, onBack, onReviewTemplateTarget, onReviewRecipeTarget, onUse, onTag, items = [], onOpenItem }: MarketplacePublicItemDetailProps) {
  const generation = useRef(0);
  const [copyResult, setCopyResult] = useState<{ key: string; artifact: string; kind: "success" | "error"; message: string } | null>(null);
  const [settings, setSettings] = useState<EffectSettings | undefined>(() => effectStudio(item.studio?.effectId)?.defaultSettings);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(item.studio?.settings ?? { speed: 1 });
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [promptSource, setPromptSource] = useState<string | null>(null);
  const defaultFraming = item.category === "templates" || item.category === "prompts" ? "fit" : "fill";
  const isVisual = Boolean(item.studio?.visualId || item.studio?.remocnVisual);
  const [previewFit, setPreviewFit] = useState(defaultFraming);
  useEffect(() => {
    setSettings(effectStudio(item.studio?.effectId)?.defaultSettings);
    setVisualSettings(item.studio?.settings ?? { speed: 1 });
    setPromptValues({});
    setPromptSource(null);
    setPreviewFit(defaultFraming);
  }, [item.key, item.studio?.effectId, item.studio?.settings?.speed, defaultFraming]);
  const recipe = "recipe" in item ? item.recipe.recipe : null;
  const body = item.studio?.body ?? recipe?.body;
  const isPrompt = item.category === "prompts" && Boolean(item.studio && body);
  const isEffect = Boolean(item.studio?.effectId);
  const hasFraming = !isVisual && ["image", "video"].includes(marketplacePreview(item)?.kind ?? "");
  const sidebarCollection = item.category === "recipes" || item.category === "sounds";
  const prompt = isPrompt ? fillPrompt(promptSource ?? body!, promptValues) : "";
  const artifact = isPrompt ? prompt : item.studio?.visualId
    ? visualArtifact(item.studio.visualId, visualSettings, (url) => bundledMediaReference({ url, kind: "image" }).url)
    : item.studio?.remocnVisual ? remocnVisualArtifact(item.studio.remocnVisual, visualSettings, item.studio.artifact)
    : isEffect ? JSON.stringify({ effectId: item.studio!.effectId, settings: { ...item.studio!.settings, ...settings }, instructions: body, exampleCommand: item.studio!.artifact }, null, 2)
    : item.studio?.modules?.length ? JSON.stringify(marketplaceStudioReference(item), null, 2)
    : item.studio?.artifact ?? (item.studio ? body : item.category === "templates"
    ? [`Ralphy template: ${item.name}`, `ID: ${item.template.id}`, item.summary, ...item.template.referenceUrls].join("\n")
    : item.category === "sounds"
      ? [`Ralphy sound: ${item.name}`, `ID: ${item.sound.id}`, item.summary, ...item.sound.referenceUrls].join("\n")
      : recipe?.artifact ?? null);
  const category = categoryLabels[item.category];
  const previewFormat = item.studio?.visualId ? { wide: "16:9", square: "1:1", portrait: "9:16" }[visualFormat(item.studio.visualId, visualSettings)]
    : item.studio?.remocnVisual ? { wide: "16:9", square: "1:1", portrait: "9:16" }[remocnVisualFormat(item.studio.remocnVisual, visualSettings)] : item.studio?.format;
  const copyLabel = isPrompt ? "Copy prompt" : isEffect ? "Copy effect settings" : item.category === "templates" ? "Copy template reference" : item.category === "sounds" ? "Copy sound reference" : "Copy artifact";
  const configuredItem = item.studio ? { ...item, studio: { ...item.studio,
    ...(isPrompt ? { body: prompt, artifact: prompt } : {}),
    settings: { ...item.studio.settings, ...(isVisual ? visualSettings : settings) },
  } } : item;

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
      if (requestGeneration === generation.current) setCopyResult({ key: item.key, artifact, kind: "success", message: isPrompt ? "Prompt copied" : isEffect ? "Effect settings copied" : item.category === "templates" ? "Template reference copied" : item.category === "sounds" ? "Sound reference copied" : "Artifact copied" });
    } catch (cause) {
      if (requestGeneration === generation.current) setCopyResult({ key: item.key, artifact, kind: "error", message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 1_024) });
    }
  };

  const status = copyResult?.key === item.key && copyResult.artifact === artifact ? copyResult : null;
  return <article className={`marketplace-public-detail marketplace-detail-route ${EXPLORE_DETAIL}`} data-category={item.category} aria-labelledby="marketplace-public-title">
    <header className={`marketplace-public-hero ${EXPLORE_HEADER}`}>
      <button className={EXPLORE_ACTION} type="button" aria-label={`Back to ${category}`} title={`Back to ${category}`} onClick={onBack}><ArrowLeft className={EXPLORE_ICON} aria-hidden="true" /></button>
      <h2 className="m-0 min-w-0 flex-1 type-base font-medium wrap-anywhere" id="marketplace-public-title">{item.name}</h2>
      <div className="explore-detail-actions">
        {onUse && <button className={EXPLORE_PRIMARY} type="button" onClick={() => onUse(configuredItem)}><MessageCircle className={EXPLORE_ICON} aria-hidden="true" />Use in chat</button>}
        <button className={EXPLORE_ACTION} type="button" aria-disabled={!artifact} aria-describedby={!artifact ? "marketplace-recipe-copy-unavailable" : undefined} onClick={artifact ? () => { void copyArtifact(); } : undefined}><Copy className={EXPLORE_ICON} aria-hidden="true" />{copyLabel}</button>
      </div>
    </header>
    {!artifact && <p id="marketplace-recipe-copy-unavailable" className={EXPLORE_COPY}>No copyable instructions supplied.</p>}
    {status && <p className={`${EXPLORE_COPY} [&[role=alert]]:text-alert-bright`} role={status.kind === "error" ? "alert" : "status"} aria-live="polite">{status.message}</p>}
    <div className="marketplace-studio-detail-layout">
    <div className="explore-detail-workspace">
    <div className="explore-detail-stage" data-visual={isVisual} data-framing={previewFit}>
      <div className="explore-stage-toolbar"><span>{isPrompt || item.category === "templates" ? "Sample output" : isVisual || item.studio?.effectId ? "Live preview" : "Preview"}</span><span>{[previewFormat, item.studio?.duration].filter(Boolean).join(" · ")}</span>
        {hasFraming && <div className="explore-preview-framing" aria-label="Preview framing">{["fill", "fit"].map((fit) => <button key={fit} type="button" aria-pressed={previewFit === fit} title={fit === "fit" ? "Show the complete frame" : "Fill the preview area"} onClick={() => setPreviewFit(fit)}>{fit === "fit" ? "Fit" : "Fill"}</button>)}</div>}
      </div>
      <MarketplaceDetailPreview key={item.key} item={item} settings={settings} visualSettings={visualSettings} onSettingsChange={setSettings} showControls={false} />
      {isPrompt && <p className="explore-stage-note">An example of this direction. Customize the prompt to make your own.</p>}
      {item.category === "templates" && <p className="explore-stage-note">Use this direction with your own images, footage and story.</p>}
    </div>
    {item.studio?.effectId && <section className="explore-detail-customize" aria-label="Customize effect"><h3>Customize</h3><MarketplaceEffectControls effectId={item.studio.effectId} name={item.name} settings={settings} onSettingsChange={setSettings} /></section>}
    </div>
    <aside className="explore-detail-inspector" aria-label={`${category} settings and instructions`}>
    {isVisual && <MarketplaceVisualControls item={item} settings={visualSettings} onSettingsChange={setVisualSettings} />}
    <p className={EXPLORE_COPY}>{item.summary}</p>
    {item.category === "templates" && <MarketplaceTemplatePlan key={item.key} item={item} items={items} onOpenItem={onOpenItem} />}
    {isPrompt && <MarketplacePromptEditor item={item} source={promptSource ?? body!} prompt={prompt} values={promptValues} onChange={setPromptValues} onSelectDirection={(source, values) => { setPromptSource(source); setPromptValues(values); }} />}
    <MarketplaceDetailTags tags={item.tags ?? []} onTag={onTag} />
    <details className={EXPLORE_INFO}>
      <summary className={EXPLORE_SUMMARY}>Details &amp; instructions</summary>
      <div className="mt-3 flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!item.studio && item.category === "templates" && onReviewTemplateTarget && <button className={EXPLORE_ACTION} type="button" onClick={() => onReviewTemplateTarget(item)}>Review project target</button>}
          {!item.studio && item.category === "recipes" && onReviewRecipeTarget && <button className={EXPLORE_ACTION} type="button" onClick={() => onReviewRecipeTarget(item)}>Review apply target</button>}
        </div>
        {body && !isPrompt && <section className="min-w-0"><h3 className="m-0 mb-2 type-sm font-medium">How to use it</h3><MarkdownView markdown={body} allowUrl={allowRecipeMarkdownUrl} /></section>}
        {recipe?.artifact && !isPrompt && <section className="min-w-0"><h3 className="m-0 mb-2 type-sm font-medium">Artifact</h3><pre className={EXPLORE_CODE}><code>{recipe.artifact}</code></pre></section>}
        {recipe?.parameters !== null && recipe?.parameters !== undefined && <section className="min-w-0"><h3 className="m-0 mb-2 type-sm font-medium">Named parameters</h3><pre className={EXPLORE_CODE}><code>{JSON.stringify(recipe.parameters, null, 2)}</code></pre></section>}
        <MarketplaceDetailFacts item={item} />
      </div>
    </details>
    {sidebarCollection && onOpenItem && <MarketplaceDetailCollection key={item.key} item={item} items={items} onOpenItem={onOpenItem} onUse={onUse} collection="complements" />}
    </aside>
    </div>
    {onOpenItem && <MarketplaceDetailCollection key={item.key} item={item} items={items} onOpenItem={onOpenItem} onUse={onUse} collection={sidebarCollection ? "similar" : "all"} />}
  </article>;
}
