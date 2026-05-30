"use client";

// Full-width, format-organized, deep-linkable, infinite-scroll discovery
// surface over the unified library index (issue 054).
//
// URL query params are the SINGLE SOURCE OF TRUTH for view state:
//   ?format=<f>&style=<general-slug>&q=<search>&tag=<tag>
// The URL drives the rendered view; every control writes back to the URL via
// router.replace (so back/forward works and a pasted URL reproduces the exact
// view). We mirror the params into local React state on read, and never hold
// state the URL doesn't reflect.
//
// Scale: the index is precomputed at build time (each item carries a lowercase
// `text` haystack), so filtering 10k+ items is a single linear scan per
// keystroke with no per-item field joins. Rendering is windowed — only the
// first N cards mount, and an IntersectionObserver sentinel reveals the next
// page as the user scrolls, so the DOM never holds more than the revealed
// slice regardless of total count.
//
// No visible borders anywhere (hard memory rule) — cards/chips separate via
// bg-tint steps + shadow + spacing.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  FORMAT_BLURBS,
  FORMAT_LABELS,
  LIBRARY_FORMATS,
  type LibraryFormat,
  type LibraryIndex,
  type LibraryItem,
} from "@/lib/library-index-types";

const PAGE_SIZE = 24;

/** Read-only view of the URL params we care about. */
interface ViewState {
  format: LibraryFormat | null;
  style: string | null;
  q: string;
  tag: string | null;
}

function parseFormat(v: string | null): LibraryFormat | null {
  if (v && (LIBRARY_FORMATS as string[]).includes(v)) return v as LibraryFormat;
  return null;
}

export function LibraryListing({ index }: { index: LibraryIndex }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL → view state. searchParams is the source of truth; this re-derives on
  // every navigation (including back/forward and pasted URLs).
  const view: ViewState = useMemo(
    () => ({
      format: parseFormat(searchParams.get("format")),
      style: searchParams.get("style") || null,
      q: searchParams.get("q") || "",
      tag: searchParams.get("tag") || null,
    }),
    [searchParams],
  );

  // Local mirror for the search box so typing is responsive; pushed to the URL
  // (debounced) which then flows back through `view`.
  const [queryDraft, setQueryDraft] = useState(view.q);
  useEffect(() => setQueryDraft(view.q), [view.q]);

  // Write a partial param patch back to the URL. `undefined` deletes a key.
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

  // Debounce search-box → URL so we don't spam history.
  useEffect(() => {
    if (queryDraft === view.q) return;
    const id = window.setTimeout(() => setParams({ q: queryDraft || undefined }), 220);
    return () => window.clearTimeout(id);
  }, [queryDraft, view.q, setParams]);

  // Full filtered set (cheap linear scan over precomputed `text` haystacks).
  const filtered = useMemo(() => {
    const q = view.q.trim().toLowerCase();
    return index.items.filter((it) => {
      if (view.format && it.format !== view.format) return false;
      if (view.style && it.styleOf !== view.style && it.slug !== view.style) return false;
      if (view.tag && !it.tags.includes(view.tag)) return false;
      if (q && !it.text.includes(q)) return false;
      return true;
    });
  }, [index.items, view.format, view.style, view.tag, view.q]);

  // The general baseline (if any) for the selected format — surfaced above the
  // style grid per the issue ("its general template + the style grid").
  const generalForFormat = useMemo(() => {
    if (!view.format) return null;
    return filtered.find((it) => it.format === view.format && it.isGeneral) ?? null;
  }, [filtered, view.format]);

  // Tag facets within the current filtered set (top by count).
  const tagFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of filtered) for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([tag, count]) => ({ tag, count }));
  }, [filtered]);

  // ---- Infinite scroll / windowing ----------------------------------------
  const [visible, setVisible] = useState(PAGE_SIZE);
  // Reset the window whenever the filtered set identity changes.
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
  const hasFilters = !!(view.format || view.style || view.q || view.tag);

  const formatChip = (active: boolean) =>
    `inline-flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-medium cursor-pointer border-0 transition-colors duration-[160ms] ${
      active ? "bg-ink text-bg" : "bg-bg-1 text-ink-3 hover:bg-bg-2 hover:text-ink"
    }`;

  const tagChip = (active: boolean) =>
    `inline-flex items-center gap-1.5 font-mono text-[12px] rounded-full px-3 py-1.5 border-0 cursor-pointer transition-colors duration-[160ms] ${
      active ? "text-bg bg-vio hover:bg-vio-2" : "text-ink-3 bg-bg-1 hover:bg-bg-2 hover:text-ink"
    }`;

  return (
    <div className="mt-2">
      {/* Search */}
      <label
        className="flex items-center gap-3.5 w-full bg-bg-1 rounded-[18px] px-[22px] py-[16px] text-mute mb-5 transition-[background] duration-[160ms] focus-within:bg-bg-2 focus-within:text-ink-3"
        htmlFor="lib-search-input"
      >
        <SearchIcon />
        <input
          id="lib-search-input"
          type="search"
          placeholder="Search templates, tags, models…"
          value={queryDraft}
          onChange={(e) => setQueryDraft(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-ink font-sans text-[17px] py-0.5 min-w-0 placeholder:text-mute-2"
          aria-label="Search the library"
        />
      </label>

      {/* Format nav — top-level taxonomy */}
      <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Filter by media format">
        <button
          type="button"
          role="tab"
          aria-selected={!view.format}
          onClick={() => setParams({ format: undefined, style: undefined })}
          className={formatChip(!view.format)}
        >
          <span>All</span>
          <span className="tabular-nums opacity-70 text-[12px]">{index.total}</span>
        </button>
        {LIBRARY_FORMATS.map((f) => {
          const count = index.formatCounts[f] ?? 0;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={view.format === f}
              onClick={() =>
                setParams({ format: view.format === f ? undefined : f, style: undefined })
              }
              className={formatChip(view.format === f)}
            >
              <span>{FORMAT_LABELS[f]}</span>
              <span className="tabular-nums opacity-70 text-[12px]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Format blurb + general baseline when a format is selected */}
      {view.format && (
        <div className="mb-4">
          <p className="text-[14px] leading-[1.55] text-ink-3 m-0 max-w-[72ch]">
            {FORMAT_BLURBS[view.format]}
          </p>
          {generalForFormat && !view.style && (
            <div className="mt-4">
              <p className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-vio m-0 mb-2">
                General baseline
              </p>
              <GeneralBaselineCard item={generalForFormat} />
            </div>
          )}
        </div>
      )}

      {/* Tag facets */}
      {tagFacets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4" aria-label="Filter by tag">
          {tagFacets.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => setParams({ tag: view.tag === tag ? undefined : tag })}
              className={tagChip(view.tag === tag)}
            >
              {tag}
              <span
                className={`text-[10.5px] tabular-nums ${view.tag === tag ? "text-black/55" : "text-mute"}`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Result count + clear */}
      <p className="flex items-center gap-3 font-mono text-[11.5px] tracking-[0.08em] uppercase text-mute m-0 mb-[18px]">
        {filtered.length} of {index.total}
        {view.style && <span className="text-vio">style of {view.style}</span>}
        {hasFilters && (
          <button
            type="button"
            className="font-mono text-[11.5px] tracking-[0.08em] uppercase text-vio bg-transparent p-0 border-0 cursor-pointer hover:text-vio-2"
            onClick={() => router.replace("/library", { scroll: false })}
          >
            clear
          </button>
        )}
      </p>

      {/* Full-width masonry grid */}
      <div className="[columns:5] [column-gap:18px] max-[1600px]:[columns:4] max-[1280px]:[columns:3] max-[900px]:[columns:2] max-[600px]:[columns:1]">
        {shown.map((it) => (
          <Card
            key={it.key}
            item={it}
            onStyleOf={
              it.isGeneral && it.source === "template"
                ? () => setParams({ style: it.slug })
                : undefined
            }
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="px-5 py-12 bg-bg-1 rounded-[18px] text-center text-mute">
          <p className="m-0 text-[14px]">No matches. Try a different format, tag, or clear the filters.</p>
        </div>
      )}

      {/* Infinite-scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="h-16 flex items-center justify-center" aria-hidden>
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-mute-2">
            Loading more…
          </span>
        </div>
      )}
    </div>
  );
}

/** The format's general baseline, shown as a wide banner card above the grid. */
function GeneralBaselineCard({ item }: { item: LibraryItem }) {
  const inner = (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <h3 className="font-display text-[18px] leading-[1.15] m-0 font-semibold text-ink tracking-[-0.01em]">
          {item.name}
        </h3>
        {item.tagline && (
          <p className="text-[13px] leading-[1.45] text-ink-3 m-0 mt-1 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]">
            {item.tagline}
          </p>
        )}
      </div>
      <CopyTagInline tag={item.tag} />
    </div>
  );
  const cls =
    "block bg-bg-1 rounded-[16px] no-underline text-inherit shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[background] duration-[180ms] hover:bg-bg-2";
  return item.href.kind === "external" ? (
    <a href={item.href.url} target="_blank" rel="noopener" className={cls}>{inner}</a>
  ) : (
    <Link href={item.href.url} className={cls}>{inner}</Link>
  );
}

function Card({ item, onStyleOf }: { item: LibraryItem; onStyleOf?: () => void }) {
  const inner = (
    <>
      <div
        className="relative w-full overflow-hidden rounded-[20px]"
        style={item.cover ? ({ aspectRatio: item.cover.aspect } as React.CSSProperties) : { aspectRatio: "4 / 5" }}
      >
        {item.cover ? (
          item.cover.kind === "video" ? (
            <video
              src={item.cover.src}
              poster={item.cover.poster}
              className="block w-full h-full object-cover [object-position:center_30%] bg-[#050506] transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.025]"
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
            />
          ) : (
            <Image
              src={item.cover.src}
              alt={item.cover.alt}
              fill
              className="block w-full h-full object-cover [object-position:center_30%] bg-[#050506] transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.025]"
              sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, (max-width: 1280px) 33vw, 20vw"
            />
          )
        ) : (
          <div className="w-full h-full grid place-items-center bg-[linear-gradient(135deg,var(--color-bg-2)_0%,var(--color-bg-3)_100%)]" aria-hidden>
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-mute-2">
              {item.format ?? "template"}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-4">
        <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-vio">
          {item.format ? FORMAT_LABELS[item.format] : item.source}
          {item.styleOf && <span className="text-mute"> · style of {item.styleOf}</span>}
        </span>
        <h2 className="font-display text-[19px] leading-[1.12] m-0 font-semibold text-ink tracking-[-0.01em]">{item.name}</h2>
        {item.tagline && (
          <p className="text-[13px] leading-[1.5] text-ink-3 m-0 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">{item.tagline}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-1">
          <code className="font-mono text-[11.5px] text-vio-2 bg-[color-mix(in_srgb,var(--color-vio)_12%,transparent)] px-[9px] py-[3px] rounded-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.tag}</code>
          {item.models.length > 0 && (
            <ul className="flex flex-nowrap gap-1.5 list-none p-0 m-0 shrink-0">
              {item.models.slice(0, 1).map((m) => (
                <li key={m} className="font-mono text-[11px] text-ink-3 bg-bg-2 px-[9px] py-[3px] rounded-full whitespace-nowrap group-hover/card:bg-bg-3">{m.split("/")[1] ?? m}</li>
              ))}
              {item.models.length > 1 && (
                <li className="font-mono text-[11px] text-mute bg-bg-2 px-[9px] py-[3px] rounded-full whitespace-nowrap group-hover/card:bg-bg-3">+{item.models.length - 1}</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  const cardClass =
    "group/card block break-inside-avoid mb-[18px] bg-bg-1 rounded-[20px] no-underline text-inherit shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[background,transform,box-shadow] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-bg-2 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(0_0_0/0.3)]";

  // The card itself navigates to the detail / source; the copy-tag button and
  // the optional "view styles" affordance sit on top without nesting controls
  // inside the anchor (which is invalid + breaks click target).
  return (
    <div className={`${cardClass} relative`}>
      {item.href.kind === "external" ? (
        <a href={item.href.url} target="_blank" rel="noopener" className="block no-underline text-inherit">{inner}</a>
      ) : (
        <Link href={item.href.url} className="block no-underline text-inherit">{inner}</Link>
      )}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <CopyTagInline tag={item.tag} />
        {onStyleOf && (
          <button
            type="button"
            onClick={onStyleOf}
            className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-ink-3 bg-bg-2/90 backdrop-blur-sm px-2.5 py-1 rounded-full border-0 cursor-pointer transition-colors hover:bg-bg-3 hover:text-ink"
          >
            View styles
          </button>
        )}
      </div>
    </div>
  );
}

/** Compact one-click copy-tag button. Copies the reproduce tag for the item
 * (e.g. `@template:<slug>` / `@guideline:<slug>`) — the exact string the
 * Ralphy agent consumes via AGENTS.md routing. */
function CopyTagInline({ tag }: { tag: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(tag);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = tag;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch {
          /* swallow */
        }
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    },
    [tag],
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Copy ${tag} to clipboard`}
      title={`Copy ${tag}`}
      className={`inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] uppercase px-2.5 py-1 rounded-full border-0 cursor-pointer backdrop-blur-sm transition-colors duration-[160ms] [&_svg]:block ${
        copied
          ? "text-vio bg-[color-mix(in_srgb,var(--color-vio)_22%,transparent)]"
          : "text-ink-3 bg-bg-2/90 hover:text-vio hover:bg-bg-3"
      }`}
    >
      {copied ? (
        <>
          <CheckIcon />
          Copied
        </>
      ) : (
        <>
          <CopyIcon />
          Copy tag
        </>
      )}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="3.5" y="1.5" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 4v7.5A1.5 1.5 0 0 0 3.5 13H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
