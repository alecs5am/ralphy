"use client";

// IngredientPanel — the right column of the unit-detail page. READ-ONLY
// provenance: the exact blocks Ralphy composed to make this unit, each rendered
// as a chip/row that LINKS to its block page (/library/b/[kind]/[id]).
//
// No editing here (per product: the change/swap UX has no meaning yet). The
// three single-value axes (Template · Style · Format) are grouped as one visually
// distinct "recipe" block; the multi-value axes (Characters · Location · Props ·
// Recipes · Audio) render only when they HAVE content — empty axes are hidden.
// One whole-unit "Remix this" CTA emits the copy-tag (`@unit:<id>` /
// `ralphy remix <id>`), plus the two block-link shortcuts.
//
// No visible borders: separation via bg-tint steps + shadow + spacing only.

import { useState } from "react";
import Link from "next/link";
import type { Block, Format, Unit } from "@/lib/library-v2/types";
import { blockGlyph } from "../../_shared/blockMeta";
import { OpenIcon, RemixIcon } from "../../_shared/icons";
import { RemixModal } from "../../_shared/RemixModal";
import type { RemixPayload } from "../../_shared/types";

// ── Resolved provenance handed down from the server page ──────────────────────

export interface PanelProps {
  unit: Unit;
  format: Format | undefined;
  template?: Block;
  style?: Block;
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
  const { unit, format, template, style, characters, locations, props: propAssets, music, recipes } = props;
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
          {style && (
            <CoreRow
              axis="Style"
              glyph="✸"
              block={style}
              href={`/library/b/style/${style.id}`}
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
            {template && style && " · "}
            {style && (
              <Link href={`/library/b/style/${style.id}`} style={{ color: "var(--vio-2)" }}>
                use this style
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
        {blocks.map((b) => (
          <Link key={b.id} className="bchip" href={`/library/b/${kind}/${b.id}`} title={b.blurb}>
            <span className="bg">{blockGlyph(b)}</span>
            <span className="bn">{b.name}</span>
            <span className="ip-chip-open" aria-hidden>
              <OpenIcon s={11} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
