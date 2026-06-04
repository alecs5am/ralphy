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
// (?format=&tag=&template=&recipe=&asset=&q=) — every control writes back via
// router.replace, so back/forward + pasted URLs reproduce the exact view.
// Multi-value block filters are comma-joined; all active filters AND together.
// The look / register is filtered as a TAG (?tag=), not a block (the `style`
// block kind was removed).
//
// No visible borders anywhere — separation via bg-tint + shadow + inset rings.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Block,
  BlockKind,
  Format,
  FormatId,
  Unit,
} from "@/lib/library-v2/types";
import { RemixModal } from "./_shared/RemixModal";
import type { RemixPayload } from "./_shared/types";
import { CloseIcon, PlusIcon, SearchIcon } from "./_shared/icons";
import { BlockChip, UnitCard } from "./_shared/UnitCard";
import { remixForUnit } from "./_shared/remix";
import {
  aspectRatioNum,
  blockGlyph,
  FILTER_KINDS,
  fhue,
  KIND_META,
  PREPO,
  unitTileAspect,
} from "./_shared/blockMeta";

const PAGE_SIZE = 24;

/** The plain-JSON view-model the server page hands down. */
export interface FeedViewModel {
  formats: Format[];
  units: Unit[];
  blocksByKind: Record<BlockKind, Block[]>;
  blockCounts: Record<BlockKind, Record<string, number>>;
  fmtCounts: Record<FormatId, number>;
}

// ── View state from the URL ──────────────────────────────────────────────────

interface ViewState {
  format: FormatId | null;
  q: string;
  tag: string | null;
  template: string[];
  recipe: string[];
  asset: string[];
}

function parseList(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

// ── Balanced masonry ──────────────────────────────────────────────────────────
//
// Row-major packing: each tile (in feed order) drops into the currently-shortest
// column. Heights are ESTIMATED deterministically from each unit's media aspect —
// no DOM measuring — so the pack is stable across SSR/CSR and re-filters cleanly.

/** Responsive column count, matching the prior CSS breakpoints
 *  (5 ≥1600 / 4 ≥1280 / 3 ≥820 / 2 ≥520 / 1). */
function columnsForWidth(w: number): number {
  if (w >= 1600) return 5;
  if (w >= 1280) return 4;
  if (w >= 820) return 3;
  if (w >= 520) return 2;
  return 1;
}

function useMasonryColumns(): number {
  // SSR-safe default (desktop → 5); the resize listener corrects on mount.
  const [cols, setCols] = useState(5);
  useEffect(() => {
    const update = () => setCols(columnsForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

const MASONRY_GAP = 18; // matches .masonry gap + .utile margin-bottom in CSS
const TILE_BODY_PX = 132; // fixed body chrome below the media (fmt + title + chips)

/** Estimate one tile's rendered height in px from its media aspect + the column
 *  width, so the packer can balance columns without measuring the DOM. */
function estTileHeight(u: Unit, format: Format | undefined, colWidth: number): number {
  const ratio = aspectRatioNum(unitTileAspect(u, format)); // W / H
  const mediaH = colWidth / (ratio || 0.8);
  return mediaH + TILE_BODY_PX + MASONRY_GAP;
}

// Masonry packing is incremental + stateful (see the packRef block in the
// component): each scroll-appended page folds only its new tiles into the
// existing per-column buckets, so the feed scales without re-packing the whole
// window on every append.

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
      tag: searchParams.get("tag") || null,
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
  const clearTag = useCallback(() => setParams({ tag: undefined }), [setParams]);
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
      if (view.tag && !(u.tags ?? []).includes(view.tag)) return false;
      for (const id of view.template) if (u.templateId !== id) return false;
      for (const id of view.recipe) if (!u.recipeIds.includes(id)) return false;
      for (const id of view.asset) if (!u.assetIds.includes(id)) return false;
      if (q) {
        const tpl = blockBy("template", u.templateId);
        const recN = u.recipeIds.map((r) => blockBy("recipe", r)?.name ?? "").join(" ");
        const astN = u.assetIds.map((a) => blockBy("asset", a)?.name ?? "").join(" ");
        const tagN = (u.tags ?? []).join(" ");
        const hay = `${u.title} ${u.blurb} ${u.format} ${tpl?.name ?? ""} ${recN} ${astN} ${tagN}`.toLowerCase();
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

  // ── masonry packing ─────────────────────────────────────────────────────────
  const cols = useMasonryColumns();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => setGridWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Column width = (container − gaps) / cols. Fall back to a sane width before
  // the ResizeObserver first fires so the SSR/initial pack still balances.
  // Bin to whole px so sub-pixel ResizeObserver jitter doesn't force a re-pack.
  const colWidth = Math.round(
    gridWidth > 0 ? (gridWidth - MASONRY_GAP * (cols - 1)) / cols : 280,
  );

  // Incremental masonry packing (#092): appending a page does NOT re-pack the
  // whole window. We keep the per-column buckets + running heights in a ref and
  // only fold in the units beyond what's already packed (O(delta), not O(n)).
  // Layout (cols/colWidth) or filter (`filtered` identity) change → full reset.
  // The append loop is guarded by `count`, so it stays idempotent under React
  // StrictMode's double-invoke. Result is identical to a deterministic full pack
  // (same greedy shortest-column on the same prefix order) — just cheaper.
  const packRef = useRef<{
    cols: number;
    colWidth: number;
    filtered: Unit[];
    buckets: Unit[][];
    heights: number[];
    count: number;
  } | null>(null);
  const columns = useMemo(() => {
    let st = packRef.current;
    if (!st || st.cols !== cols || st.colWidth !== colWidth || st.filtered !== filtered) {
      st = {
        cols,
        colWidth,
        filtered,
        buckets: Array.from({ length: cols }, () => []),
        heights: new Array(cols).fill(0),
        count: 0,
      };
      packRef.current = st;
    }
    for (let i = st.count; i < shown.length; i++) {
      const u = shown[i]!;
      let shortest = 0;
      for (let c = 1; c < cols; c++) if (st.heights[c]! < st.heights[shortest]!) shortest = c;
      st.buckets[shortest]!.push(u);
      st.heights[shortest]! += estTileHeight(u, formatById[u.format], colWidth);
    }
    st.count = shown.length;
    // Shallow-clone the columns so React sees new arrays to reconcile.
    return st.buckets.map((b) => b.slice());
  }, [shown, cols, colWidth, formatById, filtered]);

  const anyFilter =
    !!view.format ||
    !!view.q ||
    !!view.tag ||
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
            placeholder="Search units, templates, recipes, assets, tags…"
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
        onRemoveTag={clearTag}
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
        <div className="masonry" ref={gridRef}>
          {columns.map((colUnits, ci) => (
            <div className="mcol" key={ci}>
              {colUnits.map((u) => (
                <UnitCard
                  key={u.id}
                  u={u}
                  format={formatById[u.format]}
                  blockBy={blockBy}
                  onRemix={() => setRemix(remixForUnit(u, formatById[u.format]))}
                />
              ))}
            </div>
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
  onRemoveTag,
  onAdd,
  onClear,
}: {
  view: ViewState;
  anyFilter: boolean;
  blockBy: (kind: BlockKind, id: string) => Block | undefined;
  blocksByKind: Record<BlockKind, Block[]>;
  blockCounts: Record<BlockKind, Record<string, number>>;
  onRemove: (kind: BlockKind, id: string) => void;
  onRemoveTag: () => void;
  onAdd: (kind: BlockKind, id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="pivot">
      <span className="pivot-lead">Pivot</span>
      {view.tag && (
        <span className="fpill" key={`tag:${view.tag}`}>
          <span className="fp-kind">tagged</span>
          <span className="tagchip-hash" aria-hidden>
            #
          </span>
          {view.tag}
          <button
            type="button"
            className="fp-x"
            aria-label={`Remove tag ${view.tag}`}
            onClick={onRemoveTag}
          >
            <CloseIcon s={11} />
          </button>
        </span>
      )}
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
  // "all" is a pseudo-tab that searches across every kind at once; selecting a
  // block still applies the correct per-kind `?{kind}=` param.
  const [kind, setKind] = useState<BlockKind | "all">("all");
  const [filterQuery, setFilterQuery] = useState("");
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

  // Reset the search field whenever the menu reopens or the kind tab changes.
  useEffect(() => setFilterQuery(""), [open, kind]);

  const fq = filterQuery.trim().toLowerCase();
  // Each option carries its own kind so the "All" tab can mix kinds while still
  // applying the correct `?{kind}=` param on select.
  const list: { kind: BlockKind; b: Block }[] =
    kind === "all"
      ? FILTER_KINDS.flatMap((k) =>
          blocksByKind[k]
            .filter((b) => !view[k].includes(b.id))
            .filter((b) => !fq || b.name.toLowerCase().includes(fq))
            .map((b) => ({ kind: k, b })),
        )
      : blocksByKind[kind]
          .filter((b) => !view[kind].includes(b.id))
          .filter((b) => !fq || b.name.toLowerCase().includes(fq))
          .map((b) => ({ kind, b }));

  const scopeLabel = kind === "all" ? "blocks" : KIND_META[kind].plural.toLowerCase();

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="addfilter" onClick={() => setOpen((v) => !v)}>
        <PlusIcon /> Add filter
      </button>
      {open && (
        <div className="afmenu">
          <div className="af-kinds">
            <button
              type="button"
              className={`af-kind${kind === "all" ? " on" : ""}`}
              onClick={() => setKind("all")}
            >
              <span className="g">✦</span>
              All
            </button>
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
          <label className="af-search">
            <SearchIcon />
            <input
              type="search"
              value={filterQuery}
              placeholder={`Search ${scopeLabel}…`}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label={`Search ${scopeLabel}`}
              autoFocus
            />
          </label>
          <div className="af-list">
            {list.map(({ kind: k, b }) => (
              <button
                key={k + b.id}
                type="button"
                className="af-opt"
                onClick={() => {
                  onAdd(k, b.id);
                  setOpen(false);
                }}
              >
                <span className="bg" style={{ fontFamily: "var(--font-display)", color: "var(--block-ink)", width: 16 }}>
                  {blockGlyph(b)}
                </span>
                <span className="ao-name">{b.name}</span>
                {kind === "all" && <span className="ao-kind">{KIND_META[k].label}</span>}
                <span className="ao-n">{(blockCounts[k]?.[b.id]) ?? 0} units</span>
              </button>
            ))}
            {list.length === 0 && (
              <p style={{ color: "var(--mute)", fontSize: 12.5, padding: "10px 12px", margin: 0 }}>
                {fq
                  ? `No ${scopeLabel} match “${filterQuery.trim()}”.`
                  : `All ${scopeLabel} already active.`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
