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
import { KIND_LABELS } from "@/lib/library-types";
import { mdxComponents } from "@/components/mdx";
import { MediaPlayer } from "@/components/MediaPlayer";
import { CopyTagButton } from "./CopyTagButton";
import { ExamplesGrid } from "./ExamplesGrid";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listGuidelineSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const g = loadGuideline(slug);
  if (!g) return { title: "Library · Ralphy" };
  return {
    title: `${g.name} · Ralphy library`,
    description: g.tagline || g.description || `Library entry · ${KIND_LABELS[g.kind]}.`,
  };
}

const REPO_BASE = "https://github.com/alecs5am/ralphy/blob/main/";

export default async function GuidelinePage({ params }: PageProps) {
  const { slug } = await params;
  const g = loadGuideline(slug);
  if (!g) notFound();

  const stars = await getDisplayStars();
  const isRemix = g.kind === "recreate-video";

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="lib-hero">
          <div className="container">
            <div className={`lib-hero-split ${g.cover ? "" : "lib-hero-split-textonly"}`}>
              {g.cover && (
                <div className="lib-hero-media">
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
              <div className="lib-hero-content">
                <p className="eyebrow">
                  <Link href="/library" className="lib-back-link">Library</Link>
                  {" · "}{KIND_LABELS[g.kind]}
                  {g.version && <> · v{g.version}</>}
                </p>
                <h1 className="lib-hero-h1">{g.name}</h1>
                {g.tagline && <p className="lib-hero-tagline">{g.tagline}</p>}
                {g.models.length > 0 && (
                  <ul className="lib-card-models lib-models-hero">
                    {g.models.map((m) => (
                      <li key={m} className="lib-pill">{m}</li>
                    ))}
                  </ul>
                )}
                <div className="lib-cta-wrap">
                  <CopyTagButton tag={g.cta.tag} label={g.cta.label} />
                  <p className="lib-cta-hint">
                    Paste in Claude Code / Cursor / Codex — the agent runs{" "}
                    <code>{g.cta.hintCmd}</code>{" "}
                    {isRemix
                      ? "and scaffolds a project pre-loaded with the template's prompts, refs, and composition. You bring the brief."
                      : "and loads the recipe before drafting the next prompt."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {g.examples.length > 0 && (
          <section className="lib-examples">
            <div className="container">
              <h2 className="lib-section-h2">Examples</h2>
              <p className="lib-section-sub">
                Generated with prompts written from these rules. Click any
                tile to open it full-size.
              </p>
              <ExamplesGrid examples={g.examples} />
            </div>
          </section>
        )}

        {isRemix ? (
          <section className="lib-body-section">
            <div className="container container-narrow">
              <h2 className="lib-section-h2">How to remix</h2>
              <p className="lib-section-sub">
                The template is the full reproduction kit — scenario JSON,
                prompt cookbook, asset slots, and the composition. You bring
                the new brief and the agent assembles a fresh project.
              </p>
              <ol className="skill-how-list lib-remix-steps">
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
                  <strong>Hand it your brief.</strong> Subject, brand,
                  audience, deviation from the reference. The agent fills the
                  template&apos;s slots, generates fresh assets, and renders.
                </li>
                <li>
                  <strong>Iterate.</strong>{" "}
                  <code>ralphy generate image --slot &lt;name&gt; …</code> for
                  scene regens; <code>ralphy render &lt;id&gt;</code> for
                  the final mp4.
                </li>
              </ol>
              <p className="lib-origin">
                Browse the template source on{" "}
                <a
                  href={g.sourcePath}
                  target="_blank"
                  rel="noopener"
                  className="lib-inline-link"
                >
                  GitHub
                </a>{" "}
                — composition.md, prompt-library.md, asset-manifest.json.
              </p>
            </div>
          </section>
        ) : (
          <section className="lib-body-section">
            <div className="container container-narrow">
              <h2 className="lib-section-h2">The guideline</h2>
              <p className="lib-section-sub">
                This is what your agent reads. Source on{" "}
                <a
                  href={`${REPO_BASE}${g.sourcePath}/guideline.md`}
                  target="_blank"
                  rel="noopener"
                  className="lib-inline-link"
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
                <p className="lib-origin">
                  Reusable patterns covered:{" "}
                  {g.patterns.map((p, i) => (
                    <span key={p}>
                      <code className="lib-inline-code">{p}</code>
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
