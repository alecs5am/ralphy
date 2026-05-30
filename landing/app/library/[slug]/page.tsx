// landing/app/library/[slug]/page.tsx
//
// Library detail page. Two branches based on `kind`:
//   - image-prompt   render the guideline.md body + examples grid
//   - recreate-video render the video hero + remix steps + GitHub link
// Same hero / CTA / metadata shell either way.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { loadGuideline, listGuidelineSlugs } from "@/lib/guidelines-loader";
import { showcaseClipAsFull, listShowcaseSlugs } from "@/lib/library-clips";
import {
  templateShowcaseAsFull,
  listShowcaseTemplateSlugs,
  listAllTemplateSlugs,
  templateFormat,
  loadShowcase,
} from "@/lib/showcase-loader";
import { KIND_LABELS } from "@/lib/library-types";
import {
  FORMAT_HUE_VARS,
  FORMAT_LABELS,
  LIBRARY_FORMATS,
  type LibraryFormat,
} from "@/lib/library-index-types";
import { mdxComponents } from "@/components/mdx";
import { MediaPlayer } from "@/components/MediaPlayer";
import { ExamplesGrid } from "./ExamplesGrid";
import { TemplateShowcase } from "./TemplateShowcase";
import { DetailMeta } from "./DetailMeta";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  // Every template gets its own detail page (issue 060 — cards link internally,
  // never to GitHub). Guideline folders + showcase clips supply the rest. The
  // union covers ALL template slugs ∪ guideline slugs ∪ showcase-clip slugs so
  // no library card ever resolves to a 404.
  const slugs = new Set([
    ...listAllTemplateSlugs(),
    ...listShowcaseTemplateSlugs(),
    ...listGuidelineSlugs(),
    ...listShowcaseSlugs(),
  ]);
  return Array.from(slugs).map((slug) => ({ slug }));
}

// Resolve a detail-page entry: a guideline, else a template with a hosted
// showcase gallery (issue 055), else a homepage showcase clip (so the kept
// unique clips — glitter-cream, nothing-hp1 — have a working detail page).
function resolveEntry(slug: string) {
  return loadGuideline(slug) ?? templateShowcaseAsFull(slug) ?? showcaseClipAsFull(slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const g = resolveEntry(slug);
  if (!g) return { title: "Library · Ralphy" };
  return {
    title: `${g.name} · Ralphy library`,
    description: g.tagline || g.description || `Library entry · ${KIND_LABELS[g.kind]}.`,
  };
}

const REPO_BASE = "https://github.com/alecs5am/ralphy/blob/main/";

export default async function GuidelinePage({ params }: PageProps) {
  const { slug } = await params;
  const g = resolveEntry(slug);
  if (!g) notFound();

  const stars = await getDisplayStars();
  const isRemix = g.kind === "recreate-video";

  // Format identity for the hero (breadcrumb hue, label dot, glyph). Prefer the
  // template's declared format; fall back to the guideline kind for image-prompt
  // / recreate-video guidelines that have no template.yaml.
  const fmtRaw = templateFormat(g.slug) ?? (g.kind === "image-prompt" ? "image" : "video");
  const fmt = (LIBRARY_FORMATS as string[]).includes(fmtRaw) ? (fmtRaw as LibraryFormat) : undefined;
  const fmtLabel = fmt ? FORMAT_LABELS[fmt] : KIND_LABELS[g.kind];
  const fmtHue = fmt ? `var(${FORMAT_HUE_VARS[fmt]})` : "var(--vio)";
  const outputCount = loadShowcase(g.slug).length;
  const isSticker = fmt === "sticker-pack";

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="detail-top">
          <div className="container container-w-1760">
            <p className="breadcrumb">
              <Link href="/library">Library</Link>
              <span className="sep">/</span>
              <Link href={fmt ? `/library?format=${fmt}` : "/library"} style={{ color: fmtHue }}>
                {fmtLabel}
              </Link>
            </p>
            <div className={`detail-hero${g.cover ? "" : " nomedia"}`}>
              {g.cover && (
                <div className="detail-media">
                  {isSticker ? (
                    <div className="sticker-stage sticker-checker">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.cover.src} alt={g.name} />
                    </div>
                  ) : (
                    <MediaPlayer
                      kind={g.cover.kind}
                      src={g.cover.src}
                      poster={g.cover.poster}
                      aspect={g.cover.aspect}
                      alt={g.cover.alt}
                      autoPlay={g.cover.kind === "video"}
                      defaultMuted
                    />
                  )}
                </div>
              )}
              <DetailMeta
                name={g.name}
                tagline={g.tagline}
                formatLabel={fmtLabel}
                hue={fmtHue}
                count={outputCount}
                models={g.models}
                tag={g.cta.tag}
                cli={g.cta.hintCmd}
              />
            </div>
          </div>
        </section>

        {/* Per-template results gallery, driven by the template's `format`:
            video/poster/image grids, FB angle-tabs, sticker accordion, swipe
            carousel modal. Renders nothing when there's no hosted media. */}
        <TemplateShowcase slug={g.slug} name={g.name} format={templateFormat(g.slug)} />

        {g.examples.length > 0 && (
          <section className="pt-6 pb-4">
            <div className="container">
              <h2 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.06] m-0 mb-2 font-semibold text-ink tracking-[-0.01em]">Examples</h2>
              <p className="text-[16px] leading-[1.55] text-ink-3 m-0 mb-6 max-w-[64ch]">
                Generated with prompts written from these rules. Click any
                tile to open it full-size.
              </p>
              <ExamplesGrid examples={g.examples} />
            </div>
          </section>
        )}

        {/* Remix templates: the hero CTA + the on-demand "Details, models & how it
            works" disclosure in <DetailMeta> now carry the remix instructions, so
            the old standalone "How to remix" section is gone. Image-prompt
            guidelines still render their full rule body below. */}
        {!isRemix && (
          <section className="pt-14 pb-24">
            <div className="container container-narrow">
              <h2 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.06] m-0 mb-2 font-semibold text-ink tracking-[-0.01em]">The guideline</h2>
              <p className="text-[16px] leading-[1.55] text-ink-3 m-0 mb-6 max-w-[64ch]">
                This is what your agent reads. Source on{" "}
                <a
                  href={`${REPO_BASE}${g.sourcePath}/guideline.md`}
                  target="_blank"
                  rel="noopener"
                  className="text-vio no-underline hover:text-vio-2 hover:underline"
                >
                  GitHub
                </a>
                .
              </p>
              <div className="blog-body lib-body">
                <MDXRemote
                  source={g.body}
                  components={mdxComponents}
                  options={{
                    parseFrontmatter: false,
                    mdxOptions: {
                      remarkPlugins: [remarkGfm],
                      rehypePlugins: [[rehypeHighlight, { detect: true, ignoreMissing: true }]],
                    },
                  }}
                />
              </div>

              {g.patterns.length > 0 && (
                <p className="mt-10 px-[18px] py-4 bg-bg-1 rounded-[14px] text-[14px] leading-[1.5] text-ink-3">
                  Reusable patterns covered:{" "}
                  {g.patterns.map((p, i) => (
                    <span key={p}>
                      <code className="font-mono text-[12.5px] bg-bg-2 px-[7px] py-0.5 rounded-full text-ink">{p}</code>
                      {i < g.patterns.length - 1 ? " · " : null}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
