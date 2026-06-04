"use client";

// IngredientPanel — the right column of the unit-detail page. READ-ONLY
// provenance: the exact blocks Ralphy composed to make this unit, each rendered
// as a chip/row that LINKS to its block page (/library/b/[kind]/[id]).
//
// No editing here (per product: the change/swap UX has no meaning yet). The
// two single-value axes (Template · Format) are grouped as one visually distinct
// "core recipe" block; the multi-value axes (Characters · Location · Props ·
// Recipes · Audio) render only when they HAVE content — empty axes are hidden.
// The look / register is shown in the Tags section (it is a tag now, not a
// block). One whole-unit "Remix this" CTA emits the copy-tag (`@unit:<id>` /
// `ralphy remix <id>`), plus the template block-link shortcut.
//
// No visible borders: separation via bg-tint steps + shadow + spacing only.

import { useState } from "react";
import Link from "next/link";
import type { Block, Format, Unit } from "@/lib/library-v2/types";
import { RECIPE_KIND_META, blockGlyph } from "../../_shared/blockMeta";
import { OpenIcon, RemixIcon } from "../../_shared/icons";
import { RemixModal } from "../../_shared/RemixModal";
import type { RemixPayload } from "../../_shared/types";

// ── Resolved provenance handed down from the server page ──────────────────────

export interface PanelProps {
  unit: Unit;
  format: Format | undefined;
  template?: Block;
  characters: Block[];
  locations: Block[];
  props: Block[];
  music: Block[];
  recipes: Block[];
}

const ASSET_GLYPH = {
  character: "☻",
  location: "⌖",
  prop: "✛",
  music: "♪",
} as const;

export function IngredientPanel(props: PanelProps) {
  const { unit, format, template, characters, locations, props: propAssets, music, recipes } = props;
  const [remix, setRemix] = useState<RemixPayload | null>(null);

  function openRemix() {
    setRemix({
      tag: `@unit:${unit.id}`,
      cli: `ralphy remix ${unit.id}`,
      title: unit.title,
      eyebrow: "Remix this unit",
      from: format ? `${format.label} · keeps everything you didn't touch` : undefined,
      thumb: format ? { glyph: format.glyph } : undefined,
      swapHint:
        "say what to swap (a character, a location, the style). Ralphy reads the unit's recipe and re-runs only what your swap touches, keeping the rest pinned.",
    });
  }

  return (
    <>
      <div className="ipanel">
        <div className="ipanel-head">
          <p className="ih-eye">Ingredients · provenance</p>
          <h2>What made this unit</h2>
          <p>The exact blocks Ralphy composed — this is the recipe. Open any one to use it on its own.</p>
        </div>

        {/* The three single-value axes — grouped as one distinct "core recipe" block */}
        <div className="ip-core">
          <p className="ip-section-label">Core recipe</p>
          {template && (
            <CoreRow
              axis="Template"
              glyph="▦"
              block={template}
              href={`/library/b/template/${template.id}`}
            />
          )}
          <CoreRow
            axis="Format"
            glyph={format?.glyph ?? "◐"}
            block={{
              kind: "template",
              id: "__format",
              name: format?.label ?? unit.format,
              blurb: `Defines the shape — ${unit.mediaCount} ${format?.unit ?? "item"}.`,
            }}
            href={`/library?format=${unit.format}`}
          />
        </div>

        {/* Multi-value axes — only the ones that have content */}
        <ChipSection label="Characters" glyph={ASSET_GLYPH.character} blocks={characters} kind="asset" />
        <ChipSection label="Location" glyph={ASSET_GLYPH.location} blocks={locations} kind="asset" />
        <ChipSection label="Props" glyph={ASSET_GLYPH.prop} blocks={propAssets} kind="asset" />
        <ChipSection label="Recipes" glyph="❉" blocks={recipes} kind="recipe" />
        <ChipSection label="Audio · music" glyph={ASSET_GLYPH.music} blocks={music} kind="asset" />

        {/* Tags (#084): textual descriptors for finding similar units. NOT blocks
            — no detail page. Rendered as plain filter chips that link to the feed
            filtered by tag, visually distinct from the clickable block chips
            above. Empty until #083 backfills unit tags. */}
        <TagSection tags={unit.tags ?? []} />

        {/* commit bar — one whole-unit Remix CTA + block-link shortcuts */}
        <div className="commit">
          <div className="commit-row">
            <button type="button" className="btn-remix btn-remix-full" onClick={openRemix}>
              <RemixIcon s={16} /> Remix this
            </button>
          </div>
          <p className="summary">
            Or start fresh from one block —{" "}
            {template && (
              <Link href={`/library/b/template/${template.id}`} style={{ color: "var(--vio-2)" }}>
                use the template
              </Link>
            )}
            .
          </p>
        </div>
      </div>

      <RemixModal payload={remix} onClose={() => setRemix(null)} />
    </>
  );
}

// ── One core single-value row (Template / Style / Format) ─────────────────────

function CoreRow({
  axis,
  glyph,
  block,
  href,
}: {
  axis: string;
  glyph: string;
  block: Block;
  href: string;
}) {
  return (
    <Link className="ip-core-row" href={href}>
      <div className="slot-axis">
        <span className="ax">
          <span className="g">{glyph}</span>
          {axis}
        </span>
      </div>
      <span className="slot-thumb glyphy">{glyph}</span>
      <div className="slot-main">
        <div className="sn">{block.name}</div>
        <div className="sm">{block.blurb}</div>
      </div>
      <span className="ip-open" aria-hidden>
        <OpenIcon s={13} />
      </span>
    </Link>
  );
}

// ── Tag chips — filter links, NOT blocks (#084) ───────────────────────────────
//
// Tags are textual descriptors for finding similar units. They get NO detail
// page; each chip links to the feed filtered by that tag (`/library?tag=<t>`).
// Styled distinctly from block chips (`.tagchip`, no glyph / open-arrow) so the
// "this opens a block page" vs "this filters the feed" affordance is unambiguous.
// Hidden entirely when the unit has no tags (the default until #083).

function TagSection({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="ip-msection">
      <p className="ip-section-label">
        <span className="ip-section-glyph">#</span>
        Tags
      </p>
      <div className="ip-chips">
        {tags.map((t) => (
          <Link
            key={t}
            className="tagchip"
            href={`/library?tag=${encodeURIComponent(t)}`}
            title={`Find units tagged "${t}"`}
          >
            <span className="tagchip-hash" aria-hidden>
              #
            </span>
            <span className="tagchip-name">{t}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── A multi-value axis section — hidden entirely when it has no content ───────

function ChipSection({
  label,
  glyph,
  blocks,
  kind,
}: {
  label: string;
  glyph: string;
  blocks: Block[];
  kind: "asset" | "recipe";
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="ip-msection">
      <p className="ip-section-label">
        <span className="ip-section-glyph">{glyph}</span>
        {label}
      </p>
      <div className="ip-chips">
        {blocks.map((b) =>
          kind === "recipe" ? (
            <RecipeChip key={b.id} block={b} />
          ) : (
            <Link key={b.id} className="bchip" href={`/library/b/${kind}/${b.id}`} title={b.blurb}>
              <span className="bg">{blockGlyph(b)}</span>
              <span className="bn">{b.name}</span>
              <span className="ip-chip-open" aria-hidden>
                <OpenIcon s={11} />
              </span>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

// ── Recipe chip — icon + hue tint per recipeKind, so the treatment class reads
// at a glance without parsing the name. Falls back to the generic recipe glyph
// + neutral tint when a recipe has no recipeKind (shouldn't happen post-#083).

function RecipeChip({ block }: { block: Block }) {
  const meta = block.recipeKind ? RECIPE_KIND_META[block.recipeKind] : undefined;
  if (!meta) {
    return (
      <Link className="bchip" href={`/library/b/recipe/${block.id}`} title={block.blurb}>
        <span className="bg">{blockGlyph(block)}</span>
        <span className="bn">{block.name}</span>
        <span className="ip-chip-open" aria-hidden>
          <OpenIcon s={11} />
        </span>
      </Link>
    );
  }
  const Icon = meta.icon;
  return (
    <Link
      className="bchip rk"
      href={`/library/b/recipe/${block.id}`}
      title={`${meta.label} — ${block.blurb}`}
      style={{ ["--rk" as string]: meta.hue, ["--rk-t" as string]: meta.tint }}
    >
      <span className="bg" aria-hidden>
        <Icon s={12} />
      </span>
      <span className="bn">{block.name}</span>
      <span className="ip-chip-open" aria-hidden>
        <OpenIcon s={11} />
      </span>
    </Link>
  );
}
