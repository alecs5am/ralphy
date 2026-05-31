// landing/app/library/u/[id]/page.tsx
//
// Library v2 — Screen 2: the Unit detail page (the ingredient panel). Server
// Component. SSG over every unit id. Resolves the unit's provenance (its 1
// template + 1 style + N recipes + M assets, grouped by asset sub), computes the
// `applicable` swap list per slot, and the "More from / More in" sets, then hands
// the resolved blocks + applicable lists to the client islands as plain JSON.
//
//   Left  — format label + title + blurb + the sticky UnitViewer (1..N media).
//   Right — the IngredientPanel (editable slots, staged swaps, the commit bar).
//   Below — the MoreFrom rails.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import {
  applicable,
  formatById,
  getBlock,
  getBlocks,
  getFormats,
  getUnit,
  getUnits,
  unitsUsing,
} from "@/lib/library-v2/source";
import type { AssetSub, Block } from "@/lib/library-v2/types";
import { fhue } from "../../_shared/blockMeta";
import { UnitViewer } from "./UnitViewer";
import { IngredientPanel } from "./IngredientPanel";
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

  // Provenance — resolve the factual blocks that made this unit.
  const [template, style] = await Promise.all([
    unit.templateId ? getBlock("template", unit.templateId) : undefined,
    unit.styleId ? getBlock("style", unit.styleId) : undefined,
  ]);
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

  // Applicable swap lists per slot (other fitting blocks of the same kind / sub).
  const [
    applTemplate,
    applStyle,
    applRecipe,
    applCharacter,
    applLocation,
    applProp,
    applMusic,
  ] = await Promise.all([
    applicable("template", unit, unit.templateId),
    applicable("style", unit, unit.styleId),
    applicable("recipe", unit, recipes[0]?.id),
    applicable("asset", unit, characters[0]?.id, "character"),
    applicable("asset", unit, locations[0]?.id, "location"),
    applicable("asset", unit, props[0]?.id, "prop"),
    applicable("asset", unit, music[0]?.id, "music"),
  ]);

  // More-from sets — other units sharing this unit's template / style.
  const [fromTemplate, inStyle, allBlocks] = await Promise.all([
    unit.templateId ? unitsUsing("template", unit.templateId) : Promise.resolve([]),
    unit.styleId ? unitsUsing("style", unit.styleId) : Promise.resolve([]),
    getBlocks(),
  ]);
  const moreFromTemplate = fromTemplate.filter((u) => u.id !== unit.id);
  const moreInStyle = inStyle.filter((u) => u.id !== unit.id);

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
              {/* Left — title + sticky viewer */}
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
                <p className="detail-sub" style={{ marginBottom: 20, maxWidth: "56ch" }}>
                  {unit.blurb}
                </p>
                <UnitViewer u={unit} format={format} />
              </div>

              {/* Right — the ingredient panel */}
              <div style={{ position: "relative" }}>
                <IngredientPanel
                  unit={unit}
                  format={format}
                  template={template}
                  style={style}
                  characters={characters}
                  locations={locations}
                  props={props}
                  music={music}
                  recipes={recipes}
                  applicable={{
                    template: applTemplate,
                    style: applStyle,
                    recipe: applRecipe,
                    character: applCharacter,
                    location: applLocation,
                    prop: applProp,
                    music: applMusic,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <MoreFrom
          formats={formats}
          blocks={allBlocks}
          template={template}
          style={style}
          fromTemplate={moreFromTemplate}
          inStyle={moreInStyle}
        />
      </main>

      <Footer />
    </>
  );
}
