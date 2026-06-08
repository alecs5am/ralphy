// landing/app/library/page.tsx
//
// Library v2 — the Units feed (front door). Server Component: builds the v2
// view-model from the `library-v2` data adapter (the committed static catalog
// by default; Supabase only when the anon-key env is set, so SSG works today)
// and hands it as plain JSON to the client `LibraryListing`, which owns the
// URL-param-driven filter state, the format/pivot navigation, and the windowed
// infinite scroll.
//
// The old library was a grid of templates organized by format; this is a feed
// of finished UNITS, with the reusable building blocks (templates, styles,
// recipes, assets) living behind each unit as swappable ingredients and as
// filters.

import type { Metadata } from "next";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, siteUrl } from "@/lib/site";
import { getDisplayStars } from "@/lib/data";
import {
  counts,
  fmtCounts,
  getBlocks,
  getFormats,
  getUnits,
} from "@/lib/library-v2/source";
import type { BlockKind } from "@/lib/library-v2/types";
import { LibraryListing } from "./LibraryListing";
import type { FeedViewModel } from "./LibraryListing";

const LIBRARY_DESCRIPTION =
  "Everything Ralphy made — a feed of finished units (videos, carousels, sticker packs, podcast cuts, ad sets, posters). Open any one to see the ingredients that built it — a template, a style, its recipes and assets — and swap any single block to remix it. Deep-linkable, searchable, infinite-scroll.";

export const metadata: Metadata = {
  title: "Library",
  description: LIBRARY_DESCRIPTION,
  alternates: { canonical: "/library" },
  openGraph: {
    title: "Ralphy Library · Everything Ralphy made",
    description: LIBRARY_DESCRIPTION,
    url: siteUrl("library"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ralphy Library · Everything Ralphy made",
    description: LIBRARY_DESCRIPTION,
  },
};

const BLOCK_KINDS: BlockKind[] = ["template", "recipe", "asset"];

export default async function LibraryPage() {
  // Build the v2 view-model. All reads go through the async adapter; on the
  // open-source default it resolves the committed static catalog synchronously
  // under the hood, so this stays SSG-friendly.
  const [stars, formats, units, fmtCount] = await Promise.all([
    getDisplayStars(),
    getFormats(),
    getUnits(),
    fmtCounts(),
  ]);

  // Every block, grouped by kind, plus the per-block unit counts (for the
  // add-filter menu badges) and the per-format counts (for the format cards).
  const blocksByKind = Object.fromEntries(
    await Promise.all(
      BLOCK_KINDS.map(async (k) => [k, await getBlocks(k)] as const),
    ),
  ) as FeedViewModel["blocksByKind"];

  const blockCounts = Object.fromEntries(
    await Promise.all(
      BLOCK_KINDS.map(async (k) => [k, await counts(k)] as const),
    ),
  ) as FeedViewModel["blockCounts"];

  // Tag-cloud facet (#093): distinct unit tags + counts, derived from the loaded
  // units so it matches whatever source resolved them (static catalog or live
  // Supabase). Sorted count-desc then tag-asc for a stable, deterministic cloud.
  const tagCounts = new Map<string, number>();
  for (const u of units) {
    for (const t of u.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const vm: FeedViewModel = {
    formats,
    units,
    blocksByKind,
    blockCounts,
    fmtCounts: fmtCount,
    tags,
  };

  // ItemList of the feed (capped) so search engines understand /library as a
  // curated collection of named items pointing at their detail pages — the
  // structured-data signal that helps the flagship page rank for the units it
  // hosts. BreadcrumbList gives the Home › Library trail in the SERP.
  const itemListElements = units.slice(0, 60).map((u, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: siteUrl(`library/u/${u.id}`),
    name: u.title,
  }));

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Ralphy Library",
            description: LIBRARY_DESCRIPTION,
            url: siteUrl("library"),
            isPartOf: { "@type": "WebSite", url: SITE_URL, name: "Ralphy" },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: units.length,
              itemListElement: itemListElements,
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              {
                "@type": "ListItem",
                position: 2,
                name: "Library",
                item: siteUrl("library"),
              },
            ],
          },
        ]}
      />
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="lib-hero">
          <div className="container container-w-1760">
            <p className="lib-eyebrow">Library · {units.length} units</p>
            <h1 className="lib-title">
              Everything Ralphy
              <br />
              made. <span className="acc">Remix the recipe.</span>
            </h1>
            <p className="lib-sub">
              A feed of <strong>finished units</strong> — videos, carousels,
              sticker packs, podcast cuts, ad sets, posters. Open any one to see
              the <strong>ingredients</strong> that built it — a template, a
              style, its recipes and assets — and swap any single block to make
              it yours.
            </p>
          </div>
        </section>

        <section className="pt-0 pb-24">
          <div className="container container-w-1760">
            <Suspense fallback={<ListingSkeleton total={units.length} />}>
              <LibraryListing vm={vm} />
            </Suspense>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

/** SSR fallback while the URL-param-aware client listing hydrates. Required
 * because `useSearchParams` must sit inside a Suspense boundary in the App
 * Router. */
function ListingSkeleton({ total }: { total: number }) {
  return (
    <div>
      <div className="lib-toolbar">
        <div className="lib-search" aria-hidden style={{ height: 58 }} />
      </div>
      <p className="resultbar">{total} units</p>
      <div className="masonry">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="break-inside-avoid mb-[18px] bg-bg-1 rounded-[20px] h-[280px]" aria-hidden />
        ))}
      </div>
    </div>
  );
}
