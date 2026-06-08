// landing/app/library/b/[kind]/[id]/page.tsx
//
// Library v2 — Screen 3: the building-BLOCK page. One layout reused for every
// kind (Template / Recipe / Asset). Server Component, fully SSG. (The look is a
// unit Tag, not a block, so there is no /b/style/* page.)
//
//   Header (.bhead, 2-col when proof exists, single-col when it does not):
//     left  — eyebrow `{glyph} {Kind}` (+ "· Asset" for assets), H1 name, blurb,
//             CTA "Use this {kind}" (→ ComposeCta client modal) + "{n} units use it".
//     right — proof, MEDIA-OR-NOTHING (the user's "no dumb placeholders" rule):
//             Template / Asset         → the real `block.refs` media (image /
//                                        video / audio) via AssetMedia. No refs
//                                        → render NOTHING (no schematic grid).
//             Recipe                    → ALWAYS nothing here; its demo + artifact
//                                        live LOWER on the page in RecipeDetail.
//   Body: "Units that use this {kind}" → the feed filtered to this block (the
//         shared <UnitGrid>, via the BlockUnits client island).
//
// When the proof renders nothing, the `.bhead` drops to a single column
// (`.bhead.no-proof`) so the header text spans full width — no empty right gap.
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
import { siteUrl } from "@/lib/site";
import { KIND_META, RECIPE_KIND_META, SUB_META } from "../../../_shared/blockMeta";
import { AssetMedia, hasRefMedia } from "./AssetMedia";
import { BlockUnits } from "./BlockUnits";
import { ComposeCta, ComposeLink } from "./ComposeModal";
import { RecipeDetail } from "./RecipeDetail";

export const dynamicParams = false;

const KINDS: BlockKind[] = ["template", "recipe", "asset"];

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
  const url = siteUrl(`library/b/${block.kind}/${block.id}`);
  return {
    title: { absolute: `${block.name} · ${kindMeta(block).label} · Ralphy Library` },
    description: block.blurb,
    alternates: { canonical: url },
    openGraph: {
      title: `${block.name} · ${kindMeta(block).label}`,
      description: block.blurb,
      url,
      type: "article",
      // Branded site-default card (prebuilt root route, no per-block render).
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${block.name} · ${kindMeta(block).label}`,
      description: block.blurb,
      images: ["/opengraph-image"],
    },
  };
}

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

// ── Header proof slot — MEDIA-OR-NOTHING ─────────────────────────────────────
//
// The proof slot shows a REAL preview when one exists, and renders NOTHING
// otherwise (the user's "no dumb placeholders" rule). No schematic fallback.
//
//   recipe                   → always null here. Its before/after demo + the
//                              copyable artifact live in <RecipeDetail> below,
//                              so a top proof would only duplicate.
//   template / asset         → AssetMedia from `block.refs` (image / video /
//                              audio viewer) when refs exist; null when empty.
//
// `hasBlockProof` is the SSR-side predicate so the header can pre-switch to a
// single column (`.bhead.no-proof`) — keeping the two in lockstep.

function hasBlockProof(block: Block): boolean {
  if (block.kind === "recipe") return false;
  return hasRefMedia(block);
}

function BlockRefs({ block }: { block: Block }) {
  if (!hasBlockProof(block)) return null;
  return <AssetMedia block={block} />;
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
  const showProof = hasBlockProof(block);

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

            <div className={`bhead${showProof ? "" : " no-proof"}`}>
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
              {showProof && <BlockRefs block={block} />}
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
