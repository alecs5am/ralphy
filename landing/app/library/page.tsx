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
        <section className="pt-24 pb-7">
          <div className="container container-w-1760">
            <p className="eyebrow font-mono text-[11.5px] tracking-[0.16em] uppercase text-vio mb-[18px]">
              Library · {index.total}
            </p>
            <h1 className="font-display font-bold text-[clamp(36px,5.2vw,64px)] tracking-[-0.015em] leading-[1.02] uppercase m-0 mb-[22px] max-w-[22ch]">
              The template library.
            </h1>
            <p className="text-[16.5px] leading-[1.55] text-ink-3 m-0 mb-0 max-w-[72ch] [&_strong]:text-ink [&_strong]:font-semibold">
              Every reusable piece of content know-how, organized by{" "}
              <strong>format</strong> — video, image, carousel, FB creative,
              motion design, poster, sticker pack. Pick a format to see its
              general baseline and the styles under it. Copy a template&apos;s
              tag (<code>@template:&lt;slug&gt;</code>), paste it into your agent,
              and say what to swap — Ralphy reproduces it with your own brief and
              refs. Looking for the technical / craft capabilities instead?
              That&apos;s the{" "}
              <a href="/skills" className="text-vio no-underline hover:text-vio-2 hover:underline">
                skills
              </a>{" "}
              page.
            </p>
          </div>
        </section>

        <section className="pt-2 pb-24">
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
    <div className="mt-2">
      <div className="w-full bg-bg-1 rounded-[18px] h-[58px] mb-5" aria-hidden />
      <p className="font-mono text-[11.5px] tracking-[0.08em] uppercase text-mute m-0 mb-[18px]">
        {total} templates
      </p>
      <div className="[columns:5] [column-gap:18px] max-[1600px]:[columns:4] max-[1280px]:[columns:3] max-[900px]:[columns:2] max-[600px]:[columns:1]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="break-inside-avoid mb-[18px] bg-bg-1 rounded-[20px] h-[280px]"
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
