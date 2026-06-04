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
  unitsUsing,
} from "@/lib/library-v2/source";
import type { AssetSub, Block } from "@/lib/library-v2/types";
import { fhue } from "../../_shared/blockMeta";
import { UnitViewer } from "./UnitViewer";
import { IngredientPanel } from "./IngredientPanel";
import { BlueprintCta } from "./BlueprintModal";
import { MoreFrom } from "./MoreFrom";

export const dynamicParams = false;

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
  // tag now (not a block); the lead tag drives the "More with this look" rail.
  const template = unit.templateId
    ? await getBlock("template", unit.templateId)
    : undefined;
  const lookTag = unit.tags?.[0];
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

  // More-from sets — other units sharing this unit's template, plus other units
  // sharing its lead look tag ("More with").
  const [fromTemplate, allUnits, allBlocks] = await Promise.all([
    unit.templateId ? unitsUsing("template", unit.templateId) : Promise.resolve([]),
    getUnits(),
    getBlocks(),
  ]);
  const moreFromTemplate = fromTemplate.filter((u) => u.id !== unit.id);
  const moreWithLook = lookTag
    ? allUnits.filter((u) => u.id !== unit.id && (u.tags ?? []).includes(lookTag))
    : [];

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

        <MoreFrom
          formats={formats}
          blocks={allBlocks}
          template={template}
          lookTag={lookTag}
          fromTemplate={moreFromTemplate}
          withLook={moreWithLook}
        />
      </main>

      <Footer />
    </>
  );
}
