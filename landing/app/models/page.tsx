// landing/app/models/page.tsx
//
// Models page. Renders MODELS.md from the repo root as a public,
// SEO-indexable page at /models. The same file `AGENTS.md` mandates
// reading before any model call — surfaced here so practical queries
// like "kling pricing", "seedance privacy filter", "gpt-5.4-image-2
// concurrent limit" land directly on the curated knowledge.
//
// Source of truth: ../../MODELS.md at repo root. To update content, edit
// that file — the page rebuilds on every `next build`.

import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars, site } from "@/lib/data";
import { loadModelsDoc, isStale } from "@/lib/models-loader";
import { mdxComponents } from "@/components/mdx";

const SITE_URL = "https://ralphy.dev";

export const metadata: Metadata = {
  title: "Models · Ralphy",
  description:
    "The opinionated model registry behind Ralphy renders. Image (gpt-5.4-image-2, gemini-3-pro-image-preview), video (Kling, Seedance, Veo, Sora), TTS, music, transcription — with real $/call, concurrent caps, known pitfalls. Two API keys: OpenRouter + ElevenLabs.",
  alternates: { canonical: `${SITE_URL}/models` },
  openGraph: {
    title: "Models · Ralphy",
    description:
      "Opinionated model picks behind Ralphy. Real prices, real pitfalls. One OpenRouter key + one ElevenLabs key. No FAL_KEY, no Vercel, no OpenAI direct.",
    url: `${SITE_URL}/models`,
    siteName: "Ralphy",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Models · Ralphy",
    description:
      "The model registry behind Ralphy. Real $/call, concurrent caps, known pitfalls.",
  },
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ModelsPage() {
  const stars = await getDisplayStars();
  const doc = loadModelsDoc();
  const reviewedLabel = formatDate(doc.lastReviewed);
  const stale = isStale(doc.staleDays);

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="blog-hero">
          <div className="container">
            <p className="eyebrow">
              Models · {doc.sectionCount} sections
              {reviewedLabel ? ` · reviewed ${reviewedLabel}` : null}
              {stale ? " · stale" : null}
            </p>
            <h1 className="blog-h1">
              The model picks behind every Ralphy render.
            </h1>
            <p className="blog-sub">
              Opinionated list, updated as models drift. Two API keys —{" "}
              <code>OPENROUTER_API_KEY</code> for media / LLM /
              transcription and <code>ELEVENLABS_API_KEY</code> for voice
              and music. Everything else is out of scope. The source of
              truth is{" "}
              <a
                href={`${site.repo}/blob/main/MODELS.md`}
                target="_blank"
                rel="noopener"
              >
                <code>MODELS.md</code>
              </a>{" "}
              in the repo; this page is its public mirror.
            </p>
            {stale ? (
              <p className="blog-sub" style={{ marginTop: "0.5rem" }}>
                ⚠ This snapshot is more than 30 days old. Live OpenRouter
                catalog may have drifted —{" "}
                <code>ralphy models list</code> is the runtime source of
                truth.
              </p>
            ) : null}
          </div>
        </section>

        <article className="blog-article">
          <div className="container">
            <div className="blog-body">
              <MDXRemote
                source={doc.source}
                components={mdxComponents}
                options={{
                  blockJS: false,
                  blockDangerousJS: true,
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                    rehypePlugins: [
                      [
                        rehypeHighlight,
                        { detect: true, ignoreMissing: true },
                      ],
                    ],
                  },
                }}
              />
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
