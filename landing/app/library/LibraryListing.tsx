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

  return (
    <div className="lib-listing">
      <label className="lib-search" htmlFor="lib-search-input">
        <SearchIcon />
        <input
          id="lib-search-input"
          type="search"
          placeholder="Search prompts, tags, models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="lib-search-input"
          aria-label="Search the prompt library"
        />
      </label>

      <div className="lib-chiprow" role="tablist" aria-label="Filter by media kind">
        {GROUP_CHIPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={`lib-chip ${group === g.id ? "is-active" : ""}`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {tagFacets.length > 0 && (
        <div className="lib-tagrow" aria-label="Filter by tag">
          {tagFacets.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`lib-tagchip ${activeTag === tag ? "is-active" : ""}`}
            >
              {tag}
              <span className="lib-tagchip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      <p className="lib-result-count">
        {filtered.length} of {entries.length}
        {(query || activeTag || group !== "all") && (
          <button
            type="button"
            className="lib-clear"
            onClick={() => { setQuery(""); setActiveTag(null); setGroup("all"); }}
          >
            clear
          </button>
        )}
      </p>

      <div className="lib-grid">
        {filtered.map((g) => (
          <Card key={`${g.kind}:${g.slug}`} entry={g} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="lib-empty">
          <p>No matches. Try a different tag or clear the filters.</p>
        </div>
      )}
    </div>
  );
}

function Card({ entry }: { entry: LibraryEntry }) {
  const inner = (
    <>
      <div
        className="lib-card-cover"
        style={entry.cover ? ({ aspectRatio: entry.cover.aspect } as React.CSSProperties) : undefined}
      >
        {entry.cover ? (
          entry.cover.kind === "video" ? (
            <video
              src={entry.cover.src}
              poster={entry.cover.poster}
              className="lib-card-cover-media"
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
              className="lib-card-cover-media"
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
            />
          )
        ) : (
          <div className="lib-card-cover-empty" aria-hidden />
        )}
      </div>
      <div className="lib-card-body">
        <span className="lib-card-kicker">{entry.cta.label}</span>
        <h2 className="lib-card-title">{entry.name}</h2>
        {entry.tagline && <p className="lib-card-line">{entry.tagline}</p>}
        <div className="lib-card-footer">
          <code className="lib-card-tag">{entry.tag}</code>
          {entry.models.length > 0 && (
            <ul className="lib-card-models">
              {entry.models.slice(0, 1).map((m) => (
                <li key={m} className="lib-pill">{m.split("/")[1] ?? m}</li>
              ))}
              {entry.models.length > 1 && (
                <li className="lib-pill lib-pill-more">+{entry.models.length - 1}</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  return entry.href.kind === "external" ? (
    <a href={entry.href.url} target="_blank" rel="noopener" className="lib-card">{inner}</a>
  ) : (
    <Link href={entry.href.url} className="lib-card">{inner}</Link>
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
