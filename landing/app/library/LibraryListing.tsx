"use client";

// Library v2 — the Units feed (client island).
//
// A Pinterest-style masonry of every finished UNIT, with:
//   - a sticky search pill that matches units (title/blurb/format) AND every
//     block (name/blurb); when the query hits blocks, a "Matching blocks" row
//     of BlockChips links to each block's page;
//   - the kept browse-by-format card row (.browse-grid.nine: All + 8 formats),
//     each card showing its per-format unit count — the primary pivot (?format=);
//   - the PIVOT rail: the active block filters as removable .fpill pills + an
//     `+ Add filter` popover (kind tabs → block list w/ unit counts) + clear all;
//   - per-format unit tiles whose media keeps the format SHAPE (single clip/still,
//     contact-sheet, deck, set-grid, clip-stack) rendered with real media via
//     MediaPlayer / next-image — the <Ph> placeholder shapes, filled in;
//   - hover Open + Remix actions; Remix opens the shared RemixModal;
//   - windowed infinite scroll via an IntersectionObserver sentinel.
//
// URL query params are the SINGLE SOURCE OF TRUTH for the view state
// (?format=&style=&template=&recipe=&asset=&q=) — every control writes back via
// router.replace, so back/forward + pasted URLs reproduce the exact view.
// Multi-value block filters are comma-joined; all active filters AND together.
//
// No visible borders anywhere — separation via bg-tint + shadow + inset rings.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MediaPlayer } from "@/components/MediaPlayer";
import type {
  Block,
  BlockKind,
  Format,
  FormatId,
  Unit,
  UnitMedia,
} from "@/lib/library-v2/types";
import { RemixModal } from "./_shared/RemixModal";
import type { RemixPayload } from "./_shared/types";
import {
  CloseIcon,
  OpenIcon,
  PlayIcon,
  PlusIcon,
  RemixIcon,
  SearchIcon,
} from "./_shared/icons";

const PAGE_SIZE = 24;

/** The plain-JSON view-model the server page hands down. */
export interface FeedViewModel {
  formats: Format[];
  units: Unit[];
  blocksByKind: Record<BlockKind, Block[]>;
  blockCounts: Record<BlockKind, Record<string, number>>;
  fmtCounts: Record<FormatId, number>;
}

// ── Block-kind + asset-sub presentation (the prototype's RX.KIND / RX.SUB) ────
// Not part of the data adapter — pure presentation taxonomy from the design
// handoff. Block-kind glyphs are deliberately off the format wheel.

const KIND_META: Record<
  BlockKind,
  { label: string; plural: string; glyph: string }
> = {
  template: { label: "Template", plural: "Templates", glyph: "▦" },
  style: { label: "Style", plural: "Styles", glyph: "✸" },
  recipe: { label: "Recipe", plural: "Recipes", glyph: "❉" },
  asset: { label: "Asset", plural: "Assets", glyph: "◆" },
};

const SUB_META: Record<string, { label: string; glyph: string }> = {
  character: { label: "Character", glyph: "☻" },
  location: { label: "Location", glyph: "⌖" },
  prop: { label: "Prop", glyph: "✛" },
  music: { label: "Music", glyph: "♪" },
};

/** Pivot-rail preposition per kind ("in a Style", "from a Template", …). */
const PREPO: Record<BlockKind, string> = {
  style: "in",
  template: "from",
  recipe: "uses",
  asset: "with",
};

const FILTER_KINDS: BlockKind[] = ["style", "template", "recipe", "asset"];

function fhue(fmt: FormatId): string {
  return `var(--f-${fmt})`;
}
function blockGlyph(b: Block): string {
  return b.kind === "asset" && b.sub
    ? (SUB_META[b.sub]?.glyph ?? KIND_META.asset.glyph)
    : KIND_META[b.kind].glyph;
}
function blockKindLabel(b: Block): string {
  return b.kind === "asset" && b.sub
    ? (SUB_META[b.sub]?.label ?? KIND_META.asset.label)
    : KIND_META[b.kind].label;
}
/** First servable URL for a media item — storageUrl wins over src. */
function mediaUrl(m: UnitMedia): string {
  const withStorage = m as UnitMedia & { storageUrl?: string };
  return withStorage.storageUrl ?? m.src;
}

// ── View state from the URL ──────────────────────────────────────────────────

interface ViewState {
  format: FormatId | null;
  q: string;
  style: string[];
  template: string[];
  recipe: string[];
  asset: string[];
}

function parseList(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export function LibraryListing({ vm }: { vm: FeedViewModel }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [remix, setRemix] = useState<RemixPayload | null>(null);

  const formatById = useMemo(
    () => Object.fromEntries(vm.formats.map((f) => [f.id, f])) as Record<FormatId, Format>,
    [vm.formats],
  );
  const blockBy = useCallback(
    (kind: BlockKind, id: string): Block | undefined =>
      vm.blocksByKind[kind]?.find((b) => b.id === id),
    [vm.blocksByKind],
  );

  const view: ViewState = useMemo(
    () => ({
      format: (() => {
        const f = searchParams.get("format");
        return f && vm.formats.some((x) => x.id === f) ? (f as FormatId) : null;
      })(),
      q: searchParams.get("q") || "",
      style: parseList(searchParams.get("style")),
      template: parseList(searchParams.get("template")),
      recipe: parseList(searchParams.get("recipe")),
      asset: parseList(searchParams.get("asset")),
    }),
    [searchParams, vm.formats],
  );

  const [queryDraft, setQueryDraft] = useState(view.q);
  useEffect(() => setQueryDraft(view.q), [view.q]);

  const setParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `/library?${qs}` : "/library", { scroll: false });
    },
    [router, searchParams],
  );

  // Debounced search → ?q=
  useEffect(() => {
    if (queryDraft === view.q) return;
    const id = window.setTimeout(() => setParams({ q: queryDraft || undefined }), 220);
    return () => window.clearTimeout(id);
  }, [queryDraft, view.q, setParams]);

  const setFormat = useCallback(
    (id: FormatId | null) => setParams({ format: id ?? undefined }),
    [setParams],
  );
  const addBlock = useCallback(
    (kind: BlockKind, id: string) => {
      const list = view[kind];
      if (list.includes(id)) return;
      setParams({ [kind]: [...list, id].join(",") });
    },
    [view, setParams],
  );
  const removeBlock = useCallback(
    (kind: BlockKind, id: string) => {
      const next = view[kind].filter((x) => x !== id);
      setParams({ [kind]: next.length ? next.join(",") : undefined });
    },
    [view, setParams],
  );
  const clearAll = useCallback(() => {
    router.replace("/library", { scroll: false });
  }, [router]);

  const q = view.q.trim().toLowerCase();

  // Search surfaces matching blocks (units AND every block type).
  const blockMatches = useMemo(() => {
    if (!q) return [];
    const out: { kind: BlockKind; b: Block }[] = [];
    for (const kind of FILTER_KINDS) {
      for (const b of vm.blocksByKind[kind]) {
        if (`${b.name} ${b.blurb ?? ""}`.toLowerCase().includes(q)) {
          out.push({ kind, b });
        }
      }
    }
    return out.slice(0, 6);
  }, [q, vm.blocksByKind]);

  const filtered = useMemo(() => {
    return vm.units.filter((u) => {
      if (view.format && u.format !== view.format) return false;
      for (const id of view.style) if (u.styleId !== id) return false;
      for (const id of view.template) if (u.templateId !== id) return false;
      for (const id of view.recipe) if (!u.recipeIds.includes(id)) return false;
      for (const id of view.asset) if (!u.assetIds.includes(id)) return false;
      if (q) {
        const tpl = blockBy("template", u.templateId);
        const sty = blockBy("style", u.styleId);
        const recN = u.recipeIds.map((r) => blockBy("recipe", r)?.name ?? "").join(" ");
        const astN = u.assetIds.map((a) => blockBy("asset", a)?.name ?? "").join(" ");
        const hay = `${u.title} ${u.blurb} ${u.format} ${tpl?.name ?? ""} ${sty?.name ?? ""} ${recN} ${astN}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vm.units, view, q, blockBy]);

  // ── windowing ──────────────────────────────────────────────────────────────
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [filtered]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;
  const activeFmt = view.format ? formatById[view.format] : null;

  const anyFilter =
    !!view.format ||
    !!view.q ||
    FILTER_KINDS.some((k) => view[k].length > 0);

  const total = vm.units.length;

  return (
    <div>
      {/* Sticky search */}
      <div className="lib-toolbar">
        <label className="lib-search" htmlFor="lib-search-input">
          <SearchIcon />
          <input
            id="lib-search-input"
            type="search"
            placeholder="Search units, styles, templates, recipes, assets…"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            aria-label="Search the library"
          />
        </label>
      </div>

      {/* Format cards — the primary pivot */}
      <FormatCards
        formats={vm.formats}
        fmtCounts={vm.fmtCounts}
        total={total}
        active={view.format}
        onPick={setFormat}
      />
      {activeFmt && <p className="shelf-blurb">{activeFmt.blurb}</p>}

      {/* Matching blocks (search) */}
      {q && blockMatches.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "14px 0 0" }}>
          <span className="pivot-lead">Matching blocks</span>
          {blockMatches.map(({ kind, b }) => (
            <BlockChip key={kind + b.id} b={b} size="sm" href={`/library/b/${kind}/${b.id}`} />
          ))}
        </div>
      )}

      {/* Pivot rail */}
      <PivotRail
        view={view}
        anyFilter={anyFilter}
        blockBy={blockBy}
        blocksByKind={vm.blocksByKind}
        blockCounts={vm.blockCounts}
        onRemove={removeBlock}
        onAdd={addBlock}
        onClear={clearAll}
      />

      {/* Result bar */}
      <p className="resultbar">
        <span>
          {filtered.length} {filtered.length === 1 ? "unit" : "units"}
        </span>
        {anyFilter && (
          <button type="button" className="clear" onClick={clearAll}>
            clear
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="empty">
          <p style={{ margin: 0 }}>No units match. Loosen a filter or clear the pivot.</p>
        </div>
      ) : (
        <div className="masonry">
          {shown.map((u) => (
            <UnitTile
              key={u.id}
              u={u}
              format={formatById[u.format]}
              blockBy={blockBy}
              onRemix={() => setRemix(remixForUnit(u, formatById[u.format]))}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="sentinel" aria-hidden>
          Loading more…
        </div>
      )}

      <RemixModal payload={remix} onClose={() => setRemix(null)} />
    </div>
  );
}

// ── Tile-level Remix payload ──────────────────────────────────────────────────

function remixForUnit(u: Unit, f: Format | undefined): RemixPayload {
  const firstMedia = u.media && u.media.length > 0 ? u.media[0] : undefined;
  const thumb = firstMedia
    ? { kind: firstMedia.kind, src: mediaUrl(firstMedia) }
    : f
      ? { glyph: f.glyph }
      : undefined;
  return {
    tag: `@unit:${u.id}`,
    cli: `ralphy remix ${u.id}`,
    title: u.title,
    eyebrow: "Remix this unit",
    from: f ? `${f.label} · keeps everything you didn't touch` : undefined,
    thumb,
    swapHint:
      "say what to swap (a character, a location, the style). Ralphy reads the unit's recipe and re-runs only what your swap touches, keeping the rest pinned.",
  };
}

// ── Format cards ──────────────────────────────────────────────────────────────

function FormatCards({
  formats,
  fmtCounts,
  total,
  active,
  onPick,
}: {
  formats: Format[];
  fmtCounts: Record<FormatId, number>;
  total: number;
  active: FormatId | null;
  onPick: (id: FormatId | null) => void;
}) {
  return (
    <div className="browse">
      <div className="browse-grid nine" role="tablist" aria-label="Filter by media format">
        <button
          type="button"
          role="tab"
          aria-selected={!active}
          className={`catcard all${!active ? " active" : ""}`}
          onClick={() => onPick(null)}
        >
          <span className="gly" style={{ background: "var(--ink)", color: "var(--bg)" }}>
            ✦
          </span>
          <span>
            <span className="cc-name">All</span>
            <span className="cc-count">{total} units</span>
          </span>
        </button>
        {formats.map((f) => {
          const isActive = active === f.id;
          const hue = fhue(f.id);
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`catcard${isActive ? " active" : ""}`}
              style={isActive ? { boxShadow: `inset 0 0 0 2px ${hue}` } : undefined}
              onClick={() => onPick(isActive ? null : f.id)}
            >
              <span className="glow" style={{ background: hue }} />
              <span className="gly" style={{ background: hue }}>
                {f.glyph}
              </span>
              <span>
                <span className="cc-name">{f.label}</span>
                <span className="cc-count">{fmtCounts[f.id] ?? 0} units</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Pivot rail + add-filter popover ──────────────────────────────────────────

function PivotRail({
  view,
  anyFilter,
  blockBy,
  blocksByKind,
  blockCounts,
  onRemove,
  onAdd,
  onClear,
}: {
  view: ViewState;
  anyFilter: boolean;
  blockBy: (kind: BlockKind, id: string) => Block | undefined;
  blocksByKind: Record<BlockKind, Block[]>;
  blockCounts: Record<BlockKind, Record<string, number>>;
  onRemove: (kind: BlockKind, id: string) => void;
  onAdd: (kind: BlockKind, id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="pivot">
      <span className="pivot-lead">Pivot</span>
      {FILTER_KINDS.map((kind) =>
        view[kind].map((id) => {
          const b = blockBy(kind, id);
          if (!b) return null;
          return (
            <span className="fpill" key={kind + id}>
              <span className="fp-kind">
                {PREPO[kind]} {KIND_META[kind].label}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--block-ink)" }}>
                {blockGlyph(b)}
              </span>
              {b.name}
              <button
                type="button"
                className="fp-x"
                aria-label={`Remove ${b.name}`}
                onClick={() => onRemove(kind, id)}
              >
                <CloseIcon s={11} />
              </button>
            </span>
          );
        }),
      )}
      <AddFilterMenu
        view={view}
        blocksByKind={blocksByKind}
        blockCounts={blockCounts}
        onAdd={onAdd}
      />
      {anyFilter && (
        <button
          type="button"
          className="clear"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--vio)",
            background: "none",
            border: 0,
            cursor: "pointer",
            padding: "0 4px",
          }}
          onClick={onClear}
        >
          clear all
        </button>
      )}
    </div>
  );
}

function AddFilterMenu({
  view,
  blocksByKind,
  blockCounts,
  onAdd,
}: {
  view: ViewState;
  blocksByKind: Record<BlockKind, Block[]>;
  blockCounts: Record<BlockKind, Record<string, number>>;
  onAdd: (kind: BlockKind, id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BlockKind>("style");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const counts = blockCounts[kind] ?? {};
  const list = blocksByKind[kind].filter((b) => !view[kind].includes(b.id));

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="addfilter" onClick={() => setOpen((v) => !v)}>
        <PlusIcon /> Add filter
      </button>
      {open && (
        <div className="afmenu">
          <div className="af-kinds">
            {FILTER_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`af-kind${kind === k ? " on" : ""}`}
                onClick={() => setKind(k)}
              >
                <span className="g">{KIND_META[k].glyph}</span>
                {KIND_META[k].plural}
              </button>
            ))}
          </div>
          <div className="af-list">
            {list.map((b) => (
              <button
                key={b.id}
                type="button"
                className="af-opt"
                onClick={() => {
                  onAdd(kind, b.id);
                  setOpen(false);
                }}
              >
                <span className="bg" style={{ fontFamily: "var(--font-display)", color: "var(--block-ink)", width: 16 }}>
                  {blockGlyph(b)}
                </span>
                <span className="ao-name">{b.name}</span>
                <span className="ao-n">{counts[b.id] ?? 0} units</span>
              </button>
            ))}
            {list.length === 0 && (
              <p style={{ color: "var(--mute)", fontSize: 12.5, padding: "10px 12px", margin: 0 }}>
                All {KIND_META[kind].plural.toLowerCase()} already active.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Block chip ────────────────────────────────────────────────────────────────

function BlockChip({
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

function UnitTile({
  u,
  format,
  blockBy,
  onRemix,
}: {
  u: Unit;
  format: Format | undefined;
  blockBy: (kind: BlockKind, id: string) => Block | undefined;
  onRemix: () => void;
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
      </div>
      <div className="ubody">
        <span className="ufmt" style={{ color: format ? fhue(format.id) : undefined }}>
          <span className="dot" style={{ background: format ? fhue(format.id) : undefined }} />
          {format?.label ?? u.format}
        </span>
        <Link href={href} style={{ color: "inherit" }}>
          <h3 className="utitle">{u.title}</h3>
        </Link>
        <div className="uingredients">
          {tpl && <BlockChip b={tpl} size="sm" withKind={false} href={`/library/b/template/${tpl.id}`} title={`Template: ${tpl.name}`} />}
          {sty && <BlockChip b={sty} size="sm" withKind={false} href={`/library/b/style/${sty.id}`} title={`Style: ${sty.name}`} />}
          {recN + astN > 0 && (
            <span className="umore">
              +{recN} recipes · {astN} assets
            </span>
          )}
        </div>
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

function MediaCell({ m, alt }: { m: UnitMedia; alt: string }) {
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

function UnitMediaShape({ u, format }: { u: Unit; format: Format | undefined }) {
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
