"use client";

// Shared unit tile + block chip + per-format media shapes (the <Ph> shapes,
// filled with real media). One definition used by the feed (LibraryListing) and
// by the unit-detail More-from rails — keep it the single source of tile truth.
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import Link from "next/link";
import type { Block, BlockKind, Format, Unit, UnitMedia } from "@/lib/library-v2/types";
import { RECIPE_KIND_META, blockGlyph, blockKindLabel, fhue, mediaUrl, unitTileAspect } from "./blockMeta";
import { Media } from "./Media";
import { OpenIcon, PlayIcon, RemixIcon } from "./icons";

// ── Tag chip (#082/#084 look-as-tag) ──────────────────────────────────────────
// The unit's look / register is a Tag now (not a block) — a filter link to the
// feed, visually distinct from the clickable block chips. Mirrors the
// `.tagchip` used on the unit-detail IngredientPanel.

export function TagChip({ tag, size }: { tag: string; size?: "sm" }) {
  return (
    <Link
      className={`tagchip${size === "sm" ? " sm" : ""}`}
      href={`/library?tag=${encodeURIComponent(tag)}`}
      title={`Find units tagged "${tag}"`}
    >
      <span className="tagchip-hash" aria-hidden>
        #
      </span>
      <span className="tagchip-name">{tag}</span>
    </Link>
  );
}

// ── Block chip ────────────────────────────────────────────────────────────────

export function BlockChip({
  b,
  size,
  withKind = true,
  href,
  title,
  onClick,
}: {
  b: Block;
  size?: "sm";
  withKind?: boolean;
  href?: string;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  // Recipe blocks read their treatment class via a kind-specific icon + hue tint
  // (#082); every other kind keeps the mono glyph + cool block tint.
  const rk = b.kind === "recipe" && b.recipeKind ? RECIPE_KIND_META[b.recipeKind] : undefined;
  const cls = `bchip${size === "sm" ? " sm" : ""}${rk ? " rk" : ""}`;
  const rkStyle = rk
    ? ({ ["--rk" as string]: rk.hue, ["--rk-t" as string]: rk.tint } as React.CSSProperties)
    : undefined;
  const Icon = rk?.icon;
  const inner = (
    <>
      <span className="bg" aria-hidden={!!Icon}>
        {Icon ? <Icon s={size === "sm" ? 11 : 12} /> : blockGlyph(b)}
      </span>
      {withKind && <span className="bk">{rk ? rk.label : blockKindLabel(b)}</span>}
      <span className="bn">{b.name}</span>
    </>
  );
  const titleAttr = title || `${rk ? rk.label : blockKindLabel(b)}: ${b.name}`;
  if (href) {
    return (
      <Link className={cls} href={href} title={titleAttr} onClick={onClick} style={rkStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} title={titleAttr} onClick={onClick} style={rkStyle}>
      {inner}
    </button>
  );
}

// ── Unit tile ──────────────────────────────────────────────────────────────────

export function UnitTile({
  u,
  format,
  blockBy,
  onRemix,
  compact,
}: {
  u: Unit;
  format: Format | undefined;
  blockBy: (kind: BlockKind, id: string) => Block | undefined;
  onRemix?: () => void;
  /** Rail variant — drop the ingredient ribbon + Remix action. */
  compact?: boolean;
}) {
  const tpl = blockBy("template", u.templateId);
  const tags = u.tags ?? [];
  const recN = u.recipeIds.length;
  const astN = u.assetIds.length;
  const href = `/library/u/${u.id}`;

  return (
    <div className="utile">
      <Link href={href} style={{ display: "block", color: "inherit" }}>
        <div className="um">
          <UnitMediaShape u={u} format={format} />
        </div>
      </Link>
      <div className="utile-actions">
        <Link href={href} className="ua open">
          <OpenIcon /> Open
        </Link>
        {!compact && onRemix && (
          <button
            type="button"
            className="ua remix"
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
      <div className="ubody">
        <span className="ufmt" style={{ color: format ? fhue(format.id) : undefined }}>
          <span className="dot" style={{ background: format ? fhue(format.id) : undefined }} />
          {format?.label ?? u.format}
        </span>
        <Link href={href} style={{ color: "inherit" }}>
          <h3 className="utitle">{u.title}</h3>
        </Link>
        {!compact && (
          <div className="uingredients">
            {tpl && (
              <BlockChip
                b={tpl}
                size="sm"
                withKind={false}
                href={`/library/b/template/${tpl.id}`}
                title={`Template: ${tpl.name}`}
              />
            )}
            {tags[0] && <TagChip tag={tags[0]} size="sm" />}
            {recN + astN > 0 && (
              <span className="umore">
                +{recN} recipes · {astN} assets
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-format tile media (the <Ph> shapes, filled with real media) ───────────
//
// Keeps each format's structural shape:
//   video / motion-design → single looping muted clip + play badge
//   sticker-pack          → 4×4 contact-sheet + "{n} stickers"
//   carousel              → stacked-deck peek + "{n} slides"
//   fb-creative           → set grid (cols scale w/ count) + "{n} creatives"
//   podcast-cuts          → vertical clip-stack + "{n} cuts"
//   poster / image        → single still
// When media is missing for a slot the cell falls back to a hue-tinted shape so
// the format silhouette still reads.

/** Pick a near-square grid that exactly fits `n` populated cells (cap ~9), so
 *  the card fills edge-to-edge with NO empty trailing cells. 4 → 2×2, 6 → 3×2,
 *  9 → 3×3. The real total still shows in the count badge. */
function packGrid(n: number): { cols: number; rows: number; count: number } {
  const count = Math.min(Math.max(n, 1), 9);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows, count };
}

// Tile media cell — delegates to the shared <Media> (#088). Tiles are LINKS,
// not lightbox triggers, so lightbox={false}. The per-format scaffolds
// (UnitMediaShape: contact sheet / deck / stack) keep their structure; only the
// inner cell flows through <Media>. Default fit=cover for the masonry/Pinterest
// look; contain when a caller wants the whole frame. The cell fills its
// positioned parent (the .ph / .c / .s host boxes) via .media-cell.
export function MediaCell({ m, alt, fit = "cover" }: { m: UnitMedia; alt: string; fit?: "cover" | "contain" }) {
  return (
    <Media
      src={mediaUrl(m)}
      kind={m.kind}
      alt={alt}
      displayAspect={m.aspect}
      fit={fit}
      lightbox={false}
      poster={m.poster}
      muted
      loop
      autoPlay
      className="media-cell"
    />
  );
}

export function UnitMediaShape({ u, format }: { u: Unit; format: Format | undefined }) {
  const media = u.media ?? [];
  const count = u.mediaCount;
  const hue = format ? fhue(format.id) : "var(--mute)";
  // Tile aspect = the unit's OWN media aspect (a 16/9 clip renders landscape, a
  // 1/1 square, a 9/16 portrait) — restoring the mixed-aspect Pinterest look.
  // Fall back to the format default only when the unit has no media. This same
  // helper feeds the masonry height estimate in LibraryListing.
  const tileAspect = unitTileAspect(u, format);
  const style: React.CSSProperties = {
    aspectRatio: tileAspect,
    ["--hue" as string]: hue,
  };
  const fmt = u.format;
  const single = fmt === "video" || fmt === "motion-design" || fmt === "poster" || fmt === "image";
  const isMotion = fmt === "video" || fmt === "motion-design";

  // Single-item formats — one clip or one still.
  if (single) {
    const m = media[0];
    // When real media exists, show ONLY the media — no center play badge, no
    // motion shimmer, no giant corner glyph (they overlay the preview and make
    // it look broken). The placeholder chrome is for the no-media fallback only.
    if (m) {
      return (
        <div className="ph" style={style}>
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            <MediaCell m={m} alt={u.title} />
          </div>
        </div>
      );
    }
    return (
      <div className={`ph${isMotion ? " is-motion" : ""}`} style={style}>
        <span className="ph-glyph">{format?.glyph}</span>
        <div className="ph-mid">
          <span className="ph-fmt">
            <span className="g">{format?.glyph}</span>
            {format?.label}
          </span>
          <span className="ph-sub">
            {(format?.aspect ?? "").replace(/\s/g, "")} · single {format?.unit}
          </span>
        </div>
        {isMotion && (
          <span className="ph-play">
            <PlayIcon s={18} />
          </span>
        )}
      </div>
    );
  }

  // Sticker pack → contact-sheet sized to the media actually present (no empty
  // trailing cells). The real total stays in the count badge.
  if (fmt === "sticker-pack") {
    const { cols, rows, count: n } = packGrid(media.length);
    const cells = media.slice(0, n);
    return (
      <div className="ph" style={style}>
        {cells.length === 0 && <span className="ph-glyph">{format?.glyph}</span>}
        <div className="ph-cells" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
          {cells.map((m, i) => (
            <span key={i} className="c has-media">
              <MediaCell m={m} alt={`${u.title} sticker ${i + 1}`} />
            </span>
          ))}
        </div>
        <span className="ph-count">✺ {count} stickers</span>
      </div>
    );
  }

  // Carousel → stacked-deck peek with the front slide.
  if (fmt === "carousel") {
    const front = media[0];
    return (
      <div className="ph" style={style}>
        <span className="ph-glyph">{format?.glyph}</span>
        <div className="ph-deck">
          <span className="l l2" />
          <span className="l l1" />
        </div>
        {front && (
          <div style={{ position: "absolute", inset: 14, zIndex: 2, borderRadius: 14, overflow: "hidden" }}>
            <MediaCell m={front} alt={u.title} />
          </div>
        )}
        <span className="ph-count">❯ {count} slides</span>
      </div>
    );
  }

  // FB creative → set grid sized to the media actually present (no empty cells).
  if (fmt === "fb-creative") {
    const { cols, rows, count: n } = packGrid(media.length);
    const cells = media.slice(0, n);
    return (
      <div className="ph" style={style}>
        {cells.length === 0 && <span className="ph-glyph">{format?.glyph}</span>}
        <div className="ph-cells" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
          {cells.map((m, i) => (
            <span key={i} className="c has-media">
              <MediaCell m={m} alt={`${u.title} creative ${i + 1}`} />
            </span>
          ))}
        </div>
        <span className="ph-count">❤ {count} creatives</span>
      </div>
    );
  }

  // Podcast cuts → vertical clip-stack. Only render the real items present; when
  // none exist, draw the empty schematic bars so the format silhouette reads.
  if (fmt === "podcast-cuts") {
    const cells = media.slice(0, 5);
    const rows = cells.length > 0 ? cells.length : Math.min(count, 5);
    return (
      <div className="ph" style={style}>
        {cells.length === 0 && <span className="ph-glyph">{format?.glyph}</span>}
        <div className="ph-stack">
          {cells.length > 0
            ? cells.map((m, i) => (
                <span key={i} className="s" style={{ position: "relative", overflow: "hidden" }}>
                  <MediaCell m={m} alt={`${u.title} cut ${i + 1}`} />
                </span>
              ))
            : Array.from({ length: rows }).map((_, i) => (
                <span key={i} className="s">
                  <span className="tri" />
                  <span className="bar" style={{ width: `${38 + ((i * 53) % 46)}%` }} />
                </span>
              ))}
        </div>
        <span className="ph-count">♬ {count} cuts</span>
      </div>
    );
  }

  // Unknown format — generic single shape.
  return (
    <div className="ph" style={style}>
      <span className="ph-glyph">{format?.glyph}</span>
      {media[0] && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <MediaCell m={media[0]} alt={u.title} />
        </div>
      )}
    </div>
  );
}
