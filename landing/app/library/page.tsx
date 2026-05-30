// landing/app/library/page.tsx
//
// The library — the primary, format-organized content discovery surface
// (issue 054). Server Component: builds the unified library index at build
// time (templates + guidelines + showcase clips) and hands it to the client
// `LibraryListing`, which owns URL-param-driven filtering, format navigation,
// and infinite scroll.
//
// `/templates` now redirects here — one discovery surface, no overlap.

import type { Metadata } from "next";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { buildLibraryIndex } from "@/lib/library-index";
import { LibraryListing } from "./LibraryListing";

export const metadata: Metadata = {
  title: "Library · Ralphy",
  description:
    "The format-organized template library — browse video, image, carousel, FB-creative, motion-design, poster, and sticker-pack templates. Copy a tag, reproduce any template with your own brief and refs. Deep-linkable, searchable, infinite-scroll.",
};

export default async function LibraryPage() {
  const stars = await getDisplayStars();
  const index = buildLibraryIndex();

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="lib-hero">
          <div className="container container-w-1760">
            <p className="lib-eyebrow">Library · {index.total} templates</p>
            <h1 className="lib-title">
              See what Ralphy
              <br />
              makes. <span className="acc">Remix it.</span>
            </h1>
            <p className="lib-sub">
              Every result Ralphy can produce, organized by <strong>format</strong>{" "}
              — video, image, carousel, FB creative, motion design, poster,
              sticker pack. Open any template to browse the full set of outputs
              in detail, then hit <strong>Remix</strong> to reproduce it with
              your own brief and refs. Looking for the technical / craft
              capabilities instead? That&apos;s the{" "}
              <a href="/skills">skills</a> page.
            </p>
          </div>
        </section>

        <section className="pt-0 pb-24">
          <div className="container container-w-1760">
            <Suspense fallback={<ListingSkeleton total={index.total} />}>
              <LibraryListing index={index} />
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
      <p className="resultbar">{total} templates</p>
      <div className="masonry">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="break-inside-avoid mb-[18px] bg-bg-1 rounded-[20px] h-[280px]" aria-hidden />
        ))}
      </div>
    </div>
  );
}
