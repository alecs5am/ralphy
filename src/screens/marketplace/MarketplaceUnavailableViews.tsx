import {
  ArrowLeft,
  Blocks,
  Bot,
  FolderHeart,
  MessageSquareText,
  Send,
  UserRound,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
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
  DETAIL_TITLE,
  HERO_ACTION_GLYPH,
  HERO_ACTION_PRIMARY,
  REVIEW_ACTION_PLATE,
  REVIEW_BLOCK,
  REVIEW_REASON,
} from "./detail-chrome";

type UnsupportedCategory = "prompts" | "components" | "skills";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const categoryCopy: Record<UnsupportedCategory, {
  label: string;
  singular: string;
  icon: Icon;
  unavailable: string;
  reviewLabel: string;
  reviewReason: string;
  requirements: string[];
}> = {
  prompts: {
    label: "Prompts",
    singular: "Prompt",
    icon: MessageSquareText,
    unavailable: "Prompt catalog is unavailable without a Prompt catalog contract",
    reviewLabel: "Review use in chat",
    reviewReason: "Use in chat review is unavailable without target enumeration and attachment contracts.",
    requirements: [
      "Prompt identity, body, variables, and examples require a Prompt catalog contract.",
      "Compatible models and Guidelines require relationship and compatibility contracts.",
      "Using a Prompt requires target enumeration and attachment contracts.",
    ],
  },
  components: {
    label: "Components & Effects",
    singular: "Component",
    icon: Blocks,
    unavailable: "Component catalog is unavailable without a Component catalog contract",
    reviewLabel: "Review project target",
    reviewReason: "Component target review is unavailable without a component manifest and project mutation contract.",
    requirements: [
      "Component identity, preview, controls, and dependencies require a Component catalog contract.",
      "Aspect-ratio and accessibility evidence require a Component manifest contract.",
      "Adding a Component requires a conflict-safe project mutation contract.",
    ],
  },
  skills: {
    label: "Skills",
    singular: "Skill",
    icon: Bot,
    unavailable: "Skill catalog is unavailable without a Skill catalog contract",
    reviewLabel: "Review install",
    reviewReason: "Skill install review is unavailable without agent targets, bundle manifests, and installation contracts.",
    requirements: [
      "Skill identity, workflow, files, and examples require a Skill catalog and manifest contract.",
      "Tools, network, credentials, and trust evidence require explicit permission and provenance contracts.",
      "Installation requires agent target, scope, mode, and conflict contracts.",
    ],
  },
};

function UnavailableReview({ id, label, reason, tone, className = "", onReview }: {
  id: string;
  label: string;
  reason: string;
  /* The hero form is the one primary action on a black widget; the plate form stands on a
     light widget and states its own surface and ink. */
  tone: "hero" | "plate";
  className?: string;
  onReview?(): void;
}) {
  const block = className ? `${REVIEW_BLOCK} ${className}` : REVIEW_BLOCK;
  return <div className={block}>
    <button
      className={tone === "hero" ? HERO_ACTION_PRIMARY : REVIEW_ACTION_PLATE}
      type="button"
      aria-disabled={onReview ? undefined : true}
      aria-describedby={onReview ? undefined : id}
      onClick={onReview}
    >{label}</button>
    <p className={REVIEW_REASON} id={id}>{reason} The final action is disabled.</p>
  </div>;
}

function UnavailableSection({ title, children, tone = "main" }: { title: string; children: string; tone?: "main" | "aside" }) {
  return <section className={tone === "aside" ? ASIDE_SECTION : DETAIL_SECTION}><h3 className={DETAIL_HEADING}>{title}</h3><p className={DETAIL_COPY}>{children}</p></section>;
}

function SharedUnavailableSections({ category }: { category: UnsupportedCategory }) {
  const { singular } = categoryCopy[category];
  return <>
    <UnavailableSection title="What it gives you">{`${singular} outcome data is unavailable without a ${singular} catalog outcome contract.`}</UnavailableSection>
    <UnavailableSection title="Preview or example">{`${singular} preview and example evidence are unavailable without a ${singular} preview and example evidence contract.`}</UnavailableSection>
    <UnavailableSection title="Use when">{`${singular} applicability is unavailable without a ${singular} applicability contract.`}</UnavailableSection>
    <UnavailableSection title="Do not use when">{`${singular} negative scope is unavailable without a ${singular} negative-scope contract.`}</UnavailableSection>
    <UnavailableSection title="Compatibility">{`${singular} compatibility is unavailable without a typed compatibility contract.`}</UnavailableSection>
    <UnavailableSection title="What will be added">{`${singular} changes are unavailable without a mutation-plan contract.`}</UnavailableSection>
    <UnavailableSection title="Permissions and access">{`${singular} permission and access requirements are unavailable without a ${singular} permission and access manifest.`}</UnavailableSection>
  </>;
}

function UnavailableAside({ category }: { category: UnsupportedCategory }) {
  const { singular } = categoryCopy[category];
  return <aside className={`marketplace-public-detail-aside ${DETAIL_COLUMN}`}>
    <UnavailableSection tone="aside" title="Version and provenance">{`${singular} source, publisher identity, version, license, signature, audit, and local modification evidence are unavailable without a ${singular} provenance evidence contract.`}</UnavailableSection>
    <UnavailableSection tone="aside" title="Works with">{`${singular} relationships are unavailable without a Marketplace relationship contract.`}</UnavailableSection>
    <UnavailableSection tone="aside" title="Used by">Usage backlinks are unavailable without a Marketplace usage-backlink contract.</UnavailableSection>
  </aside>;
}

function UnavailablePromptDetail({ onReview, onBack }: Pick<MarketplaceUnavailableDetailProps, "onReview" | "onBack">) {
  return <UnavailableDetailFrame category="prompts" onReview={onReview} onBack={onBack}>
    <SharedUnavailableSections category="prompts" />
    <UnavailableSection title="Prompt body">Prompt body is unavailable without a Prompt catalog record contract.</UnavailableSection>
    <UnavailableSection title="Variables">Variable names, defaults, requirements, and validation are unavailable without a Prompt variable contract.</UnavailableSection>
    <UnavailableSection title="Filled example">A filled example is unavailable without a source-backed Prompt example contract.</UnavailableSection>
    <UnavailableSection title="Expected output shape">Expected output shape is unavailable without a Prompt output-shape contract; no output is guaranteed.</UnavailableSection>
  </UnavailableDetailFrame>;
}

function UnavailableComponentDetail({ onReview, onBack }: Pick<MarketplaceUnavailableDetailProps, "onReview" | "onBack">) {
  return <UnavailableDetailFrame category="components" onReview={onReview} onBack={onBack}>
    <SharedUnavailableSections category="components" />
    <UnavailableSection title="Live preview unavailable">Live or recorded preview is unavailable without a Component preview contract. No specimen is rendered.</UnavailableSection>
    <UnavailableSection title="Aspect ratios">Supported aspect ratios are unavailable without a Component manifest contract.</UnavailableSection>
    <UnavailableSection title="Duration behavior">Duration and timing behavior are unavailable without a Component manifest contract.</UnavailableSection>
    <UnavailableSection title="Dependencies">Runtime, package, model, font, and media dependencies are unavailable without a Component manifest contract.</UnavailableSection>
    <UnavailableSection title="Exposed controls">Control names, types, defaults, and constraints are unavailable without a Component control contract.</UnavailableSection>
    <UnavailableSection title="Accessibility notes">Accessibility behavior and limitations are unavailable without reviewed Component accessibility evidence.</UnavailableSection>
    <UnavailableSection title="Integration method">Project integration is unavailable without a Component package and mutation contract.</UnavailableSection>
  </UnavailableDetailFrame>;
}

function UnavailableSkillDetail({ onReview, onBack }: Pick<MarketplaceUnavailableDetailProps, "onReview" | "onBack">) {
  return <UnavailableDetailFrame category="skills" onReview={onReview} onBack={onBack}>
    <p className="marketplace-unavailable-safety m-0 rounded-cell bg-instrument px-3.5 py-3 text-on-instrument">Previewing a Skill never executes it.</p>
    <SharedUnavailableSections category="skills" />
    <UnavailableSection title="Example runs">Example runs, inputs, outputs, failures, time, and cost are unavailable without a source-backed run-evidence contract.</UnavailableSection>
    <UnavailableSection title="Workflow and triggers">Workflow steps and trigger conditions are unavailable without a Skill instruction contract.</UnavailableSection>
    <UnavailableSection title="Agent and model compatibility">Supported agents, models, and runtimes are unavailable without compatibility contracts.</UnavailableSection>
    <UnavailableSection title="Tools and access">Declared tools, shell, network, credential, file, and service access are unavailable without a permission manifest.</UnavailableSection>
    <UnavailableSection title="Files and manifest">The presence and contents of SKILL.md, references/, scripts/, and other bundle files are unavailable without a Skill manifest contract.</UnavailableSection>
    <UnavailableSection title="Installation scope and mode">Agent target, user or project scope, copy or symlink mode, bundle contents, and conflicts are unavailable without installation contracts.</UnavailableSection>
  </UnavailableDetailFrame>;
}

function UnavailableDetailFrame({ category, onReview, onBack, children }: MarketplaceUnavailableDetailProps & { children: ReactNode }) {
  const copy = categoryCopy[category];
  const reviewId = `marketplace-${category}-review-unavailable`;
  return <article className={`marketplace-public-detail marketplace-unavailable-detail marketplace-detail-route ${DETAIL_ROUTE}`} aria-labelledby="marketplace-unavailable-title">
    {onBack && <button className={`marketplace-public-back ${DETAIL_BACK}`} type="button" onClick={onBack}><ArrowLeft className={HERO_ACTION_GLYPH} aria-hidden="true" />Back to {copy.label}</button>}
    <header className={`marketplace-public-hero ${DETAIL_HERO}`}>
      <span className={DETAIL_EYEBROW}>{copy.label} · Unavailable capability</span>
      <h2 className={DETAIL_TITLE} id="marketplace-unavailable-title">{copy.unavailable}</h2>
      <p className={DETAIL_LEAD}>No production {copy.singular} record is rendered without a source contract.</p>
      <div className={`marketplace-public-actions ${DETAIL_ACTIONS}`}><UnavailableReview tone="hero" id={reviewId} label={copy.reviewLabel} reason={copy.reviewReason} onReview={onReview} /></div>
    </header>
    <div className={`marketplace-public-detail-layout ${DETAIL_LAYOUT}`}>
      <div className={`marketplace-public-detail-main ${DETAIL_COLUMN}`}>{children}</div>
      <UnavailableAside category={category} />
    </div>
  </article>;
}

export interface MarketplaceUnavailableDetailProps {
  category: UnsupportedCategory;
  onBack?(): void;
  onReview?(): void;
}

export function MarketplaceUnavailableDetail({ category, onBack, onReview }: MarketplaceUnavailableDetailProps) {
  if (category === "prompts") return <UnavailablePromptDetail onBack={onBack} onReview={onReview} />;
  if (category === "components") return <UnavailableComponentDetail onBack={onBack} onReview={onReview} />;
  return <UnavailableSkillDetail onBack={onBack} onReview={onReview} />;
}

export function marketplaceUnavailableDetailOriginId(category: UnsupportedCategory): string {
  return `marketplace-unavailable-detail-origin-${category}`;
}

export function MarketplaceUnavailableCategory({ category, sourceReason, onOpenDetail }: {
  category: UnsupportedCategory;
  sourceReason: string;
  onOpenDetail?(category: UnsupportedCategory): void;
}) {
  const copy = categoryCopy[category];
  const Icon = copy.icon;
  return <section className="marketplace-unavailable-category mt-6 flex min-h-65 flex-col items-center justify-center gap-2.25 rounded-widget bg-surface p-6 text-center" role="status" aria-labelledby={`marketplace-${category}-unavailable-title`}>
    <Icon className="w-5 text-muted" aria-hidden="true" />
    <h2 className="m-0 type-heading font-normal" id={`marketplace-${category}-unavailable-title`}>{copy.label} catalog unavailable</h2>
    <p className="m-0 max-w-140 type-sm leading-copy text-ink">{copy.unavailable}</p>
    <p className="m-0 max-w-140 type-sm leading-copy text-muted">{sourceReason}</p>
    <div className="marketplace-unavailable-requirements my-2 grid w-full max-w-190 grid-cols-3 gap-2 text-left @max-marketplace-split/main-region:grid-cols-1">{copy.requirements.map((requirement) => <p className="m-0 rounded-cell bg-surface-sunken p-3.25 type-xs leading-copy text-muted" key={requirement}>{requirement}</p>)}</div>
    <small className="type-xs text-muted">No sample items are shown as production catalog records.</small>
    <button
      className={REVIEW_ACTION_PLATE}
      id={marketplaceUnavailableDetailOriginId(category)}
      type="button"
      aria-disabled={onOpenDetail ? undefined : true}
      aria-describedby={onOpenDetail ? undefined : `marketplace-${category}-category-review-unavailable`}
      onClick={onOpenDetail ? () => onOpenDetail(category) : undefined}
    >Review unavailable {copy.singular} details</button>
    {!onOpenDetail && <small className="type-xs text-muted" id={`marketplace-${category}-category-review-unavailable`}>Detail review is unavailable without a Marketplace route callback.</small>}
  </section>;
}

function ContributionShell({ icon: Icon, title, body, action, reason, onReview }: {
  icon: Icon;
  title: string;
  body: string;
  action: string;
  reason: string;
  onReview?(): void;
}) {
  const id = `marketplace-${action.toLocaleLowerCase().replace(/[^a-z]+/g, "-")}-unavailable`;
  return <section className="marketplace-unavailable-contribution flex min-h-55 min-w-0 flex-col items-start gap-2.5 rounded-cell bg-surface p-4" aria-label={title}>
    <Icon className="w-4.5" aria-hidden="true" />
    <h2 className="m-0 type-heading font-normal leading-snug">{title}</h2>
    <p className="m-0 type-sm leading-copy text-muted">{body}</p>
    <UnavailableReview tone="plate" className="mt-auto" id={id} label={action} reason={reason} onReview={onReview} />
  </section>;
}

export function MarketplaceUnavailableCollection({ onReview }: { onReview?(): void }) {
  return <ContributionShell
    icon={FolderHeart}
    title="Community collection contract is unavailable"
    body="Collection identity, membership, versions, compatibility, and per-item review boundaries require a Community collection contract. No collection records or counts are inferred."
    action="Review collection"
    reason="Collection review is unavailable without source-backed membership and item action plans."
    onReview={onReview}
  />;
}

export function MarketplaceUnavailableCreator({ onReview }: { onReview?(): void }) {
  return <ContributionShell
    icon={UserRound}
    title="Creator identity and published-item contracts are unavailable"
    body="Creator identity, source links, published items, licenses, verified usage, moderation, and anti-abuse evidence require explicit contracts."
    action="Review creator"
    reason="Creator review is unavailable without identity and published-item contracts."
    onReview={onReview}
  />;
}

export function MarketplaceUnavailablePublish({ onReview }: { onReview?(): void }) {
  return <ContributionShell
    icon={Send}
    title="Publishing requires identity, validation, licensing, moderation, and versioning contracts"
    body="Desktop publishing is unavailable. No package, preview, artifact, or source is uploaded by this shell."
    action="Review publishing"
    reason="Publishing review is unavailable without registry, upload, update, deprecation, and takedown contracts."
    onReview={onReview}
  />;
}

export function MarketplaceUnavailableCollectionRoute() {
  return <div className="marketplace-unavailable-contributions grid grid-cols-3 gap-2 pt-6 pb-12 @max-marketplace-split/main-region:grid-cols-1">
    <MarketplaceUnavailableCollection />
    <MarketplaceUnavailableCreator />
    <MarketplaceUnavailablePublish />
  </div>;
}
