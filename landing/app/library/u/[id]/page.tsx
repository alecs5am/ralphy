// landing/app/library/u/[id]/page.tsx
//
// Library v2 — Screen 2: the Unit detail page (the ingredient panel). Server
// Component. SSG over every unit id. Resolves the unit's provenance (its 1
// template + N recipes + M assets, grouped by asset sub; the look is a tag) and
// the "More from / More with" sets, then hands the resolved blocks to the client
// islands as plain JSON.
//
//   Left  — format label + title + blurb + the sticky UnitViewer (1..N media).
//   Right — the IngredientPanel (read-only provenance + the Remix CTA).
//   Below — the MoreFrom rails.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import {
  formatById,
  getBlock,
  getBlocks,
  getBlueprint,
  getFormats,
  getUnit,
  getUnits,
} from "@/lib/library-v2/source";
import type { AssetSub, Block, Format, Unit } from "@/lib/library-v2/types";
import { fhue, KIND_META, SUB_META } from "../../_shared/blockMeta";
import { UnitViewer } from "./UnitViewer";
import { IngredientPanel } from "./IngredientPanel";
import { BlueprintCta } from "./BlueprintModal";
import { MoreFrom, type Rail } from "./MoreFrom";

export const dynamicParams = false;

/** Cap per rail — a popular dimension (a common template / tag) must not produce
 *  an enormous strip. 12 keeps the carousel a few swipes wide at most. */
const RAIL_CAP = 12;

/**
 * Build the ordered, deduped recommendation rails for a unit (#094) in ONE
 * in-memory pass over the already-loaded `allUnits` / `allBlocks` snapshot — no
 * per-id source calls (would risk N+1 on the Supabase backend).
 *
 * Order (most-relevant-first): template → each tag → each recipe → each asset →
 * format. Format is the broadest match (every unit of a kind shares it) so it
 * lands last. Dedup is ACROSS rails: a `seen` set is carried through the build
 * in priority order, each rail filters out already-seen units, so a given unit
 * appears in at most ONE rail. Each rail is self-excluded (never the current
 * unit), capped at RAIL_CAP, and dropped when it has no remaining units.
 */
function buildRails(
  unit: Unit,
  allUnits: Unit[],
  allBlocks: Block[],
  format: Format | undefined,
): Rail[] {
  const blockName = (kind: Block["kind"], id: string): string =>
    allBlocks.find((b) => b.kind === kind && b.id === id)?.name ?? id;
  const blockSub = (id: string): AssetSub | undefined =>
    allBlocks.find((b) => b.kind === "asset" && b.id === id)?.sub;

  // Candidate pool = every OTHER unit (current unit never recommends itself).
  const others = allUnits.filter((u) => u.id !== unit.id);
  const seen = new Set<string>();
  const rails: Rail[] = [];

  // Emit a rail from a membership predicate, deduping against `seen` + capping.
  const push = (
    spec: Omit<Rail, "units">,
    qualifies: (u: Unit) => boolean,
  ): void => {
    const units = others
      .filter((u) => !seen.has(u.id) && qualifies(u))
      .slice(0, RAIL_CAP);
    if (units.length === 0) return;
    for (const u of units) seen.add(u.id);
    rails.push({ ...spec, units });
  };

  // 1 — template (the unit's structural skeleton). Single, highest priority.
  if (unit.templateId) {
    const name = blockName("template", unit.templateId);
    push(
      {
        key: `template:${unit.templateId}`,
        lead: "More from",
        kindLabel: KIND_META.template.label,
        glyph: KIND_META.template.glyph,
        name,
        sub: `Other units built on the ${name.toLowerCase()} structure — same skeleton, different look.`,
        href: `/library/b/template/${unit.templateId}`,
      },
      (u) => u.templateId === unit.templateId,
    );
  }

  // 2 — each tag (the look + any others). One rail per tag, in tag order.
  for (const tag of unit.tags ?? []) {
    push(
      {
        key: `tag:${tag}`,
        lead: "More with",
        kindLabel: "Tag",
        glyph: "#",
        name: tag,
        sub: `Other units sharing the ${tag} look — same register, different shape.`,
        href: `/library?tag=${encodeURIComponent(tag)}`,
      },
      (u) => (u.tags ?? []).includes(tag),
    );
  }

  // 3 — each recipe the unit uses. One rail per recipe id.
  for (const rid of unit.recipeIds) {
    const name = blockName("recipe", rid);
    push(
      {
        key: `recipe:${rid}`,
        lead: "Uses",
        kindLabel: KIND_META.recipe.label,
        glyph: KIND_META.recipe.glyph,
        name,
        sub: `Other units that apply the ${name.toLowerCase()} recipe.`,
        href: `/library/b/recipe/${rid}`,
      },
      (u) => u.recipeIds.includes(rid),
    );
  }

  // 4 — each asset the unit uses (character / location / prop / music). One rail
  // per asset id; head glyph + label follow the asset sub when known.
  for (const aid of unit.assetIds) {
    const name = blockName("asset", aid);
    const sub = blockSub(aid);
    const meta = sub ? SUB_META[sub] : undefined;
    push(
      {
        key: `asset:${aid}`,
        lead: "Uses",
        kindLabel: meta?.label ?? KIND_META.asset.label,
        glyph: meta?.glyph ?? KIND_META.asset.glyph,
        name,
        sub: `Other units that reuse the ${name.toLowerCase()} ${(meta?.label ?? "asset").toLowerCase()}.`,
        href: `/library/b/asset/${aid}`,
      },
      (u) => u.assetIds.includes(aid),
    );
  }

  // 5 — format / type (the broadest match — least specific, so last).
  push(
    {
      key: `format:${unit.format}`,
      lead: "More in",
      kindLabel: "Format",
      glyph: format?.glyph ?? "▷",
      name: format?.label ?? unit.format,
      sub: `Other ${(format?.label ?? unit.format).toLowerCase()} units across every template and look.`,
      href: `/library?format=${unit.format}`,
    },
    (u) => u.format === unit.format,
  );

  return rails;
}

export async function generateStaticParams() {
  const units = await getUnits();
  return units.map((u) => ({ id: u.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const unit = await getUnit(id);
  if (!unit) return { title: "Unit not found · Ralphy Library" };
  return {
    title: `${unit.title} · Ralphy Library`,
    description: unit.blurb,
  };
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const unit = await getUnit(id);
  if (!unit) notFound();

  const [stars, formats] = await Promise.all([getDisplayStars(), getFormats()]);
  const format = formatById(unit.format);

  // Provenance — resolve the factual blocks that made this unit. The look is a
  // tag now (not a block); the unit's tags drive the per-tag rails below.
  const template = unit.templateId
    ? await getBlock("template", unit.templateId)
    : undefined;
  const recipes = (
    await Promise.all(unit.recipeIds.map((rid) => getBlock("recipe", rid)))
  ).filter((b): b is Block => !!b);
  const assets = (
    await Promise.all(unit.assetIds.map((aid) => getBlock("asset", aid)))
  ).filter((b): b is Block => !!b);

  const bySub = (sub: AssetSub) => assets.filter((a) => a.sub === sub);
  const characters = bySub("character");
  const locations = bySub("location");
  const props = bySub("prop");
  const music = bySub("music");

  // Recommendation rails (#094) — one rail PER dimension the unit has, built in
  // ONE in-memory pass over the single `allUnits` / `allBlocks` snapshot (no
  // per-id source calls — that would risk an N+1 on the Supabase path). Order is
  // most-relevant-first: template → each tag → each recipe → each asset → format
  // (format is the broadest, least-specific match, so it lands last). A unit is
  // deduped ACROSS rails — it shows in at most ONE rail (the first / highest-
  // priority it qualifies for), via a `seen` set carried through the build. Each
  // rail is self-excluded, capped, and dropped when empty.
  const [allUnits, allBlocks] = await Promise.all([getUnits(), getBlocks()]);
  const rails = buildRails(unit, allUnits, allBlocks, format);

  // The per-unit Blueprint (#074) — full reproduction recipe. Undefined when the
  // unit has no published Blueprint yet; the CTA island then renders nothing (no
  // Blueprint button, no "Use in ralphy" button — the page is just viewer + rail).
  const blueprint = await getBlueprint(unit.id);

  const hue = format ? fhue(format.id) : "var(--mute)";

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="detail-top">
          <div className="container container-w-1760">
            <p className="breadcrumb">
              <a href="/library">Library</a>
              <span className="sep">/</span>
              <a href={`/library?format=${unit.format}`} style={{ color: hue }}>
                {format?.label ?? unit.format}
              </a>
            </p>

            <div className="udetail">
              {/* Left — the CONTENT (media) is the focus. Pinterest-style: the
                  unit's media leads; the title, blurb and CTAs move to the right
                  column so the eye lands on the content first. */}
              <div style={{ position: "relative" }}>
                <UnitViewer u={unit} format={format} />
              </div>

              {/* Right — title + blurb + reproduce CTAs + the ingredient panel */}
              <div style={{ position: "relative" }}>
                <span
                  className="ufmt"
                  style={{
                    color: hue,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: hue, display: "inline-block" }} />
                  {format?.label ?? unit.format} · {unit.mediaCount} {format?.unit ?? "item"}
                </span>
                <h1 className="detail-title" style={{ margin: "10px 0 12px" }}>
                  {unit.title}
                </h1>
                <p className="detail-sub" style={{ marginBottom: 18, maxWidth: "56ch" }}>
                  {unit.blurb}
                </p>
                {/* Reproduce CTAs (#079) — blue Blueprint button opens the full
                    recipe in a modal; "Use in ralphy" surfaces the reproduce
                    command. Both render only when this unit has a Blueprint. */}
                <BlueprintCta unitId={unit.id} title={unit.title} blueprint={blueprint} />
                <IngredientPanel
                  unit={unit}
                  format={format}
                  template={template}
                  characters={characters}
                  locations={locations}
                  props={props}
                  music={music}
                  recipes={recipes}
                />
              </div>
            </div>
          </div>
        </section>

        <MoreFrom rails={rails} formats={formats} blocks={allBlocks} />
      </main>

      <Footer />
    </>
  );
}
