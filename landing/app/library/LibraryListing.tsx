"use client";

// Client-side filter + search bar over the library entries.
// Entries are computed at build time (loader is server-side); this component
// owns the filter/search state and renders the masonry grid.
//
// Filters keep state in `useState`, not URL params — the list is small enough
// that "shareable filter URLs" doesn't carry its weight. We can lift to URL
// state later if a category becomes a destination.

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LibraryEntry } from "@/lib/library-types";
import { KIND_GROUPS } from "@/lib/library-types";

type GroupFilter = "all" | "image" | "video";

const GROUP_CHIPS: Array<{ id: GroupFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

export function LibraryListing({ entries }: { entries: LibraryEntry[] }) {
  const [group, setGroup] = useState<GroupFilter>("all");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  /* Collect tag set across all entries for the chip row. Sorted by count desc
   * so the most relevant tags surface first. Cap at 16 for visual budget. */
  const tagFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 16)
      .map(([tag, count]) => ({ tag, count }));
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (group !== "all" && KIND_GROUPS[e.kind] !== group) return false;
      if (activeTag && !e.tags.includes(activeTag)) return false;
      if (!q) return true;
      const hay = [e.name, e.tagline ?? "", e.slug, ...e.tags, ...e.models].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [entries, group, query, activeTag]);

  const chip = (active: boolean) =>
    `font-sans text-[14px] font-medium rounded-full px-[18px] py-[9px] border-0 cursor-pointer transition-colors duration-[180ms] ${
      active
        ? "text-bg bg-vio font-semibold hover:bg-vio-2"
        : "text-ink-3 bg-bg-1 hover:bg-bg-2 hover:text-ink"
    }`;

  const tagChip = (active: boolean) =>
    `inline-flex items-center gap-2 font-mono text-[12px] rounded-full px-3 py-1.5 border-0 cursor-pointer transition-colors duration-[180ms] ${
      active ? "text-bg bg-vio hover:bg-vio-2" : "text-ink-3 bg-bg-1 hover:bg-bg-2 hover:text-ink"
    }`;

  return (
    <div className="mt-7">
      <label
        className="flex items-center gap-3.5 w-full bg-bg-1 rounded-[18px] px-[22px] py-[18px] text-mute mb-4 transition-[background] duration-[180ms] focus-within:bg-bg-2 focus-within:text-ink-3"
        htmlFor="lib-search-input"
      >
        <SearchIcon />
        <input
          id="lib-search-input"
          type="search"
          placeholder="Search prompts, tags, models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-ink font-sans text-[17px] py-0.5 min-w-0 placeholder:text-mute-2"
          aria-label="Search the prompt library"
        />
      </label>

      <div className="flex flex-wrap gap-2 mb-2.5" role="tablist" aria-label="Filter by media kind">
        {GROUP_CHIPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={chip(group === g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      {tagFacets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-[18px]" aria-label="Filter by tag">
          {tagFacets.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={tagChip(activeTag === tag)}
            >
              {tag}
              <span
                className={`text-[10.5px] tabular-nums ${activeTag === tag ? "text-black/55" : "text-mute"}`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="flex items-center gap-3 font-mono text-[11.5px] tracking-[0.08em] uppercase text-mute m-0 mb-[18px]">
        {filtered.length} of {entries.length}
        {(query || activeTag || group !== "all") && (
          <button
            type="button"
            className="font-mono text-[11.5px] tracking-[0.08em] uppercase text-vio bg-transparent p-0 border-0 cursor-pointer hover:text-vio-2"
            onClick={() => { setQuery(""); setActiveTag(null); setGroup("all"); }}
          >
            clear
          </button>
        )}
      </p>

      <div className="[columns:3] [column-gap:18px] mt-0 max-[1100px]:[columns:2] max-[640px]:[columns:1]">
        {filtered.map((g) => (
          <Card key={`${g.kind}:${g.slug}`} entry={g} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="px-5 py-12 bg-bg-1 rounded-[18px] text-center text-mute">
          <p className="m-0 text-[14px]">No matches. Try a different tag or clear the filters.</p>
        </div>
      )}
    </div>
  );
}

function Card({ entry }: { entry: LibraryEntry }) {
  const inner = (
    <>
      <div
        className="relative w-full overflow-hidden rounded-[20px]"
        style={entry.cover ? ({ aspectRatio: entry.cover.aspect } as React.CSSProperties) : undefined}
      >
        {entry.cover ? (
          entry.cover.kind === "video" ? (
            <video
              src={entry.cover.src}
              poster={entry.cover.poster}
              className="block w-full h-full object-cover [object-position:center_30%] bg-[#050506] transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.025]"
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
            />
          ) : (
            <Image
              src={entry.cover.src}
              alt={entry.cover.alt}
              fill
              className="block w-full h-full object-cover [object-position:center_30%] bg-[#050506] transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.025]"
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
            />
          )
        ) : (
          <div className="w-full h-full bg-[linear-gradient(135deg,var(--color-bg-2)_0%,var(--color-bg-3)_100%)]" aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-4">
        <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-vio">{entry.cta.label}</span>
        <h2 className="font-display text-[20px] leading-[1.12] m-0 font-semibold text-ink tracking-[-0.01em]">{entry.name}</h2>
        {entry.tagline && (
          <p className="text-[13.5px] leading-[1.5] text-ink-3 m-0 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">{entry.tagline}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-1">
          <code className="font-mono text-[11.5px] text-vio-2 bg-[color-mix(in_srgb,var(--color-vio)_12%,transparent)] px-[9px] py-[3px] rounded-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{entry.tag}</code>
          {entry.models.length > 0 && (
            <ul className="flex flex-nowrap gap-1.5 list-none p-0 m-0 shrink-0">
              {entry.models.slice(0, 1).map((m) => (
                <li key={m} className="font-mono text-[11px] text-ink-3 bg-bg-2 px-[9px] py-[3px] rounded-full whitespace-nowrap group-hover/card:bg-bg-3">{m.split("/")[1] ?? m}</li>
              ))}
              {entry.models.length > 1 && (
                <li className="font-mono text-[11px] text-mute bg-bg-2 px-[9px] py-[3px] rounded-full whitespace-nowrap group-hover/card:bg-bg-3">+{entry.models.length - 1}</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  const cardClass =
    "group/card block break-inside-avoid mb-[18px] bg-bg-1 rounded-[20px] no-underline text-inherit transition-[background,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-bg-2 hover:-translate-y-0.5";

  return entry.href.kind === "external" ? (
    <a href={entry.href.url} target="_blank" rel="noopener" className={cardClass}>{inner}</a>
  ) : (
    <Link href={entry.href.url} className={cardClass}>{inner}</Link>
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
