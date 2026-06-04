"use client";

// Library v2 — the media-first "Visual Feed" unit card (#100).
//
// Pinterest-style card whose RESTING state carries no text beyond a one-line
// title: the unit TYPE reads purely visually (icon-only format badge in the
// format hue + the format's aspect + the structural multi-item shape + the
// per-format colour). Only on hover / focus-within does the card reveal the
// detail panel: a format · count eyebrow, the ingredient GENOME strip, the
// Template + lead-look chips, and Open / Remix actions over a bottom scrim.
//
// Real media (not the prototype's schematic .fm gradient) is rendered via the
// shared <UnitMediaShape feed /> — the same per-format renderer the compact
// <UnitCard> uses, gated into a slimmer "feed" variant (4/5 crop for
// video/podcast-cuts, resting count badge + empty chrome suppressed).
//
// ACCESSIBILITY / VALID HTML: a nested interactive <button> inside an <a> is
// invalid, so the whole card is NOT an <a>. Instead it is an <article> with a
// stretched-link pattern — the title link (.gcap .t wrapped in <Link>) carries
// `.gcard-link` whose ::after stretches over the whole .gcard, making the card
// surface clickable while remaining a single real <a>. The hover Open button is
// a second real <Link> (sits above the stretched ::after via z-index). The
// Remix button is a real <button> that stops propagation + prevents default so
// it never triggers navigation. Keyboard: the title link is the focusable
// element; focus-within reveals the overlay so Tab reaches Open + Remix.
//
// No visible borders anywhere (the badge inset ring is an inset highlight, not
// a 1px solid border).

import Link from "next/link";
import type { Block, BlockKind, Format, Unit } from "@/lib/library-v2/types";
import { fhue, SUB_META } from "./blockMeta";
import { OpenIcon, PlayIcon, RemixIcon } from "./icons";
import { BlockChip, TagChip, UnitMediaShape } from "./UnitCard";

// Asset-sub ordering for the genome's third segment (character → location →
// prop → music), resolving a unit's assetIds to their blocks and grouping by
// `sub`. Mirrors the prototype's assetGroupsV.
const SUB_ORDER: Array<keyof typeof SUB_META> = ["character", "location", "prop", "music"];

function assetGroups(assets: Block[]): { sub: string; glyph: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.sub) counts.set(a.sub, (counts.get(a.sub) ?? 0) + 1);
  }
  return SUB_ORDER.filter((s) => counts.has(s)).map((s) => ({
    sub: s,
    glyph: SUB_META[s]!.glyph,
    count: counts.get(s)!,
  }));
}

/** The ingredient fingerprint — glyph segments encoding structure/look (seg1),
 *  recipe count (seg2), and assets-by-sub (seg3). Style is a TAG (#082/#084), so
 *  seg1 is `▦` template + `✸` lead-look-tag (only when a lead tag is present),
 *  both in the format hue; seg2/seg3 are cool block-ink. */
function Genome({
  recipeCount,
  assets,
  hasLeadTag,
}: {
  recipeCount: number;
  assets: Block[];
  hasLeadTag: boolean;
}) {
  const groups = assetGroups(assets);
  return (
    <div className="vc-genome">
      <span className="vc-gseg">
        <span className="vc-gly fmt">▦</span>
        {hasLeadTag && <span className="vc-gly fmt">✸</span>}
      </span>
      {recipeCount > 0 && (
        <span className="vc-gseg">
          <span className="vc-gly blk">❉</span>
          <span className="vc-gcount">{recipeCount}</span>
        </span>
      )}
      {groups.length > 0 && (
        <span className="vc-gseg">
          {groups.map((g) => (
            <span key={g.sub} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span className="vc-gly blk">{g.glyph}</span>
              {g.count > 1 && <span className="vc-gcount">{g.count}</span>}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function FeedCard({
  u,
  format,
  blockBy,
  onRemix,
}: {
  u: Unit;
  format: Format | undefined;
  blockBy: (kind: BlockKind, id: string) => Block | undefined;
  onRemix?: () => void;
}) {
  const tpl = blockBy("template", u.templateId);
  const tags = u.tags ?? [];
  const leadTag = tags[0];
  const recipeCount = u.recipeIds.length;
  const assets = u.assetIds
    .map((a) => blockBy("asset", a))
    .filter((b): b is Block => !!b);
  const hue = format ? fhue(format.id) : "var(--mute)";
  const href = `/library/u/${u.id}`;
  const isMotion = u.format === "video" || u.format === "motion-design";

  return (
    <article className="gcard" style={{ ["--hue" as string]: hue }}>
      <div className="gmedia">
        <UnitMediaShape u={u} format={format} feed />
        <span className="gbadge" title={format?.label} aria-hidden>
          {format?.glyph}
        </span>
        {isMotion && (
          <span className="gplay" aria-hidden>
            <PlayIcon s={18} />
          </span>
        )}
        <div className="gover">
          <div className="gover-actions">
            <Link href={href} className="va open" aria-label={`Open ${u.title}`}>
              <OpenIcon /> Open
            </Link>
            {onRemix && (
              <button
                type="button"
                className="va remix"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemix();
                }}
              >
                <RemixIcon /> Remix
              </button>
            )}
          </div>
          <div className="gover-info">
            <span className="gover-eye">
              <span className="dot" />
              {format?.label ?? u.format}{" "}
              <span className="ct">
                · {u.mediaCount} {format?.unit}
              </span>
            </span>
            <Genome recipeCount={recipeCount} assets={assets} hasLeadTag={!!leadTag} />
            <div className="gnames">
              {tpl && (
                <BlockChip
                  b={tpl}
                  size="sm"
                  withKind={false}
                  href={`/library/b/template/${tpl.id}`}
                  title={`Template: ${tpl.name}`}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {leadTag && <TagChip tag={leadTag} size="sm" />}
            </div>
          </div>
        </div>
      </div>
      <div className="gcap">
        <span className="cdot" aria-hidden />
        <Link href={href} className="gcard-link t">
          {u.title}
        </Link>
      </div>
    </article>
  );
}
