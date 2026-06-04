// landing/app/library/b/[kind]/[id]/page.tsx
//
// Library v2 — Screen 3: the building-BLOCK page. One layout reused for every
// kind (Template / Style / Recipe / Asset). Server Component, fully SSG.
//
//   Header (.bhead, 2-col):
//     left  — eyebrow `{glyph} {Kind}` (+ "· Asset" for assets), H1 name, blurb,
//             CTA "Use this {kind}" (→ ComposeCta client modal) + "{n} units use it".
//     right — proof, per kind:
//             Template      → 4 "structure beats" (schematic).
//             Style / Asset → 4-up reference-examples grid (schematic).
//             Recipe        → before / after pair (schematic).
//   Body: "Units that use this {kind}" → the feed filtered to this block (the
//         same UnitTile masonry, via the BlockUnits client island).
//
// Block reference media is intentionally absent this pass (Block.refs is empty),
// so the proof tiles render as schematic hue/glyph placeholders — never a broken
// <img>. The grid is shaped to drop in real media when block.refs lands later.
//
// This closes the loop: feed → unit → block → that block's units. The block-chip
// and More-from links from Screens 1 + 2 point here.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { getBlock, getBlocks, getFormats, unitsUsing } from "@/lib/library-v2/source";
import type { Block, BlockKind } from "@/lib/library-v2/types";
import { KIND_META, RECIPE_KIND_META, SUB_META, blockGlyph } from "../../../_shared/blockMeta";
import { AssetMedia, hasAssetMedia } from "./AssetMedia";
import { BlockUnits } from "./BlockUnits";
import { ComposeCta, ComposeLink } from "./ComposeModal";
import { RecipeDetail } from "./RecipeDetail";

export const dynamicParams = false;

const KINDS: BlockKind[] = ["template", "style", "recipe", "asset"];

export async function generateStaticParams() {
  const lists = await Promise.all(KINDS.map((kind) => getBlocks(kind)));
  return KINDS.flatMap((kind, i) => lists[i].map((b) => ({ kind, id: b.id })));
}

function isBlockKind(s: string): s is BlockKind {
  return (KINDS as string[]).includes(s);
}

/** Presentation label for the kind in the eyebrow + CTA ("Template", "Location"
 *  for an asset sub, etc.). */
function kindMeta(block: Block): { label: string; glyph: string } {
  if (block.kind === "asset" && block.sub) {
    const sub = SUB_META[block.sub];
    if (sub) return { label: sub.label, glyph: sub.glyph };
  }
  return { label: KIND_META[block.kind].label, glyph: KIND_META[block.kind].glyph };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}): Promise<Metadata> {
  const { kind, id } = await params;
  if (!isBlockKind(kind)) return { title: "Block not found · Ralphy Library" };
  const block = await getBlock(kind, id);
  if (!block) return { title: "Block not found · Ralphy Library" };
  return {
    title: `${block.name} · ${kindMeta(block).label} · Ralphy Library`,
    description: block.blurb,
  };
}

// ── Schematic proof tile ────────────────────────────────────────────────────
//
// No real reference media exists this pass, so a proof tile is a hue-tinted .ph
// shell carrying the block-accent glyph + a corner label. The block accent is
// deliberately off the format wheel (cool low-chroma --block-ink), so the proof
// reads as "a block", not "a format". When block.refs media lands, swap the
// inner content for the real <Image>/<video> while keeping this .ph wrapper.

// ── Recipe-kind badge — the colored type tag under the H1 on a recipe page, so
// the treatment class (ffmpeg / encode / overlay / bake / hyperframes / prompt)
// is obvious before reading the body. Renders nothing for a recipe with no
// recipeKind (graceful default pre-#083).

function RecipeKindBadge({ block }: { block: Block }) {
  if (block.kind !== "recipe" || !block.recipeKind) return null;
  const meta = RECIPE_KIND_META[block.recipeKind];
  const Icon = meta.icon;
  return (
    <span
      className="rk-badge"
      style={{ ["--rk" as string]: meta.hue, ["--rk-t" as string]: meta.tint, ["--rk-2" as string]: `var(--rk-${block.recipeKind}-2)` }}
    >
      <span className="rk-ic" aria-hidden>
        <Icon s={13} />
      </span>
      {meta.label}
    </span>
  );
}

function SchematicTile({ glyph, label }: { glyph: string; label: string }) {
  return (
    <div className="ph" style={{ ["--hue" as string]: "var(--block-ink)", aspectRatio: "auto" }}>
      <span className="ph-glyph">{glyph}</span>
      <span className="ph-count" style={{ left: 8, right: "auto", bottom: 8 }}>
        {label}
      </span>
    </div>
  );
}

function BlockRefs({ block }: { block: Block }) {
  const glyph = blockGlyph(block);

  // Asset with real ref media (#085) → a live player (audio / image / video) by
  // sub, replacing the schematic 4-up grid. Falls through to the schematic
  // placeholder below when the asset has no refs yet (graceful default).
  if (block.kind === "asset" && hasAssetMedia(block)) {
    return <AssetMedia block={block} />;
  }

  if (block.kind === "recipe") {
    // Before / after pair.
    return (
      <div className="bh-refs">
        <p className="rh">Before / after</p>
        <div className="ba-pair">
          <div className="bap" style={{ ["--hue" as string]: "var(--block-ink)" }}>
            <span className="tag">before</span>
            <div className="ph" style={{ ["--hue" as string]: "var(--block-ink)", aspectRatio: "auto" }}>
              <span className="ph-glyph">{glyph}</span>
            </div>
          </div>
          <div className="bap" style={{ ["--hue" as string]: "var(--block-ink)" }}>
            <span className="tag">after · {block.name}</span>
            <div className="ph" style={{ ["--hue" as string]: "var(--block-ink)", aspectRatio: "auto" }}>
              <span className="ph-glyph">{glyph}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Template → 4 structure beats; Style / Asset → 4-up reference examples.
  const isTemplate = block.kind === "template";
  const labels = isTemplate
    ? ["frame 1", "frame 2", "frame 3", "payoff"]
    : block.kind === "asset"
      ? ["hero", "3⁄4", "in-scene", "alt"]
      : ["still", "motion", "card", "type"];

  return (
    <div className="bh-refs">
      <p className="rh">{isTemplate ? "Structure beats" : "Reference examples"}</p>
      <div className="bh-refgrid">
        {labels.map((l) => (
          <div key={l} className="rf">
            <SchematicTile glyph={glyph} label={l} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function BlockPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isBlockKind(kind)) notFound();

  const block = await getBlock(kind, id);
  if (!block) notFound();

  const [stars, formats, units, allBlocks] = await Promise.all([
    getDisplayStars(),
    getFormats(),
    unitsUsing(kind, id),
    getBlocks(),
  ]);

  const meta = kindMeta(block);
  const lower = meta.label.toLowerCase();
  const n = units.length;

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="bhero">
          <div className="container container-w-1760">
            <p className="breadcrumb">
              <a href="/library">Library</a>
              <span className="sep">/</span>
              <span>{KIND_META[block.kind].plural}</span>
            </p>

            <div className="bhead">
              <div>
                <p className="bh-eye">
                  <span className="g">{meta.glyph}</span>
                  {meta.label}
                  {block.kind === "asset" ? " · Asset" : ""}
                </p>
                <h1>{block.name}</h1>
                <RecipeKindBadge block={block} />
                {block.blurb && <p className="bh-blurb">{block.blurb}</p>}
                <div className="bh-cta">
                  <ComposeCta kind={kind} block={block} kindLabel={meta.label} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--mute)" }}>
                    {n} {n === 1 ? "unit uses" : "units use"} it
                  </span>
                </div>
              </div>
              <BlockRefs block={block} />
            </div>
          </div>
        </section>

        {/* Recipe branch (#084): described body + copyable artifact + live demo.
            Renders nothing when the recipe has no enriched content yet. */}
        {block.kind === "recipe" && <RecipeDetail block={block} />}

        <section className="sec sec-results">
          <div className="container container-w-1760">
            <div className="sec-head">
              <h2>Units that use this {lower}</h2>
              <span className="count">
                {n} {n === 1 ? "unit" : "units"}
              </span>
            </div>
            <p className="sec-blurb">
              Every finished unit with{" "}
              <strong style={{ color: "var(--ink)" }}>{block.name}</strong> in its recipe. Open one to
              see the full ingredient list, or remix straight from a tile.
            </p>
            {n === 0 ? (
              <div className="empty">
                <p style={{ margin: 0 }}>
                  No units use this block yet — be the first.{" "}
                  <ComposeLink kind={kind} block={block} kindLabel={meta.label}>
                    compose one
                  </ComposeLink>
                </p>
              </div>
            ) : (
              <BlockUnits units={units} formats={formats} blocks={allBlocks} />
            )}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
