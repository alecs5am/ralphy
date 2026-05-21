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

type PageProps = { params: Promise<{ slug: string }> };

type Author = { handle: string; name?: string };

type Frontmatter = {
  title?: string;
  description?: string;
  date?: string;
  /** Single author (back-compat). Prefer `authors` for new posts. */
  author?: string;
  /** GitHub handle for single-author posts (back-compat). */
  github?: string;
  /** Multi-author byline. Each entry can be a bare handle ("alecs5am")
   *  or "Display Name|handle" if you want a different display name. */
  authors?: string[];
  /** Category chip shown at the end of the byline. */
  category?: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

// Slugs are file basenames. Refuse anything that would let us escape
// the content dir or read non-MDX files.
function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

async function readPost(slug: string): Promise<{
  source: string;
  frontmatter: Frontmatter;
} | null> {
  if (!isSafeSlug(slug)) return null;
  const file = path.join(CONTENT_DIR, `${slug}.mdx`);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  return parseFrontmatter(raw);
}

// Minimal YAML-frontmatter parser. Supports flat `key: "value"` pairs
// and `key: [..., ...]` JSON-array values — that's all blog posts need;
// reaching for `gray-matter` would pull js-yaml and a transitive tree.
function parseFrontmatter(raw: string): {
  source: string;
  frontmatter: Frontmatter;
} {
  if (!raw.startsWith("---\n")) {
    return { source: raw, frontmatter: {} };
  }
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { source: raw, frontmatter: {} };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const fm = {} as Record<string, unknown>;
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!;
    let value: string = m[2]!.trim();
    // Array — parse as JSON (handles ["a","b"], [1,2], etc).
    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        fm[key] = JSON.parse(value);
        continue;
      } catch {
        /* fall through to string */
      }
    }
    // Strip wrapping double-quotes.
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return { source: body, frontmatter: fm as Frontmatter };
}

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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) return { title: "Not found · Ralphy" };
  return {
    title: `${post.frontmatter.title ?? slug} · Ralphy`,
    description: post.frontmatter.description,
  };
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) notFound();

  const stars = await getDisplayStars();
  const date = formatDate(post.frontmatter.date);

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
                source={post.source}
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

/* Resolve frontmatter author fields into a normalized list. Supports:
 *   • New: `authors: ["alecs5am"]` (preferred) or
 *          `authors: ["Display Name|alecs5am", ...]`
 *   • Back-compat: single `github: "alecs5am"` with optional `author: "..."`
 *   Each entry resolves to { handle, name? } — handle is required for the
 *   GitHub avatar / profile link. */
function resolveAuthors(fm: Frontmatter): Author[] {
  if (Array.isArray(fm.authors) && fm.authors.length > 0) {
    return fm.authors.map((entry) => {
      const [a, b] = entry.split("|");
      if (b) return { name: a!.trim(), handle: b.trim() };
      return { handle: a!.trim() };
    });
  }
  if (fm.github) {
    return [{ handle: fm.github, name: fm.author }];
  }
  return [];
}

/* Byline — one-line author row under the H1. Modeled on the PostHog
 * masthead pattern: small avatar(s) + display name(s), then date, then
 * an optional category chip. No plate, no bg — inline editorial row. */
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
      {authors.map((a, i) => (
        <a
          key={i}
          className="blog-byline-author"
          href={`https://github.com/${a.handle}`}
          target="_blank"
          rel="noopener"
        >
          <span className="blog-byline-avatar">
            <img
              src={`https://github.com/${a.handle}.png?size=96`}
              alt={`${a.name ?? a.handle} avatar`}
            />
          </span>
          <span className="blog-byline-name">{a.name ?? a.handle}</span>
        </a>
      ))}
      {date && <span className="blog-byline-date">{date}</span>}
      {category && (
        <span className="blog-byline-category">{category}</span>
      )}
    </div>
  );
}
