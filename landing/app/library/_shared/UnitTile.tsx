"use client";

// Shared unit tile + block chip + per-format media shapes (the <Ph> shapes,
// filled with real media). One definition used by the feed (LibraryListing) and
// by the unit-detail More-from rails — keep it the single source of tile truth.
//
// No visible borders: separation via bg-tint + shadow + spacing only.

import Image from "next/image";
import Link from "next/link";
import type { Block, BlockKind, Format, Unit, UnitMedia } from "@/lib/library-v2/types";
import { blockGlyph, blockKindLabel, fhue, mediaUrl } from "./blockMeta";
import { OpenIcon, PlayIcon, RemixIcon } from "./icons";

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
  const cls = `bchip${size === "sm" ? " sm" : ""}`;
  const inner = (
    <>
      <span className="bg">{blockGlyph(b)}</span>
      {withKind && <span className="bk">{blockKindLabel(b)}</span>}
      <span className="bn">{b.name}</span>
    </>
  );
  const titleAttr = title || `${blockKindLabel(b)}: ${b.name}`;
  if (href) {
    return (
      <Link className={cls} href={href} title={titleAttr} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} title={titleAttr} onClick={onClick}>
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
  const sty = blockBy("style", u.styleId);
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
            {sty && (
              <BlockChip
                b={sty}
                size="sm"
                withKind={false}
                href={`/library/b/style/${sty.id}`}
                title={`Style: ${sty.name}`}
              />
            )}
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

function aspectOf(format: Format | undefined, fallback: string): string {
  return format?.aspect ?? fallback;
}

export function MediaCell({ m, alt }: { m: UnitMedia; alt: string }) {
  const url = mediaUrl(m);
  if (m.kind === "video") {
    return (
      <video
        src={`${url}#t=0.1`}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        disablePictureInPicture
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    );
  }
  return (
    <Image src={url} alt={alt} fill sizes="(max-width: 820px) 50vw, 20vw" style={{ objectFit: "cover" }} unoptimized />
  );
}

export function UnitMediaShape({ u, format }: { u: Unit; format: Format | undefined }) {
  const media = u.media ?? [];
  const count = u.mediaCount;
  const hue = format ? fhue(format.id) : "var(--mute)";
  const style: React.CSSProperties = {
    aspectRatio: aspectOf(format, "4 / 5"),
    ["--hue" as string]: hue,
  };
  const fmt = u.format;
  const single = fmt === "video" || fmt === "motion-design" || fmt === "poster" || fmt === "image";
  const isMotion = fmt === "video" || fmt === "motion-design";

  // Single-item formats — one clip or one still.
  if (single) {
    const m = media[0];
    return (
      <div className={`ph${isMotion ? " is-motion" : ""}`} style={style}>
        <span className="ph-glyph">{format?.glyph}</span>
        {m ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            <MediaCell m={m} alt={u.title} />
          </div>
        ) : (
          <div className="ph-mid">
            <span className="ph-fmt">
              <span className="g">{format?.glyph}</span>
              {format?.label}
            </span>
            <span className="ph-sub">
              {(format?.aspect ?? "").replace(/\s/g, "")} · single {format?.unit}
            </span>
          </div>
        )}
        {isMotion && (
          <span className="ph-play">
            <PlayIcon s={18} />
          </span>
        )}
      </div>
    );
  }

  // Sticker pack → 4×4 contact-sheet.
  if (fmt === "sticker-pack") {
    const cells = media.slice(0, 16);
    return (
      <div className="ph" style={style}>
        <span className="ph-glyph">{format?.glyph}</span>
        <div className="ph-cells" style={{ gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)" }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="c" style={{ position: "relative", overflow: "hidden" }}>
              {cells[i] && <MediaCell m={cells[i]} alt={`${u.title} sticker ${i + 1}`} />}
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

  // FB creative → set grid (cols scale with count).
  if (fmt === "fb-creative") {
    const cols = count > 9 ? 4 : count > 4 ? 3 : 2;
    const rows = Math.ceil(Math.min(count, 12) / cols);
    const n = Math.min(count, cols * rows);
    const cells = media.slice(0, n);
    return (
      <div className="ph" style={style}>
        <span className="ph-glyph">{format?.glyph}</span>
        <div className="ph-cells" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
          {Array.from({ length: n }).map((_, i) => (
            <span key={i} className="c" style={{ position: "relative", overflow: "hidden" }}>
              {cells[i] && <MediaCell m={cells[i]} alt={`${u.title} creative ${i + 1}`} />}
            </span>
          ))}
        </div>
        <span className="ph-count">❤ {count} creatives</span>
      </div>
    );
  }

  // Podcast cuts → vertical clip-stack.
  if (fmt === "podcast-cuts") {
    const rows = Math.min(count, 5);
    const cells = media.slice(0, rows);
    return (
      <div className="ph" style={style}>
        <span className="ph-glyph">{format?.glyph}</span>
        <div className="ph-stack">
          {Array.from({ length: rows }).map((_, i) => (
            <span key={i} className="s" style={{ position: "relative", overflow: "hidden" }}>
              {cells[i] ? (
                <MediaCell m={cells[i]} alt={`${u.title} cut ${i + 1}`} />
              ) : (
                <>
                  <span className="tri" />
                  <span className="bar" style={{ width: `${38 + ((i * 53) % 46)}%` }} />
                </>
              )}
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
