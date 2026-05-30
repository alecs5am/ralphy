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
import {
  templateShowcaseAsFull,
  listShowcaseTemplateSlugs,
  listAllTemplateSlugs,
  templateFormat,
} from "@/lib/showcase-loader";
import { KIND_LABELS } from "@/lib/library-types";
import { mdxComponents } from "@/components/mdx";
import { MediaPlayer } from "@/components/MediaPlayer";
import { CopyTagButton } from "./CopyTagButton";
import { ExamplesGrid } from "./ExamplesGrid";
import { TemplateShowcase } from "./TemplateShowcase";

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
  ]);
  return Array.from(slugs).map((slug) => ({ slug }));
}

// Resolve a detail-page entry: a guideline / showcase clip first, else a
// template that has a hosted showcase gallery (issue 055).
function resolveEntry(slug: string) {
  return loadGuideline(slug) ?? templateShowcaseAsFull(slug);
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

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="pt-24 pb-8 max-[900px]:pt-[72px] max-[900px]:pb-4">
          <div className="container">
            <div
              className={`grid gap-12 items-start max-[900px]:grid-cols-1 max-[900px]:gap-7 ${
                g.cover
                  ? "[grid-template-columns:minmax(280px,0.85fr)_minmax(0,1.15fr)]"
                  : "grid-cols-1"
              }`}
            >
              {g.cover && (
                <div className="min-w-0">
                  <div className="lib-hero-media-sticky">
                    <MediaPlayer
                      kind={g.cover.kind}
                      src={g.cover.src}
                      poster={g.cover.poster}
                      aspect={g.cover.aspect}
                      alt={g.cover.alt}
                      autoPlay={g.cover.kind === "video"}
                      defaultMuted
                    />
                  </div>
                </div>
              )}
              <div className="min-w-0 [&_code]:[overflow-wrap:anywhere] [&_code]:break-words">
                <p className="eyebrow">
                  <Link href="/library" className="text-mute no-underline hover:text-vio">Library</Link>
                  {" · "}{KIND_LABELS[g.kind]}
                  {g.version && <> · v{g.version}</>}
                </p>
                <h1 className="font-display text-[clamp(40px,4.6vw,64px)] leading-[1.04] tracking-[-0.015em] font-semibold text-ink mt-3 mb-3.5">{g.name}</h1>
                {g.tagline && <p className="text-[clamp(17px,1.4vw,20px)] leading-[1.5] text-ink-3 m-0 mb-1 max-w-[60ch]">{g.tagline}</p>}
                {g.models.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 list-none p-0 mt-[18px] mb-0">
                    {g.models.map((m) => (
                      <li key={m} className="font-mono text-[11px] text-ink-3 bg-bg-2 px-[9px] py-[3px] rounded-full whitespace-nowrap">{m}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-6 flex flex-col gap-2.5 max-w-[640px]">
                  <CopyTagButton tag={g.cta.tag} label={g.cta.label} />
                  <p className="m-0 text-[13.5px] leading-[1.55] text-mute">
                    Paste in Claude Code / Cursor / Codex — the agent runs{" "}
                    <code className="font-mono text-[12.5px] text-ink-3 bg-bg-2 px-[7px] py-0.5 rounded-full">{g.cta.hintCmd}</code>{" "}
                    {isRemix
                      ? "and scaffolds a project pre-loaded with the template's prompts, refs, and composition. You bring the brief."
                      : "and loads the recipe before drafting the next prompt."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Per-template results gallery, driven by the template's `format`
            through a component registry (issue 060): video/poster/image grids,
            campaign-grouped fb-creative, expandable sticker packs, swipeable
            carousels. Renders nothing when the template has no hosted media. */}
        <TemplateShowcase slug={g.slug} format={templateFormat(g.slug)} />

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

        {isRemix ? (
          <section className="pt-14 pb-24">
            <div className="container container-narrow">
              <h2 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.06] m-0 mb-2 font-semibold text-ink tracking-[-0.01em]">How to remix</h2>
              <p className="text-[16px] leading-[1.55] text-ink-3 m-0 mb-6 max-w-[64ch]">
                The template is the full reproduction kit — scenario JSON,
                prompt cookbook, asset slots, and the composition. You bring
                the new brief and the agent assembles a fresh project.
              </p>
              <ol className="m-0 pl-[22px] flex flex-col gap-2.5 text-[14.5px] leading-[1.55] text-ink-2 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-ink-2 [&_code]:bg-bg-2 [&_code]:px-[7px] [&_code]:py-0.5 [&_code]:rounded-md [&_code]:[overflow-wrap:anywhere] [&_code]:break-words">
                <li>
                  <strong>Open Claude Code / Cursor / Codex</strong> inside a
                  ralphy-installed repo. New machine?{" "}
                  <code>curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh</code>
                </li>
                <li>
                  <strong>Paste the tag</strong>{" "}
                  <code>{g.cta.tag}</code> into chat — your agent picks it
                  up via AGENTS.md routing and reads the template via{" "}
                  <code>{g.cta.hintCmd}</code>.
                </li>
                <li>
                  <strong>Name your swap.</strong> &ldquo;Same video, but
                  replace the narrator with my mascot&rdquo; / &ldquo;swap the
                  product for mine.&rdquo; Everything else stays; the agent
                  re-runs only what the swap touches, then renders your version.
                </li>
                <li>
                  <strong>Iterate.</strong>{" "}
                  <code>ralphy generate image --slot &lt;name&gt; …</code> for
                  scene regens; <code>ralphy render &lt;id&gt;</code> for
                  the final mp4.
                </li>
              </ol>
              <p className="mt-10 px-[18px] py-4 bg-bg-1 rounded-[14px] text-[14px] leading-[1.5] text-ink-3 [&_code]:[overflow-wrap:anywhere] [&_code]:break-words">
                Browse the template source on{" "}
                <a
                  href={g.sourcePath}
                  target="_blank"
                  rel="noopener"
                  className="text-vio no-underline hover:text-vio-2 hover:underline"
                >
                  GitHub
                </a>{" "}
                — composition.md, prompt-library.md, asset-manifest.json.
              </p>
            </div>
          </section>
        ) : (
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
