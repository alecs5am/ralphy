"use client";

// Library home listing (redesign) — a Pinterest-style masonry of every
// template, organized by format, with a browse-by-format card row that doubles
// as the filter, plus search. Cards are per-format logical components (sticker
// 2×2 peek, carousel stacked deck, FB 2×2 matrix, hover-play video, image
// still, designed fallback). A hover Remix button opens the shared modal.
//
// URL query params remain the SINGLE SOURCE OF TRUTH for view state
// (?format=&style=&q=&tag=) — every control writes back via router.replace, so
// back/forward + pasted URLs reproduce the exact view. Rendering is windowed:
// an IntersectionObserver sentinel reveals the next page on scroll.
//
// No visible borders anywhere — cards/chips separate via bg-tint + shadow.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FORMAT_BLURBS,
  FORMAT_GLYPHS,
  FORMAT_HUE_VARS,
  FORMAT_LABELS,
  LIBRARY_FORMATS,
  type LibraryFormat,
  type LibraryIndex,
  type LibraryItem,
} from "@/lib/library-index-types";
import { RemixModal } from "./_shared/RemixModal";
import type { RemixPayload } from "./_shared/types";
import { RemixIcon, SearchIcon } from "./_shared/icons";

const PAGE_SIZE = 24;

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

function hueVar(f?: LibraryFormat): string | undefined {
  return f ? `var(${FORMAT_HUE_VARS[f]})` : undefined;
}

function remixForItem(item: LibraryItem): RemixPayload {
  return {
    tag: item.tag,
    cli: item.cliCmd,
    title: item.name,
    eyebrow: "Remix this template",
    thumb: item.cover
      ? { kind: item.cover.kind, src: item.cover.src }
      : item.format
        ? { glyph: FORMAT_GLYPHS[item.format] }
        : undefined,
    swapHint: "e.g. “reproduce this, but swap the brand for mine.” Ralphy rebuilds it from your refs, re-running only what the swap touches.",
  };
}

export function LibraryListing({ index }: { index: LibraryIndex }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [remix, setRemix] = useState<RemixPayload | null>(null);

  const view: ViewState = useMemo(
    () => ({
      format: parseFormat(searchParams.get("format")),
      style: searchParams.get("style") || null,
      q: searchParams.get("q") || "",
      tag: searchParams.get("tag") || null,
    }),
    [searchParams],
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

  useEffect(() => {
    if (queryDraft === view.q) return;
    const id = window.setTimeout(() => setParams({ q: queryDraft || undefined }), 220);
    return () => window.clearTimeout(id);
  }, [queryDraft, view.q, setParams]);

  const filtered = useMemo(() => {
    const q = view.q.trim().toLowerCase();
    const list = index.items.filter((it) => {
      if (view.format && it.format !== view.format) return false;
      if (view.style && it.styleOf !== view.style && it.slug !== view.style) return false;
      if (view.tag && !it.tags.includes(view.tag)) return false;
      if (q && !it.text.includes(q)) return false;
      return true;
    });
    // Strong covers first, then index order (general → alphabetical).
    return list.slice().sort((a, b) => (a.cover ? 0 : 1) - (b.cover ? 0 : 1));
  }, [index.items, view.format, view.style, view.tag, view.q]);

  // ---- windowing ----------------------------------------------------------
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [filtered]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;
  const hasFilters = !!(view.format || view.style || view.q || view.tag);

  return (
    <div>
      {/* Search */}
      <div className="lib-toolbar">
        <label className="lib-search" htmlFor="lib-search-input">
          <SearchIcon />
          <input
            id="lib-search-input"
            type="search"
            placeholder="Search templates, tags, models…"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            aria-label="Search the library"
          />
        </label>
      </div>

      {/* Browse-by-format strip — doubles as the format filter */}
      <div className="browse">
        <div className="browse-grid" role="tablist" aria-label="Filter by media format">
          <button
            type="button"
            role="tab"
            aria-selected={!view.format}
            className={`catcard all${!view.format ? " active" : ""}`}
            onClick={() => setParams({ format: undefined, style: undefined, tag: undefined })}
          >
            <span className="gly" style={{ background: "var(--ink)", color: "var(--bg)" }}>
              ✦
            </span>
            <span>
              <span className="cc-name">All</span>
              <span className="cc-count">{index.total} templates</span>
            </span>
          </button>
          {LIBRARY_FORMATS.map((f) => {
            const active = view.format === f;
            const hue = `var(${FORMAT_HUE_VARS[f]})`;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                className={`catcard${active ? " active" : ""}`}
                style={active ? { boxShadow: `inset 0 0 0 2px ${hue}` } : undefined}
                onClick={() => setParams({ format: active ? undefined : f, style: undefined, tag: undefined })}
              >
                <span className="glow" style={{ background: hue }} />
                <span className="gly" style={{ background: hue }}>
                  {FORMAT_GLYPHS[f]}
                </span>
                <span>
                  <span className="cc-name">{FORMAT_LABELS[f]}</span>
                  <span className="cc-count">{index.formatCounts[f] ?? 0} templates</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {view.format && <p className="shelf-blurb">{FORMAT_BLURBS[view.format]}</p>}

      {/* Result bar */}
      <p className="resultbar">
        <span>
          {filtered.length} {filtered.length === 1 ? "template" : "templates"}
        </span>
        {view.style && <span style={{ color: "var(--vio)" }}>style of {view.style}</span>}
        {hasFilters && (
          <button type="button" className="clear" onClick={() => router.replace("/library", { scroll: false })}>
            clear
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="empty">
          <p style={{ margin: 0 }}>No matches. Try a different format, tag, or clear the filters.</p>
        </div>
      ) : (
        <div className="masonry">
          {shown.map((it) => (
            <Card key={it.key} item={it} onRemix={() => setRemix(remixForItem(it))} />
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

/* ── Looping preview video — always autoplays, muted, looped ──────── */
function LoopVideo({ src }: { src: string }) {
  return (
    <video
      src={`${src}#t=0.1`}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      disablePictureInPicture
    />
  );
}

/* ── Designed fallback cover ──────────────────────────────────────── */
const FALLBACK_GRAD: Record<string, [string, string]> = {
  video: ["#1b2342", "#0d1020"],
  image: ["#2a2140", "#120e1f"],
  carousel: ["#10303a", "#0a191e"],
  "fb-creative": ["#3a1c2c", "#1c0e16"],
  "motion-design": ["#143a2e", "#0a1d17"],
  poster: ["#3a2a14", "#1d150a"],
  "sticker-pack": ["#2c1438", "#160a1c"],
};
const FALLBACK_ASPECT: Record<string, string> = {
  video: "9 / 16",
  image: "1 / 1",
  carousel: "4 / 5",
  "fb-creative": "1 / 1",
  "motion-design": "16 / 9",
  poster: "4 / 5",
  "sticker-pack": "1 / 1",
};

function FallbackCover({ format, name }: { format?: LibraryFormat; name: string }) {
  const glyph = format ? FORMAT_GLYPHS[format] : "◆";
  const [from, to] = (format && FALLBACK_GRAD[format]) || ["#222226", "#0e0e10"];
  return (
    <div className="fallback" style={{ background: `linear-gradient(150deg, ${from}, ${to})` }} aria-hidden>
      <span className="bgly">{glyph}</span>
      <div className="inner">
        <span className="chip">{glyph}</span>
        <span className="fl-fmt">{format ? FORMAT_LABELS[format] : "template"}</span>
        <span className="fl-name">{name}</span>
      </div>
    </div>
  );
}

/* ── Per-format card media (the "logical components") ─────────────── */
function CardMedia({ item }: { item: LibraryItem }) {
  const f = item.format;
  const glyph = f ? FORMAT_GLYPHS[f] : "◆";
  const count = item.preview?.count ?? 0;
  const srcs = item.preview?.srcs ?? [];

  // Sticker pack → 2×2 die-cut peek on checker.
  if (f === "sticker-pack" && srcs.length > 0) {
    const four = srcs.slice(0, 4);
    return (
      <div className="card-media checker" style={{ aspectRatio: "1 / 1" }}>
        <div className="sticker-peek" style={{ position: "absolute", inset: 0 }}>
          {four.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <span key={i} className="sp">
              <img src={s} alt="" loading="lazy" />
            </span>
          ))}
        </div>
        <span className="badge br dark">✺ {count} stickers</span>
      </div>
    );
  }

  // FB matrix → 2×2 creative peek.
  if (f === "fb-creative" && srcs.length > 0) {
    const four = srcs.slice(0, 4);
    return (
      <div className="card-media" style={{ aspectRatio: "1 / 1" }}>
        <div className="fb-peek" style={{ position: "absolute", inset: 0 }}>
          {four.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <span key={i} className="fp">
              <img src={s} alt="" loading="lazy" />
            </span>
          ))}
        </div>
        <span className="badge br dark">❤ {count} creatives</span>
      </div>
    );
  }

  // Carousel → stacked deck peek above the front cover.
  if (f === "carousel" && item.cover) {
    return (
      <div className="card-media" style={{ background: "transparent" }}>
        <div className="deck">
          <span className="deck-l l2" />
          <span className="deck-l l1" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="deck-front" src={item.cover.src} alt={item.name} loading="lazy" />
          <span className="badge br dark">❯ {count || "—"} slides</span>
        </div>
      </div>
    );
  }

  // No real cover → designed fallback.
  if (!item.cover) {
    return (
      <div className="card-media" style={{ aspectRatio: (f && FALLBACK_ASPECT[f]) || "4 / 5" }}>
        <FallbackCover format={f} name={item.name} />
      </div>
    );
  }

  // Video cover → hover-play.
  if (item.cover.kind === "video") {
    return (
      <div className="card-media" style={{ aspectRatio: item.cover.aspect }}>
        <LoopVideo src={item.cover.src} />
        <span className="badge tl dark">
          {glyph} {f ? FORMAT_LABELS[f] : "Video"}
        </span>
      </div>
    );
  }

  // Image / poster still.
  return (
    <div className="card-media" style={{ aspectRatio: item.cover.aspect }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.cover.src} alt={item.name} loading="lazy" />
    </div>
  );
}

function Card({ item, onRemix }: { item: LibraryItem; onRemix: () => void }) {
  const f = item.format;
  const model = item.models[0] ? item.models[0].split("/")[1] || item.models[0] : null;
  const inner = (
    <>
      <CardMedia item={item} />
      <div className="card-body">
        <span className="card-flabel" style={{ color: hueVar(f) }}>
          <span className="dot" style={{ background: hueVar(f) }} />
          {f ? FORMAT_LABELS[f] : item.source}
          {item.preview && item.preview.count > 0 && (
            <span style={{ color: "var(--mute)" }}>
              {" · "}
              {item.preview.count} {item.preview.count === 1 ? "example" : "examples"}
            </span>
          )}
        </span>
        <h3 className="card-name">{item.name}</h3>
        {item.tagline && <p className="card-tagline">{item.tagline}</p>}
        {model && (
          <div className="card-foot">
            <span className="modelchip">{model}</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="card">
      {item.href.kind === "external" ? (
        <a href={item.href.url} target="_blank" rel="noopener" style={{ display: "block", color: "inherit" }}>
          {inner}
        </a>
      ) : (
        <Link href={item.href.url} style={{ display: "block", color: "inherit" }}>
          {inner}
        </Link>
      )}
      <button
        type="button"
        className="card-remix"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemix();
        }}
      >
        <RemixIcon /> Remix
      </button>
    </div>
  );
}
