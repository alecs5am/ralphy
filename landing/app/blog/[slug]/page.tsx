// landing/app/blog/[slug]/page.tsx
//
// Slug-addressable blog. MDX files live in landing/content/blog/<slug>.mdx
// — drop a file there and the article is reachable at /blog/<slug>. No
// index page; this is intentionally link-only for the first iteration.
// Missing slug → Next's notFound() (404 page).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { mdxComponents } from "@/components/mdx";
import { getDisplayStars } from "@/lib/data";
import {
  type Author,
  formatDate,
  readPost,
  resolveAuthors,
} from "@/lib/blog";
import { loadModelsDoc } from "@/lib/models-loader";

/**
 * Some blog posts inject content from elsewhere in the repo (MODELS.md,
 * docs, etc.) so the MDX file stays tiny while the body comes from the
 * actual source-of-truth. Marker → loader.
 */
const INJECTIONS: Record<string, () => string> = {
  "{/* MODELS_REGISTRY_INJECT */}": () => loadModelsDoc().source,
};

function expandInjections(source: string): string {
  let out = source;
  for (const [marker, load] of Object.entries(INJECTIONS)) {
    if (out.includes(marker)) {
      out = out.replace(marker, load());
    }
  }
  return out;
}

type PageProps = { params: Promise<{ slug: string }> };

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export async function generateStaticParams() {
  let entries: string[];
  try {
    entries = await fs.readdir(CONTENT_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => ({ slug: f.replace(/\.mdx$/, "") }));
}

/* Canonical site origin. Override per-env with NEXT_PUBLIC_SITE_URL
 * (Vercel sets that automatically for preview builds via
 * VERCEL_URL — wired through next.config). Falls back to the
 * production domain so the og:url tag is always populated. */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  "https://www.alecs5am.com";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) return { title: "Not found · Ralphy" };
  const title = post.frontmatter.title ?? slug;
  const description = post.frontmatter.description;
  const url = `${SITE_URL.replace(/\/+$/, "")}/blog/${slug}`;
  return {
    title: `${title} · Ralphy`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Ralphy",
      type: "article",
      publishedTime: post.frontmatter.date,
      authors: resolveAuthors(post.frontmatter).map((a) => a.name),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) notFound();

  const stars = await getDisplayStars();
  const date = formatDate(post.frontmatter.date);
  const expandedSource = expandInjections(post.source);

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <article className="blog-article">
          <div className="container">
            <header className="blog-header">
              {post.frontmatter.title && (
                <h1 className="blog-title">{post.frontmatter.title}</h1>
              )}
              <Byline
                authors={resolveAuthors(post.frontmatter)}
                date={date}
                category={post.frontmatter.category}
              />
            </header>

            <div className="blog-body">
              <MDXRemote
                source={expandedSource}
                components={mdxComponents}
                options={{
                  // next-mdx-remote v6 defaults `blockJS: true` which strips
                  // every JSX attribute expression — e.g. items={[…]} becomes
                  // undefined. Our MDX is checked into the repo, not user
                  // input, so the JS-injection threat model doesn't apply.
                  // Keep dangerous-JS guard on (blocks eval / Function ctor /
                  // require, etc.) but allow normal expressions through.
                  blockJS: false,
                  blockDangerousJS: true,
                  mdxOptions: {
                    // GFM gives us markdown tables, strikethrough, autolinks,
                    // and task lists — all standard for technical writing.
                    remarkPlugins: [remarkGfm],
                    // Server-side syntax highlighting via highlight.js. We
                    // ship one tinted theme in globals.css under .hljs-*; no
                    // runtime cost, no client bundle.
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

/* Byline — one-line author row under the H1. Avatar(s) + display
 * name(s), then date, then an optional category chip. If an author has
 * a valid handle we render the avatar + a link to the GitHub profile;
 * otherwise we render initials in a coloured disc and skip the link. */
function Byline({
  authors,
  date,
  category,
}: {
  authors: Author[];
  date: string | null;
  category?: string;
}) {
  if (authors.length === 0 && !date && !category) return null;
  return (
    <div className="blog-byline">
      {authors.map((a, i) => {
        const initials = a.name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("");
        const avatar = (
          <span className="blog-byline-avatar">
            <span className="blog-byline-initials" aria-hidden>
              {initials}
            </span>
            {a.handle && (
              <img
                src={`https://github.com/${a.handle}.png?size=96`}
                alt=""
              />
            )}
          </span>
        );
        const inner = (
          <>
            {avatar}
            <span className="blog-byline-name">{a.name}</span>
          </>
        );
        return a.handle ? (
          <a
            key={i}
            className="blog-byline-author"
            href={`https://github.com/${a.handle}`}
            target="_blank"
            rel="noopener"
          >
            {inner}
          </a>
        ) : (
          <span key={i} className="blog-byline-author is-static">
            {inner}
          </span>
        );
      })}
      {date && <span className="blog-byline-date">{date}</span>}
      {category && (
        <span className="blog-byline-category">{category}</span>
      )}
    </div>
  );
}
